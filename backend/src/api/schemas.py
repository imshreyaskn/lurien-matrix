"""
Pydantic Models — Request/Response Schemas

All API request validation and response serialization models.
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, EmailStr
import re


# ── Request Schemas ───────────────────────────────────────────

class CheckRequest(BaseModel):
    """Request body for POST /v1/check"""
    prompt: str = Field(..., min_length=1, max_length=10000)
    context: Optional[str] = Field(None, max_length=5000)
    threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    metadata: Optional[dict] = None
    app_context: Optional[str] = Field("general", max_length=100)
    custom_canary: Optional[str] = Field(None, max_length=256)

    @field_validator("prompt")
    @classmethod
    def prompt_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("prompt cannot be empty or whitespace only")
        return v

    @field_validator("metadata")
    @classmethod
    def metadata_size_limit(cls, v: Optional[dict]) -> Optional[dict]:
        if v is not None:
            import json
            if len(json.dumps(v)) > 2048:
                raise ValueError("metadata exceeds 2KB size limit")
        return v


class BatchCheckRequest(BaseModel):
    """Request body for POST /v1/check/batch"""
    prompts: list[str] = Field(..., min_length=1, max_length=10)

    @field_validator("prompts")
    @classmethod
    def prompts_not_empty_and_bounded(cls, v: list[str]) -> list[str]:
        for p in v:
            if not p.strip():
                raise ValueError("prompt cannot be empty or whitespace only")
            if len(p) > 10000:
                raise ValueError("prompt exceeds 10000 character limit")
        return v




class CreateKeyRequest(BaseModel):
    """Request body for POST /v1/keys"""
    name: str = Field(..., max_length=100)
    app_context: Optional[str] = Field(default="general", max_length=100)
    custom_canary: Optional[str] = Field(default=None, max_length=256)
    custom_intent_examples: Optional[list[str]] = Field(default=None)
    use_openai_moderation: bool = Field(default=False)


# ── Response Schemas ──────────────────────────────────────────

class LayerCanary(BaseModel):
    ran: bool = True
    reason: Optional[str] = None
    triggered: Optional[bool] = None
    score: Optional[float] = None
    latency_ms: Optional[float] = None
    matched_canary: Optional[str] = None


class LayerRuleBased(BaseModel):
    ran: bool = True
    reason: Optional[str] = None
    triggered: Optional[bool] = None
    matched_pattern: Optional[str] = None
    attack_category: Optional[str] = None
    score: Optional[float] = None
    latency_ms: Optional[float] = None


class HeuristicSignalsResponse(BaseModel):
    instruction_density: float
    length_anomaly: float
    role_assignment_score: float
    system_context_injection: float
    encoding_entropy: float
    repetition_score: float


class LayerHeuristic(BaseModel):
    ran: bool = True
    reason: Optional[str] = None
    triggered: Optional[bool] = None
    score: Optional[float] = None
    signals: Optional[HeuristicSignalsResponse] = None
    latency_ms: Optional[float] = None


class LayerEmbeddingSimilarity(BaseModel):
    ran: bool = True
    reason: Optional[str] = None
    triggered: Optional[bool] = None
    similarity_score: Optional[float] = None
    nearest_attack_preview: Optional[str] = None
    latency_ms: Optional[float] = None


class LayerMLClassifier(BaseModel):
    ran: bool = True
    reason: Optional[str] = None
    triggered: Optional[bool] = None
    attack_class: Optional[str] = None
    confidence: Optional[float] = None
    all_scores: Optional[dict[str, float]] = None
    latency_ms: Optional[float] = None


class LayerContextPolicy(BaseModel):
    ran: bool = True
    reason: Optional[str] = None
    triggered: Optional[bool] = None
    app_context: Optional[str] = None
    similarity_to_intent: Optional[float] = None
    latency_ms: Optional[float] = None
    score: Optional[float] = None


class LayerOpenAIModeration(BaseModel):
    ran: bool = True
    reason: Optional[str] = None
    triggered: Optional[bool] = None
    score: Optional[float] = None
    flagged_category: Optional[str] = None
    latency_ms: Optional[float] = None


class LayersResponse(BaseModel):
    canary: LayerCanary
    rule_based: LayerRuleBased
    heuristic: LayerHeuristic
    embedding_similarity: LayerEmbeddingSimilarity
    openai_moderation: Optional[LayerOpenAIModeration] = None
    ml_classifier: LayerMLClassifier
    context_policy: LayerContextPolicy


class CheckResponse(BaseModel):
    """Full response for POST /v1/check"""
    request_id: str
    timestamp: str
    safe: bool
    risk_score: float
    attack_type: Optional[str] = None
    confidence: float
    flagged_layer: Optional[str] = None
    flagged_pattern: Optional[str] = None
    threshold_used: float
    layers: LayersResponse
    processing_time_ms: float
    model_version: str
    metadata: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


class BatchCheckResponse(BaseModel):
    results: list[CheckResponse]
    batch_id: str


class FirewallBlockReport(BaseModel):
    """Report returned when proxy blocks a request (403)."""
    error: str = "prompt_blocked"
    firewall_report: dict


class ApiKeyResponse(BaseModel):
    api_key: Optional[str] = None  # Only shown on creation
    key_id: str
    name: str
    created_at: datetime
    is_active: bool
    monthly_usage: int
    total_blocked: int
    total_checks: int
    app_context: Optional[str] = "general"
    custom_canary: Optional[str] = None
    use_openai_moderation: bool = False


class StatsResponse(BaseModel):
    total_checks: int
    flagged_count: int
    blocked_count: int
    flag_rate: float
    block_rate: float
    attack_breakdown: dict[str, int]
    requests_today: int
    requests_this_month: int
    avg_processing_time_ms: float
    top_flagged_patterns: list[dict]
    layer_effectiveness: dict[str, float]


class HealthResponse(BaseModel):
    status: str
    classifier_loaded: bool
    classifier_latency_ms: Optional[float] = None
    db_connected: bool
    redis_connected: bool
    neo4j_connected: bool
    uptime_seconds: int
    model_version: str


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    retry_after_seconds: Optional[int] = None


class RateLimitResponse(BaseModel):
    error: str = "rate_limit_exceeded"
    limit_type: str
    retry_after_seconds: int


# ── Auth Schemas ──────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not re.search(r'[A-Z]', v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r'[a-z]', v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r'\d', v):
            raise ValueError("Password must contain at least one number")
        return v


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
