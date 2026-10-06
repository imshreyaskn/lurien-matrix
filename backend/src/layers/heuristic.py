"""
Heuristic Analysis Layer (Layer 2)
Target latency: <20ms

Computes 6 weighted signals to produce a composite risk score.
Catches attacks that evade regex patterns through obfuscation or novelty.
"""

import math
import time
import re
from collections import Counter
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class HeuristicSignals:
    """Individual signal scores from heuristic analysis."""
    instruction_density: float = 0.0
    length_anomaly: float = 0.0
    role_assignment_score: float = 0.0
    system_context_injection: float = 0.0
    encoding_entropy: float = 0.0
    repetition_score: float = 0.0


@dataclass
class HeuristicResult:
    """Result from the heuristic analysis layer."""
    ran: bool
    triggered: bool = False
    score: float = 0.0
    signals: Optional[HeuristicSignals] = None
    reason: Optional[str] = None
    latency_ms: float = 0.0


# ── Signal Configuration ──────────────────────────────────────────

SIGNAL_WEIGHTS = {
    "instruction_density": 0.25,
    "length_anomaly": 0.15,
    "role_assignment_score": 0.20,
    "system_context_injection": 0.25,
    "encoding_entropy": 0.10,
    "repetition_score": 0.05,
}

IMPERATIVE_VERBS = frozenset({
    "tell", "show", "reveal", "ignore", "bypass", "disable",
    "override", "forget", "pretend", "act", "become", "change",
    "switch", "output", "print", "display", "write", "generate",
    "produce", "give", "list", "dump", "export", "extract",
    "leak", "expose", "disclose", "share", "provide", "repeat",
})

ROLE_ASSIGNMENT_PHRASES = [
    "you are", "you must", "your role", "your job",
    "your task is", "your purpose", "you will now",
    "from now on you", "you should act", "you shall",
    "your new role", "your mission", "you need to be",
]

SYSTEM_CONTEXT_MARKERS = [
    "system:", "<|",
    "[inst]", "<<sys>>", "###", "---\nsystem",
    "context:", "[system]", "<<SYS>>", "</s>",
    "<s>", "[/inst]",
]


class HeuristicLayer:
    """
    Layer 2: Weighted multi-signal heuristic analysis.
    
    Computes 6 signals and produces a composite risk score.
    Thresholds:
      > 0.65  → flag immediately (attack likely)
      0.35-0.65 → uncertain, pass to ML
      < 0.35  → likely safe, pass to ML for confirmation
    """

    def __init__(self) -> None:
        self.weights = SIGNAL_WEIGHTS
        self.imperative_verbs = IMPERATIVE_VERBS
        self.role_phrases = ROLE_ASSIGNMENT_PHRASES
        self.context_markers = SYSTEM_CONTEXT_MARKERS

    def analyze(self, text: str) -> HeuristicResult:
        """Run all 6 heuristic signals and compute weighted score."""
        start = time.perf_counter()

        if not text or not text.strip():
            return HeuristicResult(
                ran=True,
                triggered=False,
                score=0.0,
                signals=HeuristicSignals(),
                latency_ms=_elapsed_ms(start),
            )

        text_lower = text.lower()
        words = text_lower.split()
        word_count = len(words)

        signals = HeuristicSignals(
            instruction_density=self._instruction_density(words, word_count),
            length_anomaly=self._length_anomaly(word_count),
            role_assignment_score=self._role_assignment(text_lower),
            system_context_injection=self._system_context(text_lower),
            encoding_entropy=self._encoding_entropy(text),
            repetition_score=self._repetition(words),
        )

        score = (
            signals.instruction_density * self.weights["instruction_density"]
            + signals.length_anomaly * self.weights["length_anomaly"]
            + signals.role_assignment_score * self.weights["role_assignment_score"]
            + signals.system_context_injection * self.weights["system_context_injection"]
            + signals.encoding_entropy * self.weights["encoding_entropy"]
            + signals.repetition_score * self.weights["repetition_score"]
        )
        score = round(min(score, 1.0), 4)

        triggered = score > 0.65

        return HeuristicResult(
            ran=True,
            triggered=triggered,
            score=score,
            signals=signals,
            latency_ms=_elapsed_ms(start),
        )

    # ── Signal Implementations ─────────────────────────────────

    def _instruction_density(self, words: list[str], word_count: int) -> float:
        """Signal 1: Ratio of imperative verbs targeting the model."""
        if word_count == 0:
            return 0.0
        count = sum(1 for w in words if w in self.imperative_verbs)
        raw = count / word_count
        # Normalize: 0.3 raw → 1.0
        return round(min(raw / 0.3, 1.0), 4)

    def _length_anomaly(self, word_count: int) -> float:
        """Signal 2: Unusually long prompts (many-shot indicator)."""
        return round(min(word_count / 3000, 1.0), 4)

    def _role_assignment(self, text_lower: str) -> float:
        """Signal 3: Second-person role assignments."""
        count = sum(1 for phrase in self.role_phrases if phrase in text_lower)
        return round(min(count / 3, 1.0), 4)

    def _system_context(self, text_lower: str) -> float:
        """Signal 4: Fake system message framing mid-prompt."""
        for marker in self.context_markers:
            if marker in text_lower:
                return 1.0
        return 0.0

    def _encoding_entropy(self, text: str) -> float:
        """
        Signal 5: Shannon entropy of character distribution.
        Normal English: ~4.0-4.5 bits
        Encoded content: ~5.5-6.0 bits
        """
        if len(text) < 10:
            return 0.0
        freq = Counter(text)
        length = len(text)
        entropy = -sum(
            (count / length) * math.log2(count / length)
            for count in freq.values()
            if count > 0
        )
        return round(max(0.0, (entropy - 4.5) / 1.5), 4)

    def _repetition(self, words: list[str]) -> float:
        """Signal 6: Duplicate 5-word n-gram detection."""
        if len(words) < 10:
            return 0.0
        ngrams = [" ".join(words[i:i+5]) for i in range(len(words) - 4)]
        counts = Counter(ngrams)
        duplicates = sum(1 for count in counts.values() if count > 1)
        return round(min(duplicates / 10, 1.0), 4)


def _elapsed_ms(start: float) -> float:
    """Calculate elapsed milliseconds from a perf_counter start."""
    return round((time.perf_counter() - start) * 1000, 2)
