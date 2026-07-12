"""
Graph Routes — /v1/graph/stats

Endpoints for reading intelligence from the Neo4j Threat Graph.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from src.api.auth_middleware import validate_user_token
from src.db.neo4j_client import get_driver, is_connected
from src.db import mongo
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("llm_firewall.routes.graph")

router = APIRouter(prefix="/v1/graph", tags=["graph"])


@router.get("/stats")
async def get_graph_stats(current_user: dict = Depends(validate_user_token)):
    """
    Get aggregated intelligence from the Threat Graph.
    Includes attack co-occurrence, layer bypasses, top replayed hashes, and provider targeting.
    """
    if not await is_connected():
        return {"status": "graph_offline", "data": None}

    driver = get_driver()
    
    # We don't filter by user_id here for the hackathon MVP to show a global threat graph,
    # but in a real multi-tenant scenario, we would link ApiKeys to Users in the graph
    # and filter queries by a User node.
    
    co_occurrence = []
    layer_bypass = []
    top_replayed = []
    provider_targeting = []
    
    try:
        async with driver.session() as session:
            # Query 1: Force Graph Data (API Key -> Attack Type)
            q1 = """
            MATCH (k:ApiKey)-[:TRIGGERED]->(a:AttackType)
            WITH k, a, COUNT(*) as weight
            RETURN k.key_id AS source, a.name AS target, weight
            ORDER BY weight DESC LIMIT 50
            """
            result1 = await session.run(q1)
            async for record in result1:
                co_occurrence.append({
                    "source": record["source"],
                    "target": record["target"],
                    "weight": record["weight"]
                })
                
            # Query 2: Layer Bypass (attacks caught by ML, missing rule/heuristic)
            q2 = """
            MATCH (a:AttackType)-[:CAUGHT_BY]->(l:FlaggedLayer)
            WITH a, COLLECT(l.name) AS layers
            WHERE 'ml_classifier' IN layers AND NOT 'rule_based' IN layers AND NOT 'heuristic' IN layers
            RETURN a.name AS attack_type, SIZE(layers) AS caught_by_ml_only 
            ORDER BY caught_by_ml_only DESC LIMIT 10
            """
            result2 = await session.run(q2)
            async for record in result2:
                layer_bypass.append({
                    "attack_type": record["attack_type"],
                    "caught_by_ml_only": record["caught_by_ml_only"]
                })
                
            # Query 3: Top Replayed Hashes
            q3 = """
            MATCH (h:PromptHash)-[r:IS_ATTACK]->(a:AttackType)
            WHERE r.times_seen >= 2
            RETURN h.hash AS hash, a.name AS attack_type, r.times_seen AS times_seen 
            ORDER BY times_seen DESC LIMIT 10
            """
            result3 = await session.run(q3)
            async for record in result3:
                top_replayed.append({
                    "hash": record["hash"],
                    "attack_type": record["attack_type"],
                    "times_seen": record["times_seen"]
                })
                
            # Query 4: API Key Breakdown
            q4 = """
            MATCH (k:ApiKey)-[:TRIGGERED]->(a:AttackType)
            RETURN k.key_id AS key_id, a.name AS attack_type, COUNT(a) AS attack_count
            ORDER BY attack_count DESC
            """
            result4 = await session.run(q4)
            async for record in result4:
                provider_targeting.append({
                    "key_id": record["key_id"],
                    "attack_type": record["attack_type"],
                    "attack_count": record["attack_count"]
                })
                
    except Exception as e:
        logger.error(f"Failed to query Threat Graph stats: {e}")
        return {"status": "error", "message": str(e), "data": None}
        
    return {
        "status": "ok",
        "data": {
            "force_graph": co_occurrence,
            "layer_bypass": layer_bypass,
            "top_replayed": top_replayed,
            "api_key_breakdown": provider_targeting
        }
    }

@router.get("/velocity")
async def get_threat_velocity(current_user: dict = Depends(validate_user_token)):
    """
    Get attacks per minute for the last 60 minutes, split by API Key.
    Queries MongoDB logs.
    """
    logs = mongo.get_logs_collection()
    now = datetime.now(timezone.utc)
    sixty_mins_ago = now - timedelta(minutes=60)
    
    pipeline = [
        {"$match": {"user_id": current_user["_id"], "timestamp": {"$gte": sixty_mins_ago}, "safe": False}},
        {
            "$group": {
                "_id": {
                    "minute": {"$minute": "$timestamp"},
                    "hour": {"$hour": "$timestamp"},
                    "day": {"$dayOfMonth": "$timestamp"},
                    "api_key": "$api_key_id"
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.day": 1, "_id.hour": 1, "_id.minute": 1}}
    ]
    
    velocity_data = []
    async for doc in logs.aggregate(pipeline):
        # Format a simple HH:MM string for the frontend
        time_str = f"{doc['_id']['hour']:02d}:{doc['_id']['minute']:02d}"
        velocity_data.append({
            "time": time_str,
            "api_key": doc["_id"]["api_key"],
            "count": doc["count"]
        })
        
    return {"status": "ok", "data": velocity_data}

@router.get("/session-chains")
async def get_session_chains(current_user: dict = Depends(validate_user_token)):
    """
    Get top 20 suspicious sessions and their request sequence (attack chains).
    """
    logs = mongo.get_logs_collection()
    
    # We find sessions that have at least one blocked request, or sort by most requests
    pipeline = [
        {"$match": {"user_id": current_user["_id"]}},
        {
            "$group": {
                "_id": "$session_id",
                "total_requests": {"$sum": 1},
                "blocked_count": {"$sum": {"$cond": [{"$eq": ["$safe", False]}, 1, 0]}},
                "max_risk": {"$max": "$risk_score"},
                "events": {
                    "$push": {
                        "safe": "$safe",
                        "risk_score": "$risk_score",
                        "attack_type": "$attack_type",
                        "flagged_layer": "$flagged_layer",
                        "timestamp": "$timestamp"
                    }
                }
            }
        },
        # Calculate threat score: (blocked / total) * max_risk
        {
            "$addFields": {
                "threat_score": {
                    "$multiply": [
                        {"$divide": ["$blocked_count", "$total_requests"]},
                        "$max_risk"
                    ]
                }
            }
        },
        {"$sort": {"threat_score": -1}},
        {"$limit": 20}
    ]
    
    sessions = []
    async for doc in logs.aggregate(pipeline):
        # Format timestamps
        for ev in doc["events"]:
            ev["timestamp"] = ev["timestamp"].isoformat()
        sessions.append({
            "session_id": str(doc["_id"]) if doc["_id"] else "unknown",
            "total_requests": doc["total_requests"],
            "blocked_count": doc["blocked_count"],
            "max_risk": doc["max_risk"],
            "threat_score": doc["threat_score"],
            "events": doc["events"]
        })
        
    return {"status": "ok", "data": sessions}
