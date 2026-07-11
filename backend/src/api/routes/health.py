"""
Health Check Route — /health

Reports system status including classifier, DB, and Redis state.
"""

import time
import logging

from fastapi import APIRouter, Request

from src.db import mongo, redis as redis_db
from src.db.neo4j_client import is_connected as neo4j_is_connected

logger = logging.getLogger("llm_firewall.routes.health")

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(request: Request):
    """
    Comprehensive health check endpoint.
    
    Returns status of all system components:
      - classifier (ML model loaded)
      - MongoDB connection
      - Redis connection
      - uptime
    """
    pipeline = request.app.state.pipeline
    start_time = request.app.state.start_time

    # Check MongoDB
    db_connected = await mongo.is_connected()

    # Check Redis
    redis_connected = await redis_db.is_connected()

    # Check Neo4j
    neo4j_connected = await neo4j_is_connected()

    # Check classifier
    classifier_loaded = pipeline.ml_loaded

    # Removed expensive pipeline latency test on every health check
    classifier_latency = None

    # Determine overall status
    if db_connected and classifier_loaded:
        status = "ok"
    elif db_connected:
        status = "degraded"  # No ML, but rule+heuristic still work
    else:
        status = "degraded"

    uptime = int(time.time() - start_time)

    return {
        "status": status,
        "classifier_loaded": classifier_loaded,
        "db_connected": db_connected,
        "redis_connected": redis_connected,
        "neo4j_connected": neo4j_connected,
        "uptime_seconds": uptime,
        "model_version": pipeline.model_version if classifier_loaded else "unknown",
    }
