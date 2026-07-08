"""
ML Classifier — DistilBERT Inference (Layer 3)
Target latency: <100ms on CPU

Fine-tuned DistilBertForSequenceClassification for 7-class
prompt injection detection. Runs locally — never calls an external API.
"""

import time
import logging
from typing import Optional
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("llm_firewall.classifier")

# Labels for the binary classification model
LABELS = [
    "safe",
    "role_override",
    "goal_hijacking",
    "context_poisoning",
    "tool_manipulation",
    "cascading_amplification",
]

LABEL_TO_IDX = {label: idx for idx, label in enumerate(LABELS)}


@dataclass
class MLResult:
    """Result from the ML classifier layer."""
    ran: bool
    triggered: bool = False
    attack_class: Optional[str] = None
    confidence: Optional[float] = None
    all_scores: Optional[dict[str, float]] = None
    reason: Optional[str] = None
    latency_ms: float = 0.0
    warning: Optional[str] = None


class InjectionClassifier:
    """
    DistilBERT-based prompt injection classifier.
    
    Loads a fine-tuned checkpoint on startup and runs inference
    locally. Falls back gracefully if model is unavailable.
    """

    def __init__(
        self,
        model_path: str = "models/",
        max_length: int = 256,
        timeout_ms: float = 2000.0,
        device: Optional[str] = None,
    ) -> None:
        self.model_path = Path(model_path)
        self.max_length = max_length
        self.timeout_ms = timeout_ms
        self.model = None
        self.tokenizer = None
        self.device = device
        self._loaded = False
        self._load_error: Optional[str] = None

    def load(self) -> bool:
        """
        Load the model and tokenizer from checkpoint.
        Returns True if successful, False otherwise.
        """
        try:
            import torch
            from transformers import AutoTokenizer
            from optimum.onnxruntime import ORTModelForSequenceClassification

            # We will force CPU if no device specified
            self.device = self.device or "cpu"

            model_dir = str(self.model_path)

            # Check if the model directory exists and has files
            if not self.model_path.exists():
                logger.warning(
                    f"Model directory not found: {model_dir}. "
                    "ML classifier will be unavailable."
                )
                self._load_error = "model_directory_not_found"
                return False

            logger.info(f"Loading ONNX DistilBERT from {model_dir} on {self.device}...")

            self.tokenizer = AutoTokenizer.from_pretrained(model_dir)
            self.model = ORTModelForSequenceClassification.from_pretrained(
                model_dir,
                provider="CPUExecutionProvider",
                file_name="model_quantized.onnx",
            )

            self._loaded = True
            logger.info("DistilBERT classifier loaded successfully.")
            return True

        except Exception as e:
            logger.error(f"Failed to load ML classifier: {e}")
            self._load_error = str(e)
            return False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def predict(self, text: str) -> MLResult:
        """
        Run inference on a single prompt.
        
        Returns MLResult with attack classification and confidence scores.
        Falls back gracefully on any error.
        """
        start = time.perf_counter()

        if not self._loaded:
            return MLResult(
                ran=False,
                reason="ml_classifier_unavailable",
                warning="ml_classifier_unavailable",
                latency_ms=_elapsed_ms(start),
            )

        try:
            import torch

            # Tokenize
            inputs = self.tokenizer(
                text,
                truncation=True,
                padding=True,
                max_length=self.max_length,
                return_tensors="pt",
            )
            if self.device != "cpu":
                inputs = {k: v.to(self.device) for k, v in inputs.items()}

            # Inference
            with torch.no_grad():
                logits = self.model(**inputs).logits

            # Check timeout
            elapsed = _elapsed_ms(start)
            if elapsed > self.timeout_ms:
                return MLResult(
                    ran=True,
                    triggered=False,
                    reason="ml_classifier_timeout",
                    warning="ml_classifier_timeout",
                    latency_ms=elapsed,
                )

            # Softmax probabilities
            probs = torch.softmax(logits, dim=-1).squeeze()
            label_idx = probs.argmax().item()
            confidence = round(probs[label_idx].item(), 4)

            all_scores = {
                LABELS[i]: round(probs[i].item(), 4)
                for i in range(len(LABELS))
            }

            attack_class = LABELS[label_idx]
            triggered = attack_class != "safe"

            return MLResult(
                ran=True,
                triggered=triggered,
                attack_class=attack_class,
                confidence=confidence,
                all_scores=all_scores,
                latency_ms=_elapsed_ms(start),
            )

        except RuntimeError as e:
            return MLResult(
                ran=False,
                reason=f"inference_error: {str(e)[:200]}",
                warning="ml_classifier_error",
                latency_ms=_elapsed_ms(start),
            )

        except Exception as e:
            logger.error(f"ML classifier error: {e}")
            return MLResult(
                ran=False,
                reason=f"inference_error: {str(e)[:200]}",
                warning="ml_classifier_error",
                latency_ms=_elapsed_ms(start),
            )


def _elapsed_ms(start: float) -> float:
    """Calculate elapsed milliseconds from a perf_counter start."""
    return round((time.perf_counter() - start) * 1000, 2)
