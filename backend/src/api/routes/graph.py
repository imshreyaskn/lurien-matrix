"""
Graph Routes — /v1/graph/stats

Endpoints for reading intelligence from the Neo4j Threat Graph.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from src.api.auth_middleware import validate_user_token
from src.db.neo4j_client import get_driver, is_connected

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
            # Query 1: Attack Co-occurrence Matrix
            q1 = """
            MATCH (a1:AttackType)<-[:TRIGGERED]-(k:ApiKey)-[:TRIGGERED]->(a2:AttackType)
            WHERE a1.name < a2.name
            RETURN a1.name AS source, a2.name AS target, COUNT(k) AS weight 
            ORDER BY weight DESC LIMIT 20
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
                
            # Query 4: Provider Targeting
            q4 = """
            MATCH (k:ApiKey)-[:TARGETS]->(p:Provider)
            RETURN p.name AS provider, COUNT(k) AS api_keys_targeting 
            ORDER BY api_keys_targeting DESC
            """
            result4 = await session.run(q4)
            async for record in result4:
                provider_targeting.append({
                    "provider": record["provider"],
                    "api_keys_targeting": record["api_keys_targeting"]
                })
                
    except Exception as e:
        logger.error(f"Failed to query Threat Graph stats: {e}")
        return {"status": "error", "message": str(e), "data": None}
        
    return {
        "status": "ok",
        "data": {
            "co_occurrence": co_occurrence,
            "layer_bypass": layer_bypass,
            "top_replayed": top_replayed,
            "provider_targeting": provider_targeting
        }
    }
