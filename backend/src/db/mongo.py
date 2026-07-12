"""
MongoDB Connection & Collections (Motor async driver)

Collections:
  - firewall_logs: Per-request classification results
  - api_keys: API key management
  - daily_stats: Pre-aggregated daily statistics
"""

import logging
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

logger = logging.getLogger("llm_firewall.db.mongo")

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


async def connect(uri: str, db_name: str = "llm_firewall") -> AsyncIOMotorDatabase:
    """Connect to MongoDB and return the database instance."""
    global _client, _db
    try:
        _client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=5000)
        # Verify connection
        await _client.admin.command("ping")
        _db = _client[db_name]
        
        # Create indexes
        await _create_indexes(_db)
        
        logger.info(f"Connected to MongoDB: {db_name}")
        return _db
    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")
        raise


async def _create_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create necessary indexes for performance."""
    # users
    users = db.users
    await users.create_index("email", unique=True)

    # firewall_logs
    logs = db.firewall_logs
    await logs.create_index("request_id", unique=True)
    await logs.create_index("timestamp")
    await logs.create_index("api_key_id")
    await logs.create_index("user_id")
    await logs.create_index("session_id")
    await logs.create_index("client_ip")
    await logs.create_index("safe")
    await logs.create_index("attack_type")
    await logs.create_index("provider")
    await logs.create_index([("timestamp", -1), ("safe", 1)])

    # api_keys
    keys = db.api_keys
    await keys.create_index("key_hash", unique=True)
    await keys.create_index("is_active")
    await keys.create_index("user_id")

    # daily_stats
    stats = db.daily_stats
    await stats.create_index([("api_key_id", 1), ("date", 1)], unique=True)

    logger.info("MongoDB indexes created")


def get_db() -> AsyncIOMotorDatabase:
    """Get the current database instance."""
    if _db is None:
        raise RuntimeError("MongoDB not connected. Call connect() first.")
    return _db


def get_users_collection():
    return get_db().users


def get_logs_collection():
    return get_db().firewall_logs


def get_keys_collection():
    return get_db().api_keys


def get_stats_collection():
    return get_db().daily_stats


async def disconnect() -> None:
    """Close the MongoDB connection."""
    global _client, _db
    if _client:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB disconnected")


async def is_connected() -> bool:
    """Check if MongoDB is reachable."""
    if _client is None:
        return False
    try:
        await _client.admin.command("ping")
        return True
    except Exception:
        return False
