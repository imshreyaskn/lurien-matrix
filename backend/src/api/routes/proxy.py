"""
Proxy Routes — /v1/proxy/{provider}

True firewall endpoint. Receives LLM API requests, classifies,
and either blocks (403) or forwards to the LLM provider.
"""

import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse

from src.api.middleware import validate_api_key
from src.utils.hashing import hash_prompt
from src.db import mongo

logger = logging.getLogger("llm_firewall.routes.proxy")

router = APIRouter(prefix="/v1/proxy", tags=["proxy"])

SUPPORTED_PROVIDERS = {"openai", "gemini", "anthropic", "groq"}


@router.post("/{provider}")
async def proxy_llm_request(
    provider: str,
    request: Request,
    key_doc: dict = Depends(validate_api_key),
):
    """
    True firewall proxy endpoint.
    
    Receives a full LLM API request, classifies the prompt,
    and either blocks (403 + threat report) or forwards to the
    provider and streams the response back.
    
    Headers required:
      X-API-Key: firewall API key
      X-LLM-API-Key: the provider's API key (forwarded to LLM)
    """
    # Validate provider
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider: {provider}. Supported: {', '.join(SUPPORTED_PROVIDERS)}",
        )

    # Get LLM API key
    llm_api_key = request.headers.get("X-LLM-API-Key")
    if not llm_api_key:
        raise HTTPException(
            status_code=400,
            detail="X-LLM-API-Key header required for proxy mode",
        )

    # Parse request body
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Extract prompt from provider-specific format
    proxy_engine = request.app.state.proxy_engine
    prompt = proxy_engine.extract_prompt(provider, body)

    if not prompt:
        raise HTTPException(
            status_code=400,
            detail="Could not extract prompt from request body",
        )

    # ── Run classifier pipeline ──────────────────────────────
    pipeline = request.app.state.pipeline
    app_ctx = key_doc.get("app_context", "general")
    canary_token = key_doc.get("custom_canary", None)
    
    result = pipeline.classify(
        text=prompt,
        app_context=app_ctx,
        custom_canary=canary_token,
        use_openai_moderation=key_doc.get("use_openai_moderation", False)
    )

    # Extract model name from body
    model_name = body.get("model", None)

    # Common firewall headers
    firewall_headers = {
        "X-Firewall-Safe": str(result.safe).lower(),
        "X-Firewall-Risk-Score": str(result.risk_score),
        "X-Firewall-Processing-Ms": str(result.processing_time_ms),
    }

    # Log the request
    log_entry = {
        "request_id": result.request_id,
        "api_key_id": str(key_doc["_id"]),
        "timestamp": datetime.now(timezone.utc),
        "prompt_hash": hash_prompt(prompt),
        "prompt_length": len(prompt),
        "safe": result.safe,
        "risk_score": result.risk_score,
        "attack_type": result.attack_type,
        "confidence": result.confidence,
        "flagged_layer": result.flagged_layer,
        "flagged_pattern": result.flagged_pattern,
        "provider": provider,
        "model": model_name,
        "blocked": not result.safe,
        "layers": result.layers,
        "processing_time_ms": result.processing_time_ms,
        "model_version": result.model_version,
        "metadata": {},
    }

    try:
        await mongo.get_logs_collection().insert_one(log_entry)
    except Exception as e:
        logger.error(f"Failed to log proxy result: {e}")

    # Update key stats
    try:
        update = {"$inc": {"total_checks": 1, "monthly_usage": 1}}
        if not result.safe:
            update["$inc"]["total_blocked"] = 1
        await mongo.get_keys_collection().update_one(
            {"_id": key_doc["_id"]}, update
        )
    except Exception as e:
        logger.error(f"Failed to update key stats: {e}")

    # ── BLOCK if flagged ─────────────────────────────────────
    if not result.safe:
        logger.warning(
            f"BLOCKED {provider} request: {result.attack_type} "
            f"(risk={result.risk_score}, layer={result.flagged_layer})"
        )
        return JSONResponse(
            status_code=403,
            content={
                "error": "prompt_blocked",
                "firewall_report": {
                    "risk_score": result.risk_score,
                    "attack_type": result.attack_type,
                    "confidence": result.confidence,
                    "flagged_layer": result.flagged_layer,
                    "flagged_pattern": result.flagged_pattern,
                    "layers": result.layers,
                    "processing_time_ms": result.processing_time_ms,
                    "request_id": result.request_id,
                    "timestamp": result.timestamp,
                },
            },
            headers=firewall_headers,
        )

    # ── FORWARD if safe ──────────────────────────────────────
    try:
        is_stream = body.get("stream", False)

        if is_stream:
            response = await proxy_engine.forward_request(
                provider=provider,
                body=body,
                llm_api_key=llm_api_key,
                stream=True,
            )
            return StreamingResponse(
                proxy_engine.stream_response(response),
                status_code=response.status_code,
                media_type=response.headers.get("content-type", "text/event-stream"),
                headers={
                    **firewall_headers,
                    **{k: v for k, v in response.headers.items()
                       if k.lower() not in ("content-length", "transfer-encoding", "content-encoding")},
                },
            )
        else:
            response = await proxy_engine.forward_request(
                provider=provider,
                body=body,
                llm_api_key=llm_api_key,
                stream=False,
            )
            return JSONResponse(
                status_code=response.status_code,
                content=response.json(),
                headers=firewall_headers,
            )

    except httpx.ConnectError:
        raise HTTPException(
            status_code=502,
            detail=f"LLM provider '{provider}' is unreachable",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=502,
            detail=f"LLM provider '{provider}' timed out",
        )
    except Exception as e:
        logger.error(f"Proxy forward error: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"An internal error occurred while forwarding to {provider}.",
        )
