"""
Neo4j Graph Writer

Exposes write_threat_event() which executes the Cypher MERGE logic.
This should be called asynchronously via the queue in neo4j_client.
"""

import logging
from typing import Optional
from src.db.neo4j_client import get_driver, is_connected

logger = logging.getLogger("llm_firewall.db.graph_writer")

MERGE_THREAT_QUERY = """
MERGE (k:ApiKey {key_id: $key_id})
MERGE (a:AttackType {name: $attack_type})
MERGE (l:FlaggedLayer {name: $flagged_layer})
MERGE (p:FlaggedPattern {text: $flagged_pattern})
MERGE (h:PromptHash {hash: $prompt_hash})
MERGE (h_norm:PromptHash {hash: $normalized_hash})

// Link raw hash and normalized hash to the attack type
MERGE (h)-[hr:IS_ATTACK]->(a)
  ON CREATE SET hr.times_seen = 1
  ON MATCH SET hr.times_seen = hr.times_seen + 1
  
MERGE (h_norm)-[hnr:IS_ATTACK]->(a)
  ON CREATE SET hnr.times_seen = 1
  ON MATCH SET hnr.times_seen = hnr.times_seen + 1

MERGE (k)-[r:TRIGGERED]->(a)
  ON CREATE SET r.count = 1, r.first_seen = $timestamp, r.last_seen = $timestamp, r.max_risk = $risk_score
  ON MATCH SET r.count = r.count + 1, r.last_seen = $timestamp, r.max_risk = CASE WHEN $risk_score > r.max_risk THEN $risk_score ELSE r.max_risk END

MERGE (a)-[:CAUGHT_BY]->(l)
MERGE (l)-[:MATCHED]->(p)

WITH k, a
FOREACH (_ IN CASE WHEN $provider IS NOT NULL THEN [1] ELSE [] END |
  MERGE (pv:Provider {name: $provider})
  MERGE (k)-[:TARGETS]->(pv)
)
"""


async def write_threat_event(log_entry: dict, normalized_hash: str) -> None:
    """
    Writes a threat event to the Neo4j graph.
    Only writes if safe == False.
    """
    if log_entry.get("safe", True):
        return

    if not await is_connected():
        return

    # Extract required fields, use placeholders if missing
    key_id = str(log_entry.get("api_key_id", "unknown"))
    attack_type = log_entry.get("attack_type") or "unknown_attack"
    flagged_layer = log_entry.get("flagged_layer") or "unknown_layer"
    flagged_pattern = str(log_entry.get("flagged_pattern") or "none")
    prompt_hash = log_entry.get("prompt_hash", "unknown_hash")
    timestamp = log_entry.get("timestamp")
    risk_score = log_entry.get("risk_score", 0.0)
    provider = log_entry.get("provider")

    # The official neo4j python driver accepts ISO string datetime in Cypher natively if formatted, 
    # but we can pass it as a string to Neo4j and parse, or just use string
    if hasattr(timestamp, "isoformat"):
        timestamp = timestamp.isoformat()

    try:
        driver = get_driver()
        async with driver.session() as session:
            await session.run(
                MERGE_THREAT_QUERY,
                key_id=key_id,
                attack_type=attack_type,
                flagged_layer=flagged_layer,
                flagged_pattern=flagged_pattern,
                prompt_hash=prompt_hash,
                normalized_hash=normalized_hash,
                timestamp=timestamp,
                risk_score=float(risk_score),
                provider=provider
            )
    except Exception as e:
        logger.error(f"Failed to execute Cypher MERGE: {e}")
