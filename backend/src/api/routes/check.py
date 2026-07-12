"""
Check Routes — /v1/check and /v1/check/batch

Direct classifier endpoint. No LLM forwarding — just risk assessment.
"""

import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response
from starlette.concurrency import run_in_threadpool

from src.api.schemas import (
    CheckRequest,
    CheckResponse,
    BatchCheckRequest,
    BatchCheckResponse,
)
from src.api.middleware import resolve_check_auth
from src.utils.hashing import hash_prompt, hash_normalized_prompt
from src.db import mongo
from src.db.neo4j_client import enqueue_write, get_driver
from src.db.graph_writer import write_threat_event

logger = logging.getLogger("llm_firewall.routes.check")

router = APIRouter(prefix="/v1", tags=["check"])


@router.post("/check", response_model=CheckResponse)
async def check_prompt(
    body: CheckRequest,
    request: Request,
    response: Response,
    key_doc: dict = Depends(resolve_check_auth),
):
    """
    Classify a single prompt through the 6-layer pipeline.
    Returns full risk assessment with layer breakdown.
    """
    pipeline = request.app.state.pipeline

    # Resolve context & canary settings (body overrides key_doc defaults)
    app_ctx = body.app_context if body.app_context != "general" else key_doc.get("app_context", "general")
    canary_token = body.custom_canary or key_doc.get("custom_canary", None)

    # Pre-pipeline check: Graph Replay Cache
    normalized_hash = hash_normalized_prompt(body.prompt)
    raw_hash = hash_prompt(body.prompt)
    graph_replay_hit = False
    
    try:
        from src.db.neo4j_client import is_connected
        if await is_connected():
            driver = get_driver()
            # Check if this normalized hash has been seen as an attack >= 3 times
            async with driver.session() as session:
                query = """
                MATCH (h:PromptHash {hash: $hash})-[r:IS_ATTACK]->(a:AttackType)
                WHERE r.times_seen >= 3
                RETURN a.name AS attack_type
                ORDER BY r.times_seen DESC LIMIT 1
                """
                record = await session.run(query, hash=normalized_hash)
                record = await record.single()
                
                if record:
                    graph_replay_hit = True
                    attack_type = record["attack_type"]
                    
                    from src.layers.pipeline import PipelineResult
                    result = PipelineResult(
                        request_id=str(uuid.uuid4()),
                        timestamp=datetime.now(timezone.utc).isoformat(),
                        safe=False,
                        risk_score=1.0,
                        attack_type=attack_type,
                        confidence=1.0,
                        flagged_layer="graph_replay_cache",
                        flagged_pattern="known_attacker_payload_hash",
                        threshold_used=body.threshold or 0.50,
                        layers={
                            "canary": {"ran": False, "reason": "graph_replay_cache_hit"},
                            "rule_based": {"ran": False, "reason": "graph_replay_cache_hit"},
                            "heuristic": {"ran": False, "reason": "graph_replay_cache_hit"},
                            "embedding_similarity": {"ran": False, "reason": "graph_replay_cache_hit"},
                            "ml_classifier": {"ran": False, "reason": "graph_replay_cache_hit"},
                            "context_policy": {"ran": False, "reason": "graph_replay_cache_hit"},
                        },
                        processing_time_ms=0.0,
                        model_version=pipeline.model_version,
                        metadata=body.metadata or {},
                        warnings=[]
                    )
    except Exception as e:
        logger.error(f"Graph replay check failed: {e}")

    if not graph_replay_hit:
        result = await run_in_threadpool(
            pipeline.classify,
            text=body.prompt,
            threshold=body.threshold,
            metadata=body.metadata,
            app_context=app_ctx,
            custom_canary=canary_token,
            use_openai_moderation=key_doc.get("use_openai_moderation", False)
        )

    # Set response headers
    response.headers["X-Firewall-Safe"] = str(result.safe).lower()
    response.headers["X-Firewall-Risk-Score"] = str(result.risk_score)
    response.headers["X-Firewall-Processing-Ms"] = str(result.processing_time_ms)

    # Log to MongoDB (never store raw prompt)
    log_entry = {
        "request_id": result.request_id,
        "api_key_id": str(key_doc["_id"]),
        "user_id": key_doc.get("user_id"),
        "timestamp": datetime.now(timezone.utc),
        "prompt_hash": raw_hash,
        "prompt_length": len(body.prompt),
        "safe": result.safe,
        "risk_score": result.risk_score,
        "attack_type": result.attack_type,
        "confidence": result.confidence,
        "flagged_layer": result.flagged_layer,
        "flagged_pattern": result.flagged_pattern,
        "provider": None,
        "model": None,
        "blocked": not result.safe,
        "layers": result.layers,
        "processing_time_ms": result.processing_time_ms,
        "model_version": result.model_version,
        "metadata": result.metadata,
    }

    try:
        await mongo.get_logs_collection().insert_one(log_entry)
        if not result.safe:
            await enqueue_write(write_threat_event, log_entry, normalized_hash)
    except Exception as e:
        logger.error(f"Failed to log check result: {e}")

    # Update key usage stats
    try:
        update = {
            "$inc": {"total_checks": 1, "monthly_usage": 1},
            "$set": {"last_used_at": datetime.now(timezone.utc)}
        }
        if not result.safe:
            update["$inc"]["total_blocked"] = 1
        await mongo.get_keys_collection().update_one(
            {"_id": key_doc["_id"]}, update
        )
    except Exception as e:
        logger.error(f"Failed to update key stats: {e}")

    return result.to_dict()


@router.post("/check/batch", response_model=BatchCheckResponse)
async def check_batch(
    body: BatchCheckRequest,
    request: Request,
    response: Response,
    key_doc: dict = Depends(resolve_check_auth),
):
    """
    Classify multiple prompts in a single request.
    Maximum 50 prompts per batch.
    """
    pipeline = request.app.state.pipeline
    batch_id = str(uuid.uuid4())
    results = []

    # Get developer's defaults for this key
    app_ctx = key_doc.get("app_context", "general")
    canary_token = key_doc.get("custom_canary", None)

    import asyncio

    # Prepare concurrent tasks
    classification_tasks = []
    valid_prompts = []
    
    for prompt in body.prompts:
        if not prompt or not prompt.strip():
            # Return error result for empty prompts
            results.append({
                "request_id": str(uuid.uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "safe": True,
                "risk_score": 0.0,
                "attack_type": None,
                "confidence": 0.0,
                "flagged_layer": None,
                "flagged_pattern": None,
                "threshold_used": 0.50,
                "layers": {
                    "canary": {"ran": False, "reason": "empty_prompt", "score": None, "matched_canary": None},
                    "rule_based": {"ran": False, "reason": "empty_prompt", "triggered": False, "matched_pattern": None, "attack_category": None, "score": 0.0, "latency_ms": 0},
                    "heuristic": {"ran": False, "reason": "empty_prompt", "score": None, "signals": None},
                    "embedding_similarity": {"ran": False, "reason": "empty_prompt", "similarity_score": None, "nearest_attack_preview": None},
                    "ml_classifier": {"ran": False, "reason": "empty_prompt", "attack_class": None, "confidence": None, "all_scores": None},
                    "context_policy": {"ran": False, "reason": "empty_prompt", "app_context": None, "similarity_to_intent": None},
                },
                "processing_time_ms": 0,
                "model_version": pipeline.model_version,
                "metadata": {},
                "warnings": ["empty_prompt_skipped"],
            })
            continue

        valid_prompts.append(prompt)
        task = run_in_threadpool(
            pipeline.classify,
            text=prompt,
            app_context=app_ctx,
            custom_canary=canary_token,
            use_openai_moderation=key_doc.get("use_openai_moderation", False)
        )
        classification_tasks.append(task)
        
    # Execute valid prompts concurrently
    if classification_tasks:
        classification_results = await asyncio.gather(*classification_tasks)
        
        for idx, result in enumerate(classification_results):
            prompt = valid_prompts[idx]
            results.append(result.to_dict())

            # Log each result
            try:
                log_entry = {
                    "request_id": result.request_id,
                    "api_key_id": str(key_doc["_id"]),
                    "user_id": key_doc.get("user_id"),
                    "timestamp": datetime.now(timezone.utc),
                    "prompt_hash": hash_prompt(prompt),
                    "prompt_length": len(prompt),
                    "safe": result.safe,
                    "risk_score": result.risk_score,
                    "attack_type": result.attack_type,
                    "confidence": result.confidence,
                    "flagged_layer": result.flagged_layer,
                    "flagged_pattern": result.flagged_pattern,
                    "provider": None,
                    "model": None,
                    "blocked": not result.safe,
                    "layers": result.layers,
                    "processing_time_ms": result.processing_time_ms,
                    "model_version": result.model_version,
                    "metadata": {},
                }
                await mongo.get_logs_collection().insert_one(log_entry)
                if not result.safe:
                    await enqueue_write(write_threat_event, log_entry, hash_normalized_prompt(prompt))
            except Exception as e:
                logger.error(f"Failed to log batch result: {e}")

    # Set batch aggregate response headers
    overall_safe = all(res["safe"] for res in results)
    max_risk = max((res["risk_score"] for res in results), default=0.0)
    total_ms = sum(res["processing_time_ms"] for res in results)
    
    response.headers["X-Firewall-Safe"] = str(overall_safe).lower()
    response.headers["X-Firewall-Risk-Score"] = str(max_risk)
    response.headers["X-Firewall-Processing-Ms"] = str(total_ms)

    return {"results": results, "batch_id": batch_id}
