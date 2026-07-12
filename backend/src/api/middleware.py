"""
API Middleware — Authentication & Rate Limiting

Validates X-API-Key header on every request.
Applies rate limiting via Redis.
"""

import logging
from typing import Optional

from fastapi import Request, HTTPException, Depends
from fastapi.security import APIKeyHeader

from src.db import mongo, redis as redis_db
from src.utils.hashing import hash_api_key

logger = logging.getLogger("llm_firewall.middleware")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def validate_api_key(
    request: Request,
    api_key: Optional[str] = Depends(api_key_header),
) -> dict:
    """
    Validate the API key from X-API-Key header.
    Returns the key document from MongoDB.
    Raises HTTPException on auth failure.
    """
    # Check if key is in URL params (security violation)
    client_host = request.client.host if request.client else "unknown"
    if request.query_params.get("api_key") or request.query_params.get("apikey"):
        logger.warning(f"API key in URL params from {client_host}")
        raise HTTPException(
            status_code=401,
            detail="API key must be in X-API-Key header, not URL parameters",
        )

    if not api_key:
        raise HTTPException(status_code=401, detail="API key required")

    # Validate format
    if not api_key.startswith("fw_live_") or len(api_key) != 72:
        raise HTTPException(status_code=401, detail="Invalid API key format")

    # Look up in database
    key_hash = hash_api_key(api_key)
    keys_collection = mongo.get_keys_collection()
    
    key_doc = await keys_collection.find_one({"key_hash": key_hash})
    
    if not key_doc:
        raise HTTPException(status_code=401, detail="API key not found")

    if not key_doc.get("is_active", False):
        raise HTTPException(status_code=401, detail="API key has been revoked")

    # Check rate limits
    rate_status = await redis_db.check_rate_limit(
        api_key_id=str(key_doc["_id"])
    )

    if not rate_status.allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "limit_type": rate_status.limit_type,
                "retry_after_seconds": rate_status.retry_after_seconds,
            },
            headers={
                "Retry-After": str(rate_status.retry_after_seconds),
                "X-RateLimit-Limit": str(rate_status.limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(rate_status.reset_at),
            },
        )

    # Attach rate limit info for response headers
    request.state.rate_limit = rate_status
    request.state.api_key_doc = key_doc

    return key_doc


async def resolve_check_auth(request: Request) -> dict:
    """
    Dual-auth resolver for /v1/check endpoints.

    External flow:  X-API-Key header → standard hash validation.
    Dashboard flow: Authorization: Bearer <jwt> + X-Dashboard-Key-ID: <key_id>
                    → validates JWT, looks up key by ID, asserts ownership.

    ponytail: no new files, reuses validate_api_key and auth_middleware's JWT logic.
    """
    api_key = request.headers.get("X-API-Key")
    if api_key:
        # External flow — existing path unchanged
        return await validate_api_key(request, api_key)

    # Dashboard flow
    dashboard_key_id = request.headers.get("X-Dashboard-Key-ID")
    auth_header = request.headers.get("Authorization", "")

    if not dashboard_key_id or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="API key or dashboard session required")

    token = auth_header.split(" ", 1)[1]

    # Reuse JWT logic from auth_middleware inline to avoid circular imports
    import os
    from jose import JWTError, jwt as _jwt
    from bson import ObjectId

    SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_secret_key_please_change")
    ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")

    try:
        payload = _jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = ObjectId(payload.get("sub"))
    except (JWTError, Exception):
        raise HTTPException(status_code=401, detail="Invalid session token")

    try:
        key_obj_id = ObjectId(dashboard_key_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid key ID")

    keys_collection = mongo.get_keys_collection()
    key_doc = await keys_collection.find_one({"_id": key_obj_id, "user_id": user_id, "is_active": True})

    if not key_doc:
        raise HTTPException(status_code=404, detail="API key not found or access denied")

    # Rate limiting still applies
    rate_status = await redis_db.check_rate_limit(api_key_id=str(key_doc["_id"]))
    if not rate_status.allowed:
        raise HTTPException(status_code=429, detail={"error": "rate_limit_exceeded"})

    request.state.rate_limit = rate_status
    request.state.api_key_doc = key_doc
    return key_doc

