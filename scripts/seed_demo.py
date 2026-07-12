"""
seed_demo.py — Seed a fully-polluted demo account into MongoDB.

Creates:
  - 1 demo user  (demo@lurien.ai / demo1234)
  - 4 API keys   (Production, HR Bot, Coding Assistant, Research Agent)
  - ~300 firewall logs spread across 30 days with realistic attack patterns

Run from the project root:
    python scripts/seed_demo.py

Idempotent: re-running wipes existing demo data and re-seeds fresh.
"""

import asyncio
import hashlib
import hmac
import os
import random
import string
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from motor.motor_asyncio import AsyncIOMotorClient

# ── Config ────────────────────────────────────────────────────────────────────
MONGODB_URI = os.getenv(
    "MONGODB_URI",
    "mongodb://sabharishc98:MustBeTheWater@ac-0kesxwy-shard-00-00.hnlcjkk.mongodb.net:27017,"
    "ac-0kesxwy-shard-00-01.hnlcjkk.mongodb.net:27017,"
    "ac-0kesxwy-shard-00-02.hnlcjkk.mongodb.net:27017/"
    "?ssl=true&replicaSet=atlas-ttqpy7-shard-0&authSource=admin&appName=sab"
)
MONGODB_DB = os.getenv("MONGODB_DB", "llm_firewall")
API_KEY_PEPPER = os.getenv("API_KEY_PEPPER", "change_me_to_a_random_string_in_production")

DEMO_EMAIL = "demo@lurien.ai"
DEMO_PASSWORD = "demo1234"

# ── Attack catalogue ──────────────────────────────────────────────────────────
ATTACK_TYPES = [
    "DIRECT_INJECTION",
    "PERSONA_HIJACKING",
    "PRIVILEGE_ESCALATION",
    "SYSTEM_PROMPT_EXTRACTION",
    "INDIRECT_INJECTION",
    "MANY_SHOT",
    "OBFUSCATION_AND_EVASION",
    "ENCODING_ATTACKS",
]

FLAGGED_LAYERS = [
    "rule_based",
    "rule_based",
    "rule_based",       # most common
    "heuristic",
    "heuristic",
    "embedding_similarity",
    "ml_classifier",
    "ml_classifier",
    "context_policy",
]

FLAGGED_PATTERNS = {
    "rule_based": [
        "ignore_previous_instructions",
        "jailbreak_dan",
        "reverse_text_injection",
        "role_override_keyword",
        "token_smuggling",
    ],
    "heuristic": [
        "high_instruction_density",
        "entropy_anomaly",
        "abnormal_length",
        "role_assignment_anomaly",
    ],
    "embedding_similarity": [
        "near_match_known_attack_vector",
    ],
    "ml_classifier": [
        "distilbert_high_confidence",
        "cascading_amplification_pattern",
    ],
    "context_policy": [
        "out_of_scope_for_hr_bot",
        "out_of_scope_for_coding_assistant",
        "intent_mismatch",
    ],
}

KEY_CONFIGS = [
    {"name": "Production API", "app_context": "general"},
    {"name": "HR Bot",         "app_context": "hr_assistant"},
    {"name": "Coding Assistant","app_context": "coding_assistant"},
    {"name": "Research Agent", "app_context": "research_agent"},
]

PROVIDERS = ["openai", "anthropic", "groq", None, None]  # None = direct check


# ── Helpers ───────────────────────────────────────────────────────────────────
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def generate_api_key() -> str:
    return f"fw_live_{uuid.uuid4().hex}{uuid.uuid4().hex[:8]}"


def hash_api_key(key: str) -> str:
    return hmac.new(
        API_KEY_PEPPER.encode(),
        key.encode(),
        hashlib.sha256,
    ).hexdigest()


def hash_prompt(prompt: str) -> str:
    return hashlib.sha256(prompt.encode()).hexdigest()


def rand_ip() -> str:
    return f"{random.randint(1,254)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"


def make_log(key_id, user_id, provider, now_base: datetime, offset_minutes: int, safe: bool):
    ts = now_base - timedelta(minutes=offset_minutes)
    attack_type = None if safe else random.choice(ATTACK_TYPES)
    flagged_layer = None if safe else random.choice(FLAGGED_LAYERS)
    flagged_pattern = None
    if flagged_layer:
        flagged_pattern = random.choice(FLAGGED_PATTERNS.get(flagged_layer, ["unknown"]))

    risk_score = round(random.uniform(0.0, 0.25), 4) if safe else round(random.uniform(0.55, 1.0), 4)
    confidence = round(random.uniform(0.5, 0.99), 4) if not safe else round(random.uniform(0.01, 0.3), 4)

    layers = {
        "canary": {"ran": True, "score": 0.0, "matched_canary": None},
        "rule_based": {
            "ran": True, "triggered": not safe and flagged_layer == "rule_based",
            "matched_pattern": flagged_pattern if flagged_layer == "rule_based" else None,
            "attack_category": attack_type, "score": round(risk_score * 0.4, 4), "latency_ms": random.randint(1, 5),
        },
        "heuristic": {
            "ran": True, "score": round(risk_score * 0.5, 4),
            "signals": {"instruction_density": round(random.uniform(0.1, 0.9), 3)},
        },
        "embedding_similarity": {
            "ran": True,
            "similarity_score": round(random.uniform(0.4, 0.95), 4) if not safe else round(random.uniform(0.01, 0.3), 4),
            "nearest_attack_preview": "ignore all previous" if not safe else None,
        },
        "ml_classifier": {
            "ran": True,
            "attack_class": attack_type,
            "confidence": confidence,
            "all_scores": {t: round(random.uniform(0, 0.2), 4) for t in ATTACK_TYPES},
        },
        "context_policy": {
            "ran": True,
            "app_context": "general",
            "similarity_to_intent": round(random.uniform(0.05, 0.5), 4) if not safe else round(random.uniform(0.6, 1.0), 4),
        },
    }

    return {
        "request_id": str(uuid.uuid4()),
        "api_key_id": str(key_id),
        "user_id": user_id,
        "session_id": str(uuid.uuid4()),
        "client_ip": rand_ip(),
        "timestamp": ts,
        "prompt_hash": hash_prompt(f"demo_prompt_{uuid.uuid4().hex}"),
        "prompt_length": random.randint(40, 800),
        "safe": safe,
        "risk_score": risk_score,
        "attack_type": attack_type,
        "confidence": confidence,
        "flagged_layer": flagged_layer,
        "flagged_pattern": flagged_pattern,
        "provider": provider,
        "model": f"{provider}-4o-mini" if provider == "openai" else (f"{provider}-3-haiku" if provider == "anthropic" else None),
        "blocked": not safe,
        "layers": layers,
        "processing_time_ms": round(random.uniform(8, 35), 2),
        "model_version": "1.0.0",
        "metadata": {},
    }


# -- Main ----------------------------------------------------------------------
async def seed():
    client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=8000)
    db = client[MONGODB_DB]

    print("[OK] Connected to MongoDB.")

    # -- Wipe existing demo data ------------------------------------------------
    existing_user = await db.users.find_one({"email": DEMO_EMAIL})
    if existing_user:
        uid = existing_user["_id"]
        await db.api_keys.delete_many({"user_id": uid})
        await db.firewall_logs.delete_many({"user_id": uid})
        await db.users.delete_one({"_id": uid})
        print("[OK] Wiped existing demo account.")

    # -- Create demo user -------------------------------------------------------
    now = datetime.now(timezone.utc)
    user_doc = {
        "email": DEMO_EMAIL,
        "hashed_password": hash_password(DEMO_PASSWORD),
        "created_at": now - timedelta(days=32),
    }
    result = await db.users.insert_one(user_doc)
    user_id = result.inserted_id
    print(f"[OK] Created demo user: {DEMO_EMAIL} / {DEMO_PASSWORD}  (id={user_id})")

    # -- Create API keys --------------------------------------------------------
    key_ids = []
    for cfg in KEY_CONFIGS:
        raw = generate_api_key()
        key_doc = {
            "user_id": user_id,
            "key_hash": hash_api_key(raw),
            "name": cfg["name"],
            "created_at": now - timedelta(days=30),
            "last_used_at": now - timedelta(minutes=3),
            "is_active": True,
            "monthly_usage": 0,    # will be patched after log insert
            "monthly_reset_date": now.replace(day=1),
            "total_blocked": 0,
            "total_checks": 0,
            "app_context": cfg["app_context"],
            "custom_canary": None,
            "custom_intent_examples": None,
            "use_openai_moderation": False,
        }
        r = await db.api_keys.insert_one(key_doc)
        key_ids.append(r.inserted_id)
        print(f"  Key: {cfg['name']} -> {raw[:28]}...")

    # -- Generate logs ----------------------------------------------------------
    # ~300 logs over 30 days: 65% safe, 35% blocked -- realistic for a monitored prod env
    logs = []
    now_base = datetime.now(timezone.utc)
    total_logs = 320

    for i in range(total_logs):
        key_id = random.choice(key_ids)
        provider = random.choice(PROVIDERS)
        # Cluster attacks in spikes -- more realistic telemetry
        # Every ~50 logs there's a "campaign" with higher attack density
        in_spike = (i % 55) < 12
        safe = random.random() > (0.25 if in_spike else 0.62)
        offset_minutes = int(random.uniform(0, 30 * 24 * 60))  # random point in last 30 days
        logs.append(make_log(key_id, user_id, provider, now_base, offset_minutes, safe))

    await db.firewall_logs.insert_many(logs)
    print(f"[OK] Inserted {len(logs)} firewall logs.")

    # -- Patch key counters to match logs --------------------------------------
    for kid in key_ids:
        total = sum(1 for l in logs if l["api_key_id"] == str(kid))
        blocked = sum(1 for l in logs if l["api_key_id"] == str(kid) and not l["safe"])
        await db.api_keys.update_one(
            {"_id": kid},
            {"$set": {"total_checks": total, "total_blocked": blocked, "monthly_usage": total}},
        )

    client.close()
    print("\nDemo account seeded successfully!")
    print(f"   Login: {DEMO_EMAIL} / {DEMO_PASSWORD}")
    print("   The dashboard will show a fully-populated threat intelligence view.")


if __name__ == "__main__":
    asyncio.run(seed())
