"""
6-Layer Classifier Pipeline
Orchestrates Canary → Rule-Based → Heuristic → Embedding Similarity → ML → Context Policy layers in sequence.
"""

import time
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass, field, asdict
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="")
request_custom_canary: ContextVar[str] = ContextVar("request_custom_canary", default="")

from src.layers.canary import CanaryTokenDetector
from src.layers.rule_based import RuleBasedLayer
from src.layers.heuristic import HeuristicLayer
from src.layers.embedding_similarity import EmbeddingSimilarityLayer
from src.classifier.inference import InjectionClassifier
from src.layers.context_policy import ContextAwarePolicyLayer
from src.layers.openai_moderation import OpenAIModerationLayer

logger = logging.getLogger("llm_firewall.pipeline")


@dataclass
class PipelineResult:
    """Complete result from the 6-layer classification pipeline."""
    request_id: str
    timestamp: str
    safe: bool
    risk_score: float
    attack_type: Optional[str]
    confidence: float
    flagged_layer: Optional[str]
    flagged_pattern: Optional[str]
    threshold_used: float
    layers: dict
    processing_time_ms: float
    model_version: str = "1.0.0"
    metadata: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dictionary."""
        return asdict(self)


class ClassifierPipeline:
    """
    Orchestrates the 6-layer prompt injection detection pipeline.
    
    Flow:
      0. Canary Token Detection (<1ms)
      1a. Rule-based regex matching (<5ms)
      1b. Heuristic signal analysis (<20ms)  
      2. Embedding Similarity lookup (<15ms)
      3. ML DistilBERT classifier (<100ms)
      4. Context-aware Policy enforcer (<5ms)
    """

    def __init__(
        self,
        rule_based: RuleBasedLayer,
        heuristic: HeuristicLayer,
        classifier: InjectionClassifier,
        canary_detector: CanaryTokenDetector,
        embedding_layer: EmbeddingSimilarityLayer,
        context_policy: ContextAwarePolicyLayer,
        openai_moderation: Optional[OpenAIModerationLayer] = None,
        default_threshold: float = 0.50,
    ) -> None:
        self.rules = rule_based
        self.heuristic = heuristic
        self.ml_classifier = classifier  # Kept as ml_classifier for compatibility
        self.canary = canary_detector
        self.embedding = embedding_layer
        self.policy = context_policy
        self.openai_moderation = openai_moderation
        self.default_threshold = default_threshold
        self.model_version = "1.0.0"

    def load_model(self) -> bool:
        """Load the ML model. Call during app startup."""
        return self.ml_classifier.load()

    @property
    def ml_loaded(self) -> bool:
        return self.ml_classifier.is_loaded

    def classify(
        self,
        text: str,
        threshold: Optional[float] = None,
        metadata: Optional[dict] = None,
        app_context: str = "general",
        custom_canary: Optional[str] = None,
        use_openai_moderation: bool = False,
    ) -> PipelineResult:
        """
        Run the full 6-layer pipeline on the given text.
        """
        start = time.perf_counter()
        threshold = threshold if threshold is not None else self.default_threshold
        request_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        request_id_var.set(request_id)
        request_custom_canary.set(custom_canary or "")
        warnings: list[str] = []

        # Initialize results structure
        layers_data = {}
        cumulative_risk = 0.0

        def update_risk(score: float):
            nonlocal cumulative_risk
            cumulative_risk = 1.0 - ((1.0 - cumulative_risk) * (1.0 - score))
            return cumulative_risk

        # Helper to build short-circuited response
        def build_short_circuit(flagged_name, risk, attack, pattern, running_layers):
            all_layer_names = ["canary", "rule_based", "heuristic", "embedding_similarity", "openai_moderation", "ml_classifier", "context_policy"]
            final_layers = {}
            for name in all_layer_names:
                if name in running_layers:
                    final_layers[name] = running_layers[name]
                else:
                    final_layers[name] = {
                        "ran": False,
                        "reason": f"short_circuited_by_{flagged_name}"
                    }
            return PipelineResult(
                request_id=request_id,
                timestamp=timestamp,
                safe=False,
                risk_score=risk,
                attack_type=attack,
                confidence=risk,
                flagged_layer=flagged_name,
                flagged_pattern=pattern,
                threshold_used=threshold,
                layers=final_layers,
                processing_time_ms=_elapsed_ms(start),
                model_version=self.model_version,
                metadata=metadata or {},
                warnings=warnings
            )

        # ── Layer 0: Canary Detection ──────────────────────────────
        canary_res = self.canary.check(text, custom_canary)
        layers_data["canary"] = {
            "ran": True,
            "triggered": canary_res.triggered,
            "score": canary_res.score,
            "latency_ms": canary_res.latency_ms,
            "matched_canary": canary_res.matched_canary
        }
        if canary_res.triggered:
            return build_short_circuit(
                flagged_name="canary",
                risk=1.0,
                attack="prompt_extraction",
                pattern="canary token detected in user input",
                running_layers=layers_data
            )

        # ── Layer 1a: Rule-Based ───────────────────────────────────
        rule_res = self.rules.analyze(text)
        current_risk = update_risk(rule_res.score)
        is_rule_triggered = rule_res.triggered or (current_risk >= threshold)
        layers_data["rule_based"] = {
            "ran": True,
            "triggered": is_rule_triggered,
            "matched_pattern": rule_res.matched_pattern,
            "score": rule_res.score,
            "latency_ms": rule_res.latency_ms
        }
        if is_rule_triggered:
            return build_short_circuit(
                flagged_name="rule_based",
                risk=current_risk,
                attack=rule_res.attack_category,
                pattern=rule_res.matched_pattern,
                running_layers=layers_data
            )

        # ── Layer 1b: Heuristic Analysis ───────────────────────────
        # Note: pipeline.py uses 0.65 threshold override for Layer 2 Heuristic triggers
        heuristic_res = self.heuristic.analyze(text)
        current_risk = update_risk(heuristic_res.score)
        is_heur_triggered = heuristic_res.triggered or (current_risk >= threshold)
        layers_data["heuristic"] = {
            "ran": True,
            "triggered": is_heur_triggered,
            "score": heuristic_res.score,
            "signals": {
                "instruction_density": heuristic_res.signals.instruction_density,
                "length_anomaly": heuristic_res.signals.length_anomaly,
                "role_assignment_score": heuristic_res.signals.role_assignment_score,
                "system_context_injection": heuristic_res.signals.system_context_injection,
                "encoding_entropy": heuristic_res.signals.encoding_entropy,
                "repetition_score": heuristic_res.signals.repetition_score,
            } if heuristic_res.signals else None,
            "latency_ms": heuristic_res.latency_ms
        }
        if is_heur_triggered:
            return build_short_circuit(
                flagged_name="heuristic",
                risk=current_risk,
                attack="heuristic_composite",
                pattern="heuristic trigger threshold exceeded",
                running_layers=layers_data
            )

        # ── Layer 2: Embedding Similarity ──────────────────────────
        embedding_res = self.embedding.check(text)
        current_risk = update_risk(embedding_res.similarity_score)
        is_emb_triggered = embedding_res.triggered or (current_risk >= threshold)
        layers_data["embedding_similarity"] = {
            "ran": True,
            "triggered": is_emb_triggered,
            "similarity_score": embedding_res.similarity_score,
            "nearest_attack_preview": embedding_res.nearest_attack_preview,
            "latency_ms": embedding_res.latency_ms
        }
        if is_emb_triggered:
            return build_short_circuit(
                flagged_name="embedding_similarity",
                risk=current_risk,
                attack="jailbreak_paraphrase",
                pattern=f"embedding similarity match: {embedding_res.nearest_attack_preview}",
                running_layers=layers_data
            )

        # ── Layer 2.5: OpenAI Moderation (Optional) ────────────────
        # DISABLED PER USER REQUEST
        layers_data["openai_moderation"] = {"ran": False, "reason": "not_enabled"}

        # ── Layer 3: ML Classifier ─────────────────────────────────
        ml_res = self.ml_classifier.predict(text)
        if ml_res.warning:
            warnings.append(ml_res.warning)

        if ml_res.ran and ml_res.all_scores:
            current_risk = update_risk(ml_res.all_scores.get("injection", 0.0))
        else:
            current_risk = cumulative_risk
            
        is_ml_triggered = ml_res.triggered or (current_risk >= threshold)

        layers_data["ml_classifier"] = {
            "ran": ml_res.ran,
            "triggered": is_ml_triggered if ml_res.ran else False,
            "attack_class": ml_res.attack_class,
            "confidence": ml_res.confidence,
            "all_scores": ml_res.all_scores,
            "latency_ms": ml_res.latency_ms
        }
        if ml_res.reason and not ml_res.ran:
            layers_data["ml_classifier"]["reason"] = ml_res.reason

        if is_ml_triggered and ml_res.ran:
            return build_short_circuit(
                flagged_name="ml_classifier",
                risk=current_risk,
                attack=ml_res.attack_class,
                pattern=f"ML classified threat: {ml_res.attack_class} (cumulative)",
                running_layers=layers_data
            )

        # ── Layer 4: Context Policy ────────────────────────────────
        policy_res = self.policy.check(text, app_context)
        current_risk = update_risk(policy_res.score)
        is_policy_triggered = policy_res.triggered or (current_risk >= threshold)
        
        layers_data["context_policy"] = {
            "ran": True,
            "triggered": is_policy_triggered,
            "app_context": policy_res.app_context,
            "similarity_to_intent": policy_res.similarity_to_intent,
            "reason": policy_res.reason,
            "latency_ms": policy_res.latency_ms
        }
        if is_policy_triggered:
            return build_short_circuit(
                flagged_name="context_policy",
                risk=current_risk,
                attack="out_of_scope",
                pattern=f"Out of scope for intent profile '{app_context}' (cumulative)",
                running_layers=layers_data
            )

        # ── All Layers Passed (SAFE) ───────────────────────────────
        risk_score = round(cumulative_risk, 4)

        return PipelineResult(
            request_id=request_id,
            timestamp=timestamp,
            safe=True,
            risk_score=risk_score,
            attack_type=None,
            confidence=risk_score,
            flagged_layer=None,
            flagged_pattern=None,
            threshold_used=threshold,
            layers=layers_data,
            processing_time_ms=_elapsed_ms(start),
            model_version=self.model_version,
            metadata=metadata or {},
            warnings=warnings
        )


def _elapsed_ms(start: float) -> float:
    """Calculate elapsed milliseconds from a perf_counter start."""
    return round((time.perf_counter() - start) * 1000, 2)
