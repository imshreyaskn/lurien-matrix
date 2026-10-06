from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from pydantic import BaseModel
from typing import Optional
import numpy as np
import time

INTENT_PROFILES = {
    "general": [],           # No restrictions, always passes

    "coding_assistant": [
        "write code", "debug function", "explain algorithm",
        "code review", "fix bug", "refactor code",
        "explain error", "unit test", "implement feature",
        "programming language", "software architecture",
        "API design", "database query", "deployment"
    ],

    "recipe_bot": [
        "recipe", "ingredient", "cooking", "bake", "meal",
        "food preparation", "kitchen", "dish", "cuisine",
        "nutrition", "cooking technique", "flavor"
    ],

    "customer_support": [
        "order status", "refund", "shipping", "account help",
        "billing issue", "product return", "technical support",
        "subscription", "payment", "delivery", "complaint"
    ],

    "education": [
        "explain concept", "learn about", "study", "homework",
        "academic", "research", "history", "science", "math",
        "literature", "quiz", "exam preparation"
    ],

    "hr_assistant": [
        "leave request", "employee policy", "onboarding",
        "performance review", "payroll", "benefits",
        "job description", "hiring", "resignation"
    ],
}

class PolicyResult(BaseModel):
    triggered: bool
    app_context: str
    similarity_to_intent: float
    reason: str             # "out_of_scope" | "within_scope" | "no_policy"
    score: float
    latency_ms: float
    ran: bool = True

class ContextAwarePolicyLayer:
    # Out-of-scope threshold: if max similarity to ANY intent
    # example is below this, the prompt is out of scope.
    # Tune per app_context if needed.
    OUT_OF_SCOPE_THRESHOLD = 0.35

    def __init__(self, model):
        # Injected shared SentenceTransformer instance
        self.model = model
        self._profile_embeddings = {}
        self._build_profile_embeddings()

    def _build_profile_embeddings(self):
        """
        Pre-compute and cache embeddings for all intent profiles
        at startup. These never change at runtime.
        ~10ms one-time cost. Zero cost per request.
        """
        for profile, examples in INTENT_PROFILES.items():
            if examples:
                self._profile_embeddings[profile] = \
                    self.model.encode(examples, normalize_embeddings=True)

    def check(
        self,
        prompt: str,
        app_context: str = "general"
    ) -> PolicyResult:
        start = time.perf_counter()

        if app_context == "general" or \
           app_context not in self._profile_embeddings:
            latency = (time.perf_counter() - start) * 1000
            return PolicyResult(
                triggered=False,
                app_context=app_context,
                similarity_to_intent=1.0,
                reason="no_policy",
                score=0.0,
                latency_ms=round(latency, 3),
                ran=True
            )

        prompt_emb   = self.model.encode([prompt], normalize_embeddings=True)
        profile_embs = self._profile_embeddings[app_context]

        similarities = cosine_similarity(prompt_emb, profile_embs)[0]
        max_sim      = float(similarities.max())

        triggered = max_sim < self.OUT_OF_SCOPE_THRESHOLD
        latency   = (time.perf_counter() - start) * 1000

        return PolicyResult(
            triggered=triggered,
            app_context=app_context,
            similarity_to_intent=round(max_sim, 4),
            reason="out_of_scope" if triggered else "within_scope",
            score=round(1.0 - max_sim, 4) if triggered else 0.0,
            latency_ms=round(latency, 3),
            ran=True
        )

    def register_custom_profile(
        self,
        profile_name: str,
        examples: list[str]
    ):
        """
        Allows developers to register a custom intent profile
        via the API at runtime. Embeddings computed once on
        registration, cached for all subsequent requests.
        """
        self._profile_embeddings[profile_name] = \
            self.model.encode(examples, normalize_embeddings=True)
        INTENT_PROFILES[profile_name] = examples
