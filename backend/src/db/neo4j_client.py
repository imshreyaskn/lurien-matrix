"""
Neo4j Connection & Async Write Queue

Connects to Neo4j (AuraDB) and maintains a bounded async queue
for fire-and-forget threat event writes, ensuring the firewall
pipeline is never blocked by database latency.
"""

import asyncio
import logging
from typing import Optional
from neo4j import AsyncGraphDatabase, AsyncDriver

logger = logging.getLogger("llm_firewall.db.neo4j")

_driver: Optional[AsyncDriver] = None
_write_queue: Optional[asyncio.Queue] = None
_worker_task: Optional[asyncio.Task] = None

# Max queued writes before we start dropping them (load shedding)
MAX_QUEUE_SIZE = 500


async def connect(uri: str, user: str, password: str) -> None:
    """Connect to Neo4j, create indexes, and start the background writer task."""
    global _driver, _write_queue, _worker_task

    if not uri or not user or not password:
        logger.warning("Neo4j credentials not provided. Threat Graph will be offline.")
        return

    try:
        # max_connection_pool_size=5 is appropriate for our FastAPI workers
        _driver = AsyncGraphDatabase.driver(
            uri, auth=(user, password), max_connection_pool_size=5
        )
        # Verify connection
        await _driver.verify_connectivity()
        
        # Create indexes
        await _create_indexes()

        # Initialize the bounded write queue and worker task
        _write_queue = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
        _worker_task = asyncio.create_task(_writer_worker())
        
        logger.info("Connected to Neo4j (Threat Graph active)")
    except Exception as e:
        logger.error(f"Neo4j connection failed: {e}")
        if _driver:
            await _driver.close()
            _driver = None


async def _create_indexes() -> None:
    """Create necessary constraints/indexes for the threat graph."""
    if not _driver:
        return
        
    queries = [
        "CREATE INDEX api_key_id IF NOT EXISTS FOR (k:ApiKey) ON (k.key_id);",
        "CREATE INDEX attack_type_name IF NOT EXISTS FOR (a:AttackType) ON (a.name);",
        "CREATE INDEX prompt_hash IF NOT EXISTS FOR (h:PromptHash) ON (h.hash);"
    ]
    
    try:
        async with _driver.session() as session:
            for q in queries:
                await session.run(q)
        logger.info("Neo4j indexes verified")
    except Exception as e:
        logger.error(f"Failed to create Neo4j indexes: {e}")


def get_driver() -> AsyncDriver:
    """Get the active Neo4j driver."""
    if _driver is None:
        raise RuntimeError("Neo4j not connected. Call connect() first.")
    return _driver


async def enqueue_write(func, *args, **kwargs) -> bool:
    """
    Push a database write task into the background queue.
    Returns True if enqueued, False if the queue is full (load shedding).
    """
    if _write_queue is None:
        return False
        
    try:
        _write_queue.put_nowait((func, args, kwargs))
        return True
    except asyncio.QueueFull:
        logger.warning("Neo4j write queue is full! Dropping threat event to save memory.")
        return False


async def _writer_worker():
    """Background task that drains the write queue in batches."""
    logger.info("Neo4j background writer started")
    from src.db.graph_writer import write_threat_events_batch
    
    while True:
        if _write_queue is None:
            break
            
        try:
            # Wait for at least one item
            item = await _write_queue.get()
            batch = [item]
            _write_queue.task_done()
            
            # Drain up to 100 items per batch
            while len(batch) < 100:
                try:
                    next_item = _write_queue.get_nowait()
                    batch.append(next_item)
                    _write_queue.task_done()
                except asyncio.QueueEmpty:
                    break
                    
            if batch:
                try:
                    events_data = []
                    for func, args, kwargs in batch:
                        events_data.append({
                            "log_entry": args[0],
                            "normalized_hash": args[1]
                        })
                    await write_threat_events_batch(events_data)
                except Exception as e:
                    logger.error(f"Background Neo4j batch write failed: {e}")
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Neo4j worker error: {e}")
            await asyncio.sleep(1)



async def disconnect() -> None:
    """Stop the worker and close the Neo4j connection."""
    global _driver, _write_queue, _worker_task
    
    # Cancel the background worker
    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
        _worker_task = None
        
    _write_queue = None

    if _driver:
        await _driver.close()
        _driver = None
        logger.info("Neo4j disconnected")


async def is_connected() -> bool:
    """Check if Neo4j driver is configured (passive check)."""
    return _driver is not None
