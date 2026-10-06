"""
Seed Neo4j Threat Graph from MongoDB firewall_logs
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from neo4j import AsyncGraphDatabase
from dotenv import load_dotenv

load_dotenv('backend/.env')

NEO4J_URI = os.getenv("NEO4J_URI", "neo4j+s://04935f05.databases.neo4j.io")
NEO4J_USER = os.getenv("NEO4J_USER", "04935f05")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "Qw2Nf_Ie5Ro55k58OZpL9SX5qkI-z2GmXBLbyPmFj8I")
MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB", "llm_firewall")

MERGE_QUERY = """
UNWIND $events AS event
MERGE (k:ApiKey {key_id: event.key_id})
MERGE (a:AttackType {name: event.attack_type})
MERGE (l:FlaggedLayer {name: event.flagged_layer})
MERGE (p:FlaggedPattern {text: event.flagged_pattern})
MERGE (h:PromptHash {hash: event.prompt_hash})
MERGE (h_norm:PromptHash {hash: event.normalized_hash})
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

async def seed():
    print(f"Connecting to MongoDB ({MONGODB_DB})...")
    m_client = AsyncIOMotorClient(MONGODB_URI)
    m_db = m_client[MONGODB_DB]

    print(f"Connecting to Neo4j ({NEO4J_URI})...")
    driver = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    await driver.verify_connectivity()
    print("[OK] Neo4j connected")

    # Indexes
    queries = [
        "CREATE INDEX api_key_id IF NOT EXISTS FOR (k:ApiKey) ON (k.key_id);",
        "CREATE INDEX attack_type_name IF NOT EXISTS FOR (a:AttackType) ON (a.name);",
        "CREATE INDEX prompt_hash IF NOT EXISTS FOR (h:PromptHash) ON (h.hash);"
    ]
    async with driver.session() as s:
        for q in queries:
            await s.run(q)
    print("[OK] Neo4j indexes ready")

    cursor = m_db.firewall_logs.find({"safe": False})
    events = []
    async for doc in cursor:
        raw_attack = doc.get("attack_type") or "unknown_attack"
        if raw_attack.lower() == "safe":
            raw_attack = "cumulative_risk_exceeded"
        normalized_attack = raw_attack.lower().replace(" ", "_")
        ts = doc.get("timestamp")
        events.append({
            "key_id": str(doc.get("api_key_id", "unknown")),
            "attack_type": normalized_attack,
            "flagged_layer": doc.get("flagged_layer") or "unknown_layer",
            "flagged_pattern": str(doc.get("flagged_pattern") or "none"),
            "prompt_hash": doc.get("prompt_hash", "unknown_hash"),
            "normalized_hash": doc.get("prompt_hash", "unknown_hash"),
            "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
            "risk_score": float(doc.get("risk_score", 0.0)),
            "provider": doc.get("provider")
        })

    print(f"Found {len(events)} threat events in MongoDB.")
    async with driver.session() as s:
        batch_size = 50
        for i in range(0, len(events), batch_size):
            chunk = events[i:i + batch_size]
            await s.run(MERGE_QUERY, events=chunk)
            print(f"Seeded {min(i + batch_size, len(events))}/{len(events)} events...")

        res1 = await s.run("MATCH (n) RETURN count(n) AS node_count")
        r1 = await res1.single()
        res2 = await s.run("MATCH ()-[r]->() RETURN count(r) AS rel_count")
        r2 = await res2.single()
        print(f"[OK] SEED COMPLETE! Neo4j Nodes: {r1['node_count']}, Relationships: {r2['rel_count']}")

    await driver.close()

if __name__ == "__main__":
    asyncio.run(seed())
