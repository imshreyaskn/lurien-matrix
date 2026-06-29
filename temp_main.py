"""
LLM Firewall — FastAPI Application Entry Point

A production-grade firewall proxy between applications and LLM APIs.
Intercepts and blocks malicious prompts in real-time before they
reach the model.
"""

import os
import time
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

from src.layers.pipeline import ClassifierPipeline
from src.layers.canary import CanaryTokenDetector
from src.layers.rule_based import RuleBasedLayer
from src.layers.heuristic import HeuristicLayer
from src.layers.embedding_similarity import EmbeddingSimilarityLayer
from src.layers.context_policy import ContextAwarePolicyLayer
from src.layers.output_monitor import OutputMonitor

from src.classifier.inference import InjectionClassifier
from src.proxy.engine import ProxyEngine
from src.db import mongo, redis as redis_db
from src.api.errors import (
    http_exception_handler,
    validation_exception_handler,
    general_exception_handler,
)
from src.api.routes import check, proxy, keys, dashboard, health

load_dotenv()

# ── Logging Configuration ─────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-35s │ %(levelname)-7s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("llm_firewall")


# ── App Lifespan ──────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("═══════════════════════════════════════════")
    logger.info("  LLM FIREWALL — Starting up...")
    logger.info("═══════════════════════════════════════════")

    # Record start time
    app.state.start_time = time.time()

    # Connect to MongoDB
    mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    mongo_db = os.getenv("MONGODB_DB", "llm_firewall")
    try:
        await mongo.connect(mongo_uri, mongo_db)
        logger.info("✓ MongoDB connected")
    except Exception as e:
        logger.error(f"✗ MongoDB connection failed: {e}")

    # Connect to Redis
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    try:
        await redis_db.connect(redis_url)
        logger.info("✓ Redis connected")
    except Exception as e:
        logger.warning(f"⚠ Redis unavailable: {e} — rate limiting disabled")

    # Initialize classifier pipeline & components
    model_path = os.getenv("MODEL_PATH", "models/")
    
    try:
        threshold = float(os.getenv("DEFAULT_THRESHOLD", "0.50"))
        if not 0.0 <= threshold <= 1.0:
            raise ValueError
    except ValueError:
        logger.warning("⚠ Invalid DEFAULT_THRESHOLD, defaulting to 0.50")
        threshold = 0.50

    # Load shared SentenceTransformer ONCE
    try:
        logger.info("Loading shared SentenceTransformer ('all-MiniLM-L6-v2')...")
        shared_st_model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("✓ Shared SentenceTransformer loaded")
    except Exception as e:
        logger.error(f"✗ Failed to load SentenceTransformer: {e}")
        shared_st_model = None

    # Initialize all layers
    canary = CanaryTokenDetector()
    rules = RuleBasedLayer()
    heuristic = HeuristicLayer()
    embedding = EmbeddingSimilarityLayer(
        index_path=os.getenv("FAISS_INDEX_PATH", "data/faiss/attack_index.faiss"),
        texts_path=os.getenv("FAISS_TEXTS_PATH", "data/faiss/attack_texts.json"),
        model=shared_st_model,
        threshold=float(os.getenv("EMBEDDING_SIMILARITY_THRESHOLD", "0.85"))
    )
    # The ml classifier expects model folder
    ml = InjectionClassifier(model_path=model_path)
    
    policy = ContextAwarePolicyLayer(model=shared_st_model)
    output_mon = OutputMonitor()

    # Build pipeline
    pipeline = ClassifierPipeline(
        rule_based=rules,
        heuristic=heuristic,
        classifier=ml,
        canary_detector=canary,
        embedding_layer=embedding,
        context_policy=policy,
        default_threshold=threshold
    )
    
    # Load ML model (non-blocking — falls back to rule+heuristic if unavailable)
    model_loaded = pipeline.load_model()
    if model_loaded:
        logger.info("✓ ML classifier loaded (DistilBERT)")
    else:
        logger.warning("⚠ ML classifier unavailable — using rule-based + heuristic only")

    # Load custom profiles from MongoDB to register them at startup
    try:
        if await mongo.is_connected():
            keys_collection = mongo.get_keys_collection()
            if keys_collection is not None:
                cursor = keys_collection.find({"is_active": True, "custom_intent_examples": {"$ne": None}})
                async for doc in cursor:
                    profile_name = str(doc["_id"])
                    examples = doc.get("custom_intent_examples", [])
                    if examples:
                        policy.register_custom_profile(profile_name, examples)
                logger.info("✓ Registered custom intent profiles from MongoDB")
    except Exception as e:
        logger.error(f"Failed to load custom intent profiles: {e}")

    app.state.pipeline = pipeline
    app.state.output_monitor = output_mon

    # Initialize proxy engine
    proxy_engine = ProxyEngine(pipeline=pipeline, output_monitor=output_mon)
    app.state.proxy_engine = proxy_engine

    logger.info("═══════════════════════════════════════════")
    logger.info("  LLM FIREWALL — Ready to protect! 🛡️")
    logger.info("═══════════════════════════════════════════")

    yield

    # Shutdown
    logger.info("Shutting down LLM Firewall...")
    await proxy_engine.close()
    await redis_db.disconnect()
    await mongo.disconnect()


# ── FastAPI App ───────────────────────────────────────────────

app = FastAPI(
    title="LLM Firewall",
    description=(
        "A production-grade firewall proxy between applications and LLM APIs. "
        "Intercepts and blocks malicious prompts using a 6-layer detection pipeline: "
        "canary check, rule-based matching, heuristic analysis, embedding similarity, "
        "fine-tuned DistilBERT classification, and context policy."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────

allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Firewall-Safe",
        "X-Firewall-Risk-Score",
        "X-Firewall-Processing-Ms",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ],
)

# ── Exception Handlers ───────────────────────────────────────

app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

from src.api.routes import check, proxy, keys, dashboard, health, auth

# ── Routes ────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(check.router)
app.include_router(proxy.router)
app.include_router(keys.router)
app.include_router(dashboard.router)
app.include_router(health.router)


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "LLM Firewall",
        "version": "1.0.0",
        "description": "Production-grade firewall proxy for LLM APIs",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "check": "POST /v1/check",
            "batch_check": "POST /v1/check/batch",
            "proxy": "POST /v1/proxy/{provider}",
            "stats": "GET /v1/stats",
            "logs": "GET /v1/logs",
            "keys": "POST /v1/keys",
        },
    }
