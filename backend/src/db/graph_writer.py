"""
Neo4j Graph Writer

Exposes write_threat_event() which executes the Cypher MERGE logic.
This should be called asynchronously via the queue in neo4j_client.
"""

import logging
from typing import Optional
from src.db.neo4j_client import get_driver, is_connected

logger = logging.getLogger("llm_firewall.db.graph_writer")

MERGE_THREAT_QUERY_BATCH = """
UNWIND $events AS event
MERGE (k:ApiKey {key_id: event.key_id})
MERGE (a:AttackType {name: event.attack_type})
MERGE (l:FlaggedLayer {name: event.flagged_layer})
MERGE (p:FlaggedPattern {text: event.flagged_pattern})
MERGE (h:PromptHash {hash: event.prompt_hash})
MERGE (h_norm:PromptHash {hash: event.normalized_hash})

// Link raw hash and normalized hash to the attack type
MERGE (h)-[hr:IS_ATTACK]->(a)
  ON CREATE SET hr.times_seen = 1
  ON MATCH SET hr.times_seen = hr.times_seen + 1
  
MERGE (h_norm)-[hnr:IS_ATTACK]->(a)
  ON CREATE SET hnr.times_seen = 1
  ON MATCH SET hnr.times_seen = hnr.times_seen + 1

MERGE (k)-[r:TRIGGERED]->(a)
  ON CREATE SET r.count = 1, r.first_seen = event.timestamp, r.last_seen = event.timestamp, r.max_risk = event.risk_score
  ON MATCH SET r.count = r.count + 1, r.last_seen = event.timestamp, r.max_risk = CASE WHEN event.risk_score > r.max_risk THEN event.risk_score ELSE r.max_risk END

MERGE (a)-[:CAUGHT_BY]->(l)
MERGE (l)-[:MATCHED]->(p)

WITH k, a, event
FOREACH (_ IN CASE WHEN event.provider IS NOT NULL THEN [1] ELSE [] END |
  MERGE (pv:Provider {name: event.provider})
  MERGE (k)-[:TARGETS]->(pv)
)
"""


async def write_threat_events_batch(events_data: list) -> None:
    """
    Writes a batch of threat events to the Neo4j graph using UNWIND.
    """
    if not await is_connected() or not events_data:
        return

    formatted_events = []
    for data in events_data:
        log_entry = data["log_entry"]
        if log_entry.get("safe", True):
            continue

        timestamp = log_entry.get("timestamp")
        if hasattr(timestamp, "isoformat"):
            timestamp = timestamp.isoformat()

        raw_attack = log_entry.get("attack_type") or "unknown_attack"
        if raw_attack.lower() == "safe":
            raw_attack = "cumulative_risk_exceeded"
        normalized_attack = raw_attack.lower().replace(" ", "_")

        formatted_events.append({
            "key_id": str(log_entry.get("api_key_id", "unknown")),
            "attack_type": normalized_attack,
            "flagged_layer": log_entry.get("flagged_layer") or "unknown_layer",
            "flagged_pattern": str(log_entry.get("flagged_pattern") or "none"),
            "prompt_hash": log_entry.get("prompt_hash", "unknown_hash"),
            "normalized_hash": data["normalized_hash"],
            "timestamp": timestamp,
            "risk_score": float(log_entry.get("risk_score", 0.0)),
            "provider": log_entry.get("provider")
        })

    if not formatted_events:
        return

    try:
        driver = get_driver()
        async with driver.session() as session:
            await session.run(MERGE_THREAT_QUERY_BATCH, events=formatted_events)
    except Exception as e:
        logger.error(f"Failed to execute Cypher MERGE batch: {e}")

async def write_threat_event(log_entry: dict, normalized_hash: str) -> None:
    """Fallback single write for backward compatibility."""
    await write_threat_events_batch([{"log_entry": log_entry, "normalized_hash": normalized_hash}])
