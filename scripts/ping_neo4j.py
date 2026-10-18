"""
Keep-alive ping for Neo4j Threat Graph & Health Check
"""
import os
import asyncio
from neo4j import AsyncGraphDatabase

NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USER = os.getenv("NEO4J_USER")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

async def ping():
    if not (NEO4J_URI and NEO4J_USER and NEO4J_PASSWORD):
        print("Neo4j ping skipped: credentials not configured in environment.")
        return
    try:
        driver = AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        await driver.verify_connectivity()
        async with driver.session() as session:
            result = await session.run("RETURN 1 AS alive")
            record = await result.single()
            if record and record["alive"] == 1:
                print("Neo4j keep-alive ping successful!")
        await driver.close()
    except Exception as e:
        print(f"Neo4j ping failed: {e}")

if __name__ == "__main__":
    asyncio.run(ping())
