"""
Proxy Engine — The Heart of the True Firewall

Receives LLM API requests, classifies the prompt, and either:
  (a) Forwards to the real LLM API and streams response back
  (b) Blocks and returns 403 + threat report

The LLM API is NEVER called for blocked requests.
"""

import logging
import json
import os
import time
from typing import Optional
from datetime import datetime, timezone
import httpx

from src.db import mongo
from src.layers.pipeline import request_custom_canary, request_id_var

logger = logging.getLogger("llm_firewall.proxy")


# ── Prompt Extractors ─────────────────────────────────────────

def _collect_text(value) -> list[str]:
    """Collect text-bearing values from provider message/tool structures."""
    fragments: list[str] = []
    if isinstance(value, str):
        if value.strip():
            fragments.append(value)
    elif isinstance(value, list):
        for item in value:
            fragments.extend(_collect_text(item))
    elif isinstance(value, dict):
        # Explicit text fields are common to OpenAI/Anthropic content blocks.
        for key in ("text", "content", "parts", "response", "functionResponse",
                    "functionCall", "arguments", "args", "output", "tool_calls"):
            if key in value:
                fragments.extend(_collect_text(value[key]))
    return fragments


def _collect_text(value) -> list[str]:
    """Collect text from provider message/content/tool result structures."""
    fragments: list[str] = []
    if isinstance(value, str):
        if value.strip():
            fragments.append(value)
    elif isinstance(value, list):
        for item in value:
            fragments.extend(_collect_text(item))
    elif isinstance(value, dict):
        # Only inspect known text-bearing fields to avoid serializing arbitrary metadata.
        for key in (
            "text", "content", "parts", "functionResponse", "functionCall",
            "arguments", "args", "input", "response", "output", "tool_calls", "result", "query", "url", "command", "code", "path", "search_query"
        ):
            if key in value:
                fragments.extend(_collect_text(value[key]))
    return fragments


def extract_openai_prompt(body: dict) -> Optional[str]:
    """Inspect untrusted conversation content while excluding trusted system instructions."""
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        return None
    fragments: list[str] = []
    for message in messages:
        if not isinstance(message, dict):
            continue
        # System/developer messages are trusted configuration and may contain the
        # configured canary by design. They must not trigger input-canary detection.
        role = str(message.get("role", "")).lower()
        if role in {"system", "developer"}:
            continue
        fragments.extend(_collect_text(message.get("content", "")))
        # Tool arguments can be attacker-controlled and can carry injection payloads.
        fragments.extend(_collect_text(message.get("tool_calls", [])))
    text = "\\n".join(fragments).strip()
    return text or None


def extract_gemini_prompt(body: dict) -> Optional[str]:
    """Inspect Gemini contents/parts; systemInstruction is trusted configuration."""
    contents = body.get("contents")
    if not isinstance(contents, list) or not contents:
        return None
    fragments: list[str] = []
    for content in contents:
        if isinstance(content, dict):
            fragments.extend(_collect_text(content.get("parts", [])))
    text = "\\n".join(fragments).strip()
    return text or None


def extract_anthropic_prompt(body: dict) -> Optional[str]:
    """Inspect Anthropic messages and tool-result blocks, excluding top-level system text."""
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        return None
    fragments: list[str] = []
    for message in messages:
        if isinstance(message, dict):
            role = str(message.get("role", "")).lower()
            if role in {"system", "developer"}:
                continue
            fragments.extend(_collect_text(message.get("content", "")))
            fragments.extend(_collect_text(message.get("tool_calls", [])))
    text = "\\n".join(fragments).strip()
    return text or None


# ── Provider Configuration ────────────────────────────────────

PROVIDERS = {
    "openai": {
        "base_url": "https://api.openai.com/v1/chat/completions",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
        "extract_prompt": extract_openai_prompt,
        "content_type": "application/json",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        "auth_header": "x-goog-api-key",
        "auth_prefix": "",
        "extract_prompt": extract_gemini_prompt,
        "content_type": "application/json",
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com/v1/messages",
        "auth_header": "x-api-key",
        "auth_prefix": "",
        "extract_prompt": extract_anthropic_prompt,
        "content_type": "application/json",
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1/chat/completions",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
        "extract_prompt": extract_openai_prompt,
        "content_type": "application/json",
    },
}


# ── Output Extraction Helpers ─────────────────────────────────

def extract_text_from_response_json(data: dict, provider: str) -> Optional[str]:
    """Extract text from a successful non-streaming response dictionary."""
    try:
        if provider in ("openai", "groq"):
            return data["choices"][0]["message"]["content"]
        elif provider == "gemini":
            return data["candidates"][0]["content"]["parts"][0]["text"]
        elif provider == "anthropic":
            return data["content"][0]["text"]
    except Exception:
        pass
    return None


def generic_extract_text(data) -> str:
    """Recursively search and extract text fields as fallback."""
    if isinstance(data, str):
        return data
    elif isinstance(data, list):
        return " ".join([generic_extract_text(item) for item in data])
    elif isinstance(data, dict):
        for key in ["content", "text", "completion"]:
            if key in data and isinstance(data[key], str):
                return data[key]
        parts = []
        for v in data.values():
            val = generic_extract_text(v)
            if val:
                parts.append(val)
        return " ".join(parts)
    return ""


def extract_text_from_stream_buffer(chunks: list[bytes], provider: str) -> str:
    """Parse SSE or NDJSON chunks to extract natural text response."""
    full_text = []
    buffer = b"".join(chunks).decode("utf-8", errors="ignore")
    
    for line in buffer.split("\n"):
        line = line.strip()
        if not line:
            continue
        if line.startswith("data:"):
            data_str = line[5:].strip()
            if data_str == "[DONE]":
                continue
            try:
                data_json = json.loads(data_str)
                if provider in ("openai", "groq"):
                    choices = data_json.get("choices", [])
                    if choices:
                        delta = choices[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            full_text.append(content)
                elif provider == "anthropic":
                    event_type = data_json.get("type")
                    if event_type == "content_block_delta":
                        delta = data_json.get("delta", {})
                        if delta.get("type") == "text_delta":
                            full_text.append(delta.get("text", ""))
                    elif event_type == "completion":
                        full_text.append(data_json.get("completion", ""))
                elif provider == "gemini":
                    candidates = data_json.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            full_text.append(parts[0].get("text", ""))
            except Exception:
                pass
        else:
            try:
                data_json = json.loads(line)
                choices = data_json.get("choices", [])
                if choices:
                    delta = choices[0].get("delta", {})
                    content = delta.get("content", "")
                    if content:
                        full_text.append(content)
                candidates = data_json.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        full_text.append(parts[0].get("text", ""))
            except Exception:
                pass
                
    return "".join(full_text)


class ProxyEngine:
    """
    HTTP proxy engine that sits between the client and LLM APIs.
    """

    def __init__(self, pipeline, output_monitor=None, timeout: float = 30.0):
        self.pipeline = pipeline
        self.output_monitor = output_monitor
        self.timeout = timeout
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout, connect=10.0),
            follow_redirects=False,
        )

    async def close(self):
        await self._client.aclose()

    def get_provider_config(self, provider: str) -> Optional[dict]:
        return PROVIDERS.get(provider)

    def extract_prompt(self, provider: str, body: dict) -> Optional[str]:
        """Extract the user prompt from a provider-specific request body."""
        config = self.get_provider_config(provider)
        if not config:
            return None
        extractor = config["extract_prompt"]
        return extractor(body)

    async def forward_request(
        self,
        provider: str,
        body: dict,
        llm_api_key: str,
        stream: bool = False,
    ) -> httpx.Response:
        """
        Forward the request to the actual LLM provider.
        Runs output monitor on LLM responses if enabled.
        """
        config = self.get_provider_config(provider)
        if not config:
            raise ValueError(f"Unsupported provider: {provider}")

        url = config["base_url"]

        # Handle Gemini model-specific URL
        if provider == "gemini":
            model = body.get("model", "gemini-pro")
            if model not in ["gemini-pro", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-ultra", "gemini-1.5-pro-latest", "gemini-1.5-flash-latest"]:
                raise ValueError("Invalid Gemini model specified")
            url = url.format(model=model)
            if stream:
                url = url.replace(":generateContent", ":streamGenerateContent") + "?alt=sse"

        # Build headers
        headers = {"Content-Type": config["content_type"]}
        headers[config["auth_header"]] = f"{config['auth_prefix']}{llm_api_key}"

        if provider == "anthropic":
            headers["anthropic-version"] = "2023-06-01"

        output_monitoring_enabled = os.getenv("OUTPUT_MONITORING_ENABLED", "true").lower() == "true"

        # If output monitor is disabled or we don't have one, proceed as normal
        if not output_monitoring_enabled or not self.output_monitor:
            if stream:
                return await self._client.send(
                    self._client.build_request("POST", url, json=body, headers=headers),
                    stream=True,
                )
            else:
                return await self._client.post(url, json=body, headers=headers)

        # ── Output Monitoring Enabled Case ──────────────────────────────────────
        custom_canary = request_custom_canary.get()
        req_id = request_id_var.get()

        async def log_blocked_output(output_result):
            if not req_id:
                return
            try:
                await mongo.get_logs_collection().update_one(
                    {"request_id": req_id},
                    {
                        "$set": {
                            "safe": False,
                            "blocked": True,
                            "risk_score": output_result.score,
                            "attack_type": output_result.reason,
                            "confidence": output_result.score,
                            "flagged_layer": "output_monitor",
                            "flagged_pattern": output_result.reason,
                            "layers.output_monitor": {
                                "ran": True,
                                "triggered": True,
                                "reason": output_result.reason,
                                "score": output_result.score,
                                "latency_ms": output_result.latency_ms
                            }
                        }
                    }
                )
            except Exception as e:
                logger.error(f"Failed to log output monitor block: {e}")

        def get_blocked_response(output_result):
            mock_content = json.dumps({
                "error": "response_blocked",
                "reason": output_result.reason,
                "firewall_report": {
                    "blocked_at": "output",
                    "reason": output_result.reason,
                    "score": output_result.score,
                    "latency_ms": output_result.latency_ms
                }
            }).encode('utf-8')
            return httpx.Response(
                status_code=403,
                content=mock_content,
                headers={"content-type": "application/json"}
            )

        if stream:
            # Security boundary: buffer the complete successful response before exposing
            # any bytes. Inspecting after each yield can leak an unsafe prefix before a
            # later chunk reveals the violation.
            real_response = await self._client.send(
                self._client.build_request("POST", url, json=body, headers=headers),
                stream=True,
            )
            if real_response.status_code != 200:
                return real_response

            chunks: list[bytes] = []
            total_bytes = 0
            max_bytes = 8 * 1024 * 1024
            try:
                async for chunk in real_response.aiter_bytes():
                    total_bytes += len(chunk)
                    if total_bytes > max_bytes:
                        await real_response.aclose()
                        return httpx.Response(
                            status_code=502,
                            content=json.dumps({
                                "error": "response_too_large_to_inspect",
                                "limit_bytes": max_bytes,
                            }).encode("utf-8"),
                            headers={"content-type": "application/json"},
                            request=real_response.request,
                        )
                    chunks.append(chunk)
            except Exception:
                await real_response.aclose()
                raise

            response_bytes = b"".join(chunks)
            response_text = extract_text_from_stream_buffer(chunks, provider)
            output_result = self.output_monitor.check(
                response_text, custom_canary=custom_canary
            )
            if output_result.flagged:
                await log_blocked_output(output_result)
                await real_response.aclose()
                return get_blocked_response(output_result)

            # Return a buffered response; the route may stream these already-inspected
            # bytes to its caller, preserving the provider's event-stream framing.
            headers_out = {
                key: value for key, value in real_response.headers.items()
                if key.lower() not in (
                    "content-length", "transfer-encoding", "content-encoding"
                )
            }
            response_out = httpx.Response(
                status_code=real_response.status_code,
                headers=headers_out,
                content=response_bytes,
                request=real_response.request,
            )
            await real_response.aclose()
            return response_out
        else:
            real_response = await self._client.post(url, json=body, headers=headers)
            if real_response.status_code != 200:
                return real_response

            try:
                response_data = real_response.json()
            except Exception:
                return real_response

            response_text = extract_text_from_response_json(response_data, provider)
            if not response_text:
                response_text = generic_extract_text(response_data)

            output_result = self.output_monitor.check(response_text, custom_canary=custom_canary)

            if output_result.flagged:
                await log_blocked_output(output_result)
                return get_blocked_response(output_result)

            return real_response

    async def stream_response(self, response: httpx.Response):
        """Yield only bytes from a response already inspected by forward_request."""
        async for chunk in response.aiter_bytes():
            yield chunk
