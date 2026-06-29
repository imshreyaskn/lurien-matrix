"""
API Key Management Routes — /v1/keys

CRUD operations for API key management.
Keys are hashed before storage (never stored in plaintext).
"""

import logging
from datetime import datetime, timezone
from bson import ObjectId

from fastapi import APIRouter, Depends, HTTPException, Request

from src.api.schemas import CreateKeyRequest, ApiKeyResponse
from src.api.auth_middleware import validate_user_token
from src.utils.hashing import generate_api_key, hash_api_key
from src.db import mongo

logger = logging.getLogger("llm_firewall.routes.keys")

router = APIRouter(prefix="/v1/keys", tags=["keys"])


@router.post("", response_model=ApiKeyResponse)
async def create_api_key(
    body: CreateKeyRequest, 
    request: Request,
    current_user: dict = Depends(validate_user_token)
):
    """
    Create a new API key.
    The raw key is returned ONCE — it is never stored or retrievable.
    """
    raw_key = generate_api_key()
    key_hash = hash_api_key(raw_key)
    now = datetime.now(timezone.utc)

    key_doc = {
        "user_id": current_user["_id"],
        "key_hash": key_hash,
        "name": body.name,
        "created_at": now,
        "last_used_at": None,
        "is_active": True,
        "monthly_usage": 0,
        "monthly_reset_date": now.replace(day=1),
        "total_blocked": 0,
        "total_checks": 0,
        "app_context": body.app_context,
        "custom_canary": body.custom_canary,
        "custom_intent_examples": body.custom_intent_examples,
        "use_openai_moderation": body.use_openai_moderation,
    }

    # Insert initially to generate ID
    result = await mongo.get_keys_collection().insert_one(key_doc)
    key_id_str = str(result.inserted_id)

    # If custom intent examples are provided, register and override app_context to the generated key_id
    if body.custom_intent_examples:
        pipeline = request.app.state.pipeline
        try:
            pipeline.policy.register_custom_profile(key_id_str, body.custom_intent_examples)
            # Update key in DB to have app_context point to this profile name
            await mongo.get_keys_collection().update_one(
                {"_id": result.inserted_id},
                {"$set": {"app_context": key_id_str}}
            )
            key_doc["app_context"] = key_id_str
            logger.info(f"Registered custom intent profile for key: {key_id_str}")
        except Exception as e:
            logger.error(f"Failed to register custom profile: {e}")

    return ApiKeyResponse(
        api_key=raw_key,  # Shown ONCE
        key_id=key_id_str,
        name=body.name,
        created_at=now.isoformat(),
        is_active=True,
        monthly_usage=0,
        total_blocked=0,
        total_checks=0,
        app_context=key_doc["app_context"],
        custom_canary=key_doc["custom_canary"],
        use_openai_moderation=key_doc["use_openai_moderation"],
    )


@router.get("")
async def list_api_keys(current_user: dict = Depends(validate_user_token)):
    """List all API keys (without raw key values). Scoped to caller."""
    keys_collection = mongo.get_keys_collection()
    # Only return keys belonging to the current user
    cursor = keys_collection.find({"user_id": current_user["_id"], "is_active": True})
    keys = []

    async for doc in cursor:
        keys.append({
            "key_id": str(doc["_id"]),
            "name": doc.get("name", ""),
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
            "last_used_at": doc["last_used_at"].isoformat() if doc.get("last_used_at") else None,
            "is_active": doc.get("is_active", True),
            "monthly_usage": doc.get("monthly_usage", 0),
            "total_blocked": doc.get("total_blocked", 0),
            "total_checks": doc.get("total_checks", 0),
            "app_context": doc.get("app_context", "general"),
            "custom_canary": doc.get("custom_canary", None),
            "use_openai_moderation": doc.get("use_openai_moderation", False),
        })

    return {"keys": keys}


@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: str,
    current_user: dict = Depends(validate_user_token),
):
    """
    Revoke (soft-delete) an API key.
    The key is marked inactive but not removed from the database.
    """
    try:
        obj_id = ObjectId(key_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid key ID format")

    # Ensure the key belongs to the current user
    result = await mongo.get_keys_collection().update_one(
        {"_id": obj_id, "user_id": current_user["_id"]},
        {"$set": {"is_active": False, "revoked_at": datetime.now(timezone.utc)}},
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="API key not found or you don't have permission")

    return {"message": "API key revoked", "key_id": key_id}
