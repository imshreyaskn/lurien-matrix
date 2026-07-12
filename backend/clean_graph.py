import asyncio
import os
from dotenv import load_dotenv
from src.db.neo4j_client import connect, get_driver, disconnect

async def main():
    load_dotenv()
    await connect(os.getenv("NEO4J_URI"), os.getenv("NEO4J_USER"), os.getenv("NEO4J_PASSWORD"))
    driver = get_driver()
    async with driver.session() as session:
        await session.run("MATCH (n) DETACH DELETE n")
    print("Graph cleared")
    await disconnect()

asyncio.run(main())
