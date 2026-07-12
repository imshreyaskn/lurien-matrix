import asyncio
import os
import logging
from dotenv import load_dotenv

from src.db.mongo import connect as connect_mongo, disconnect as disconnect_mongo, get_logs_collection
from src.db.neo4j_client import connect as connect_neo4j, disconnect as disconnect_neo4j
from src.db.graph_writer import write_threat_event

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backfill")

async def backfill():
    load_dotenv()
    
    logger.info("Connecting to databases...")
    await connect_mongo(os.getenv("MONGODB_URI", "mongodb://localhost:27017"), os.getenv("MONGODB_DB", "llm_firewall"))
    
    neo4j_uri = os.getenv("NEO4J_URI")
    neo4j_user = os.getenv("NEO4J_USER")
    neo4j_password = os.getenv("NEO4J_PASSWORD")
    
    if not neo4j_uri:
        logger.error("No Neo4j URI found in .env")
        return

    await connect_neo4j(neo4j_uri, neo4j_user, neo4j_password)
    
    collection = get_logs_collection()
    cursor = collection.find({"safe": False})
    
    count = 0
    logger.info("Starting backfill to Neo4j Threat Graph...")
    
    async for log in cursor:
        # Since the raw prompt text is never stored in MongoDB for privacy reasons,
        # we cannot retroactively compute the 'normalized_hash'. 
        # We will fallback to using the original raw hash for the graph nodes.
        raw_hash = log.get("prompt_hash", "unknown_hash")
        
        try:
            await write_threat_event(log, raw_hash)
            count += 1
            if count % 10 == 0:
                logger.info(f"Processed {count} threat events...")
        except Exception as e:
            logger.error(f"Failed to process log {log.get('_id')}: {e}")

    logger.info(f"Backfill complete! Ingested {count} historical threat events into Neo4j.")
    
    await disconnect_neo4j()
    await disconnect_mongo()

if __name__ == "__main__":
    asyncio.run(backfill())
