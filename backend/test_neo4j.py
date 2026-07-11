import asyncio
import os
import time
from dotenv import load_dotenv
from neo4j import AsyncGraphDatabase

load_dotenv()

async def test():
    d = AsyncGraphDatabase.driver(
        os.environ['NEO4J_URI'], 
        auth=(os.environ['NEO4J_USER'], os.environ['NEO4J_PASSWORD'])
    )
    try:
        await d.verify_connectivity()
        print('Neo4j Connection Successful!')
    except Exception as e:
        print(f"Connection failed: {e}")
        exit(1)
    finally:
        await d.close()

if __name__ == '__main__':
    asyncio.run(test())
