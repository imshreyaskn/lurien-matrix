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
    
    keys_coll = mongo.get_keys_collection()
    key_names = {}
    async for key_doc in keys_coll.find({"user_id": current_user["_id"]}):
        key_names[str(key_doc["_id"])] = key_doc.get("name", "Unknown App")
        
    allowed_keys = list(key_names.keys())
    if not allowed_keys:
        return {
            "status": "ok",
            "data": {
                "force_graph": [],
                "layer_bypass": [],
                "top_replayed": [],
                "api_key_breakdown": [],
                "flow_data": [],
                "replay_counts": {}
            }
        }
    
    co_occurrence = []
    layer_bypass = []
    top_replayed = []
    provider_targeting = []
    flow_data = []
    replay_counts = {}
    
    try:
        async with driver.session() as session:
            # Query 1: Force Graph Data (API Key -> Attack Type)
            q1 = """
            MATCH (k:ApiKey)-[:TRIGGERED]->(a:AttackType)
            WHERE k.key_id IN $allowed_keys
            WITH k, a, COUNT(*) as weight
            RETURN k.key_id AS source, a.name AS target, weight
            ORDER BY weight DESC LIMIT 50
            """
            result1 = await session.run(q1, allowed_keys=allowed_keys)
            async for record in result1:
                source_id = str(record["source"])
                co_occurrence.append({
                    "source": key_names.get(source_id, source_id),
                    "target": record["target"],
                    "weight": record["weight"]
                })
                
            # Query 2: Layer Bypass (attacks caught by ML, missing rule/heuristic)
            q2 = """
            MATCH (k:ApiKey)-[:TRIGGERED]->(a:AttackType)-[:CAUGHT_BY]->(l:FlaggedLayer)
            WHERE k.key_id IN $allowed_keys
            WITH a, COLLECT(DISTINCT l.name) AS layers
            WHERE 'ml_classifier' IN layers AND NOT 'rule_based' IN layers AND NOT 'heuristic' IN layers
            RETURN a.name AS attack_type, SIZE(layers) AS caught_by_ml_only 
            ORDER BY caught_by_ml_only DESC LIMIT 10
            """
            result2 = await session.run(q2, allowed_keys=allowed_keys)
            async for record in result2:
                layer_bypass.append({
                    "attack_type": record["attack_type"],
                    "caught_by_ml_only": record["caught_by_ml_only"]
                })
                
            # Query 3: Top Replayed Hashes
            q3 = """
            MATCH (k:ApiKey)-[:TRIGGERED]->(a:AttackType)<-[r:IS_ATTACK]-(h:PromptHash)
            WHERE k.key_id IN $allowed_keys AND r.times_seen >= 2
            RETURN DISTINCT h.hash AS hash, a.name AS attack_type, r.times_seen AS times_seen 
            ORDER BY times_seen DESC LIMIT 10
            """
            result3 = await session.run(q3, allowed_keys=allowed_keys)
            async for record in result3:
                top_replayed.append({
                    "hash": record["hash"],
                    "attack_type": record["attack_type"],
                    "times_seen": record["times_seen"]
                })
                
            # Query 4: API Key Breakdown
            q4 = """
            MATCH (k:ApiKey)-[:TRIGGERED]->(a:AttackType)
            WHERE k.key_id IN $allowed_keys
            RETURN k.key_id AS key_id, a.name AS attack_type, COUNT(a) AS attack_count
            ORDER BY attack_count DESC
            """
            result4 = await session.run(q4, allowed_keys=allowed_keys)
            async for record in result4:
                key_id = str(record["key_id"])
                provider_targeting.append({
                    "key_id": key_names.get(key_id, key_id),
                    "attack_type": record["attack_type"],
                    "attack_count": record["attack_count"]
                })

            # Query 5: Three-stage flow (ApiKey -> AttackType -> FlaggedLayer)
            q5 = """
            MATCH (k:ApiKey)-[t:TRIGGERED]->(a:AttackType)-[:CAUGHT_BY]->(l:FlaggedLayer)
            WHERE k.key_id IN $allowed_keys
            RETURN k.key_id AS api_key, a.name AS attack_type, l.name AS flagged_layer, t.count AS weight
            ORDER BY weight DESC LIMIT 100
            """
            result5 = await session.run(q5, allowed_keys=allowed_keys)
            async for record in result5:
                kid = str(record["api_key"])
                flow_data.append({
                    "apiKey": key_names.get(kid, kid),
                    "attackType": record["attack_type"],
                    "flaggedLayer": record["flagged_layer"],
                    "weight": record["weight"] or 1
                })
            
            # Query 6: Replay counts per attack type
            q6 = """
            MATCH (k:ApiKey)-[:TRIGGERED]->(a:AttackType)<-[r:IS_ATTACK]-(h:PromptHash)
            WHERE k.key_id IN $allowed_keys AND r.times_seen >= 2
            WITH DISTINCT a.name AS attack_type, h.hash AS h_hash
            WITH attack_type, COUNT(h_hash) AS replay_count
            RETURN attack_type, replay_count
            """
            result6 = await session.run(q6, allowed_keys=allowed_keys)
            async for record in result6:
                replay_counts[record["attack_type"]] = record["replay_count"]
                
    except Exception as e:
        logger.error(f"Failed to query Threat Graph stats: {e}")
        return {"status": "error", "message": str(e), "data": None}
        
    return {
        "status": "ok",
        "data": {
            "force_graph": co_occurrence,
            "layer_bypass": layer_bypass,
            "top_replayed": top_replayed,
            "api_key_breakdown": provider_targeting,
            "flow_data": flow_data,
            "replay_counts": replay_counts
        }
    }

@router.get("/velocity")
async def get_threat_velocity(current_user: dict = Depends(validate_user_token)):
    """
    Get attacks per hour for the last 24 hours, split by API Key.
    Queries MongoDB logs.
    """
    logs = mongo.get_logs_collection()
    keys_coll = mongo.get_keys_collection()
    key_names = {}
    async for key_doc in keys_coll.find():
        key_names[str(key_doc["_id"])] = key_doc.get("name", "Unknown App")

    now = datetime.now(timezone.utc)
    time_window = now - timedelta(hours=24)
    
    pipeline = [
        {"$match": {"user_id": current_user["_id"], "timestamp": {"$gte": time_window}, "safe": False}},
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$timestamp"},
                    "month": {"$month": "$timestamp"},
                    "day": {"$dayOfMonth": "$timestamp"},
                    "hour": {"$hour": "$timestamp"},
                    "api_key": "$api_key_id"
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1}}
    ]
    
    velocity_data = []
    async for doc in logs.aggregate(pipeline):
        # Format as YYYY-MM-DD HH:00 so frontend string sort is strictly chronological
        y = doc["_id"]["year"]
        m = doc["_id"]["month"]
        d = doc["_id"]["day"]
        h = doc["_id"]["hour"]
        time_str = f"{y}-{m:02d}-{d:02d} {h:02d}:00"
        
        key_id = str(doc["_id"]["api_key"])
        velocity_data.append({
            "time": time_str,
            "api_key": key_names.get(key_id, key_id),
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
