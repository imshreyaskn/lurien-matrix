"""
Redis Connection & Rate Limiting

Rate limits:
  Free tier:  1000 req/month, 10 req/minute
  Pro tier:   100k req/month, 100 req/minute

Uses atomic INCR + EXPIRE for sliding window counting.
"""

import time
import logging
from typing import Optional
from dataclasses import dataclass
from datetime import datetime, timezone

import redis.asyncio as aioredis

logger = logging.getLogger("llm_firewall.db.redis")

_redis: Optional[aioredis.Redis] = None

RATE_LIMITS = {
    "per_minute": 10000,
    "per_month": 1000000
}


@dataclass
class RateLimitStatus:
    """Current rate limit status for an API key."""
    allowed: bool
    limit_type: Optional[str] = None  # "per_minute" or "per_month"
    limit: int = 0
    remaining: int = 0
    reset_at: int = 0  # Unix timestamp
    retry_after_seconds: int = 0


async def connect(url: str) -> aioredis.Redis:
    """Connect to Redis."""
    global _redis
    try:
        _redis = aioredis.from_url(
            url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=5,
        )
        await _redis.ping()
        logger.info("Connected to Redis")
        return _redis
    except Exception as e:
        logger.warning(f"Redis connection failed: {e}. Rate limiting disabled.")
        _redis = None
        raise


def get_redis() -> Optional[aioredis.Redis]:
    """Get the current Redis instance."""
    return _redis


async def disconnect() -> None:
    """Close the Redis connection."""
    global _redis
    if _redis:
        await _redis.close()
        _redis = None
        logger.info("Redis disconnected")


async def is_connected() -> bool:
    """Check if Redis is reachable."""
    if _redis is None:
        return False
    try:
        await _redis.ping()
        return True
    except Exception:
        return False


async def check_rate_limit(api_key_id: str) -> RateLimitStatus:
    """
    Check and increment rate limits for an API key.
    Uses Redis INCR + EXPIRE for atomic sliding window counting.
    """
    if _redis is None:
        # No Redis = FAIL CLOSED (deny requests when Redis is down)
        return RateLimitStatus(
            allowed=False, 
            limit_type="system_outage",
            retry_after_seconds=30
        )

    limits = RATE_LIMITS
    now = datetime.now(timezone.utc)

    # ── Per-minute check ──
    current_minute = now.strftime("%Y%m%d%H%M")
    minute_key = f"rate:{api_key_id}:minute:{current_minute}"
    
    async with _redis.pipeline(transaction=True) as pipe:
        pipe.incr(minute_key)
        pipe.expire(minute_key, 60, nx=True)
        results = await pipe.execute()
        minute_count = results[0]

    if minute_count > limits["per_minute"]:
        ttl = await _redis.ttl(minute_key)
        return RateLimitStatus(
            allowed=False,
            limit_type="per_minute",
            limit=limits["per_minute"],
            remaining=0,
            reset_at=int(time.time()) + max(ttl, 1),
            retry_after_seconds=max(ttl, 1),
        )

    # ── Per-month check ──
    month_key = f"rate:{api_key_id}:month:{now.strftime('%Y-%m')}"
    
    async with _redis.pipeline(transaction=True) as pipe:
        pipe.incr(month_key)
        pipe.expire(month_key, 31 * 24 * 3600, nx=True)
        results = await pipe.execute()
        month_count = results[0]

    if month_count > limits["per_month"]:
        ttl = await _redis.ttl(month_key)
        return RateLimitStatus(
            allowed=False,
            limit_type="per_month",
            limit=limits["per_month"],
            remaining=0,
            reset_at=int(time.time()) + max(ttl, 1),
            retry_after_seconds=max(ttl, 1),
        )

    return RateLimitStatus(
        allowed=True,
        limit=limits["per_minute"],
        remaining=limits["per_minute"] - minute_count,
        reset_at=int(time.time()) + 60,
    )
