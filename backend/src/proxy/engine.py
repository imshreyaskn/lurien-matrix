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

def extract_openai_prompt(body: dict) -> Optional[str]:
    """Extract prompt from OpenAI/Groq chat completions format."""
    try:
        messages = body.get("messages", [])
        if not messages:
            return None
        last_msg = messages[-1]
        content = last_msg.get("content", "")
        if isinstance(content, list):
            text_parts = [p.get("text", "") for p in content if p.get("type") == "text"]
            return " ".join(text_parts)
        return content
    except (KeyError, IndexError, TypeError):
        return None


def extract_gemini_prompt(body: dict) -> Optional[str]:
    """Extract prompt from Gemini generateContent format."""
    try:
        contents = body.get("contents", [])
        if not contents:
            return None
        last_content = contents[-1]
        parts = last_content.get("parts", [])
        if not parts:
            return None
        return parts[0].get("text", "")
    except (KeyError, IndexError, TypeError):
        return None


def extract_anthropic_prompt(body: dict) -> Optional[str]:
    """Extract prompt from Anthropic messages format."""
    try:
        messages = body.get("messages", [])
        if not messages:
            return None
        last_msg = messages[-1]
        content = last_msg.get("content", "")
        if isinstance(content, list):
            text_parts = [p.get("text", "") for p in content if p.get("type") == "text"]
            return " ".join(text_parts)
        return content
    except (KeyError, IndexError, TypeError):
        return None


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
        """Close the HTTP client."""
        await self._client.aclose()

    def get_provider_config(self, provider: str) -> Optional[dict]:
        """Get configuration for a supported provider."""
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
            # Return real response but we will intercept chunks in stream_response
            real_response = await self._client.send(
                self._client.build_request("POST", url, json=body, headers=headers),
                stream=True,
            )
            # Attach req_id and canary to the response object for the stream generator
            real_response.req_id = req_id
            real_response.custom_canary = custom_canary
            real_response.provider = provider
            return real_response
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
        """Yield chunks from a streaming response with on-the-fly monitoring."""
        req_id = getattr(response, "req_id", None)
        custom_canary = getattr(response, "custom_canary", None)
        provider = getattr(response, "provider", None)
        
        chunks = []
        async for chunk in response.aiter_bytes():
            if req_id and self.output_monitor:
                chunks.append(chunk)
                # Parse current accumulated text
                full_text = extract_text_from_stream_buffer(chunks, provider)
                output_result = self.output_monitor.check(full_text, custom_canary=custom_canary)
                
                if output_result.flagged:
                    # Log to DB
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
                        logger.error(f"Failed to log streaming output block: {e}")
                    
                    error_json = json.dumps({"error": "response_blocked", "reason": output_result.reason})
                    yield f"\n\ndata: {error_json}\n\n".encode("utf-8")
                    break
                else:
                    yield chunk
            else:
                yield chunk
