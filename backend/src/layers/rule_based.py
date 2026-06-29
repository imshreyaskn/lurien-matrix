"""
Rule-Based Detection Layer (Layer 1)
Target latency: <5ms

Regex and string matching for known prompt injection patterns.
Short-circuits immediately on match — no further layers needed.
"""

import re
import time
import unicodedata
import base64
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class RuleBasedResult:
    """Result from the rule-based detection layer."""
    triggered: bool
    matched_pattern: Optional[str] = None
    attack_category: Optional[str] = None
    score: float = 0.0
    latency_ms: float = 0.0


# ── Pattern Registry ──────────────────────────────────────────────

PATTERNS: dict[str, list[tuple[str, str]]] = {
    "DIRECT_INJECTION": [
        (r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules|directions)", "ignore previous instructions"),
        (r"disregard\s+(your|all|the|previous)", "disregard your instructions"),
        (r"forget\s+(everything|all|anything)\s+(above|before|previous)", "forget everything above"),
        (r"override\s+(previous|prior|all|your)", "override previous"),
        (r"new\s+instructions\s*:", "new instructions:"),
        (r"do\s+not\s+follow\s+(your|the|any)\s+(previous|original|initial)", "do not follow previous"),
        (r"stop\s+being\s+(an?\s+)?ai", "stop being an AI"),
        (r"ignore\s+your\s+(programming|training|guidelines|safety)", "ignore your programming"),
    ],
    "PERSONA_HIJACKING": [
        (r"you\s+are\s+now\s+(?!going|able|ready|welcome)", "you are now"),
        (r"act\s+as\s+(if\s+you\s+are\s+)?(a|an|the|my)?\s*(?!professional|helpful|assistant)", "act as"),
        (r"pretend\s+(you\s+are|to\s+be|you're)", "pretend you are"),
        (r"your\s+true\s+identity", "your true identity"),
        (r"\bDAN\b", "DAN"),
        (r"\bjailbreak\b", "jailbreak"),
        (r"do\s+anything\s+now", "do anything now"),
        (r"unrestricted\s+mode", "unrestricted mode"),
        (r"developer\s+mode\s+(enabled|activated|on)", "developer mode enabled"),
        (r"evil\s+(mode|persona|version)", "evil mode"),
    ],
    "SYSTEM_OVERRIDE": [
        (r"\[SYSTEM\]", "[SYSTEM]"),
        (r"\[ADMIN\]", "[ADMIN]"),
        (r"\[OVERRIDE\]", "[OVERRIDE]"),
        (r"\[ROOT\]", "[ROOT]"),
        (r"###\s*Instruction", "### Instruction"),
        (r"<\|im_start\|>\s*system", "<|im_start|>system"),
        (r"your\s+real\s+instructions", "your real instructions"),
        (r"without\s+(any\s+)?restrictions", "without restrictions"),
        (r"no\s+restrictions\s+apply", "no restrictions apply"),
        (r"enter\s+(god|admin|sudo|root)\s+mode", "enter admin mode"),
        (r"safety\s+(filters?|guidelines?)\s+(disabled|off|removed)", "safety filters disabled"),
    ],
    "PROMPT_EXTRACTION": [
        (r"(output|print|reveal|show|display|tell\s+me)\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions|rules|directives)", "prompt extraction"),
        (r"what\s+are\s+your\s+(system\s+)?(prompt|instructions|rules|directives)", "prompt extraction query"),
        (r"repeat\s+the\s+words\s+above\s+starting\s+with", "prompt extraction repeat"),
        (r"system\s+prompt\s+word\s+for\s+word", "exact system prompt extraction"),
    ],
    "ENCODING_ATTACKS": [
        (r"[A-Za-z0-9+/]{50,}={0,2}", "base64 encoded content"),
        (r"(\\x[0-9a-fA-F]{2}){5,}", "hex encoded content"),
        (r"&#x?[0-9a-fA-F]+;", "HTML entity encoding"),
    ],
    "MANY_SHOT": [
        (r"(Example\s+\d+\s*:.*?\n){3,}", "repeated example pattern"),
        (r"(Step\s+\d+\s*:.*?\n){4,}", "repeated step pattern"),
    ],
}

# Pre-compile all patterns for performance
COMPILED_PATTERNS: dict[str, list[tuple[re.Pattern, str]]] = {
    category: [(re.compile(pattern, re.IGNORECASE | re.DOTALL), desc) for pattern, desc in patterns]
    for category, patterns in PATTERNS.items()
}

# Case-sensitive patterns (e.g., "DAN" acronym)
CASE_SENSITIVE_PATTERNS = [
    (re.compile(r"\bDAN\b"), "DAN", "PERSONA_HIJACKING"),
    (re.compile(r"\bAIM\b"), "AIM", "PERSONA_HIJACKING"),
]

# Reversed injection phrases to catch reverse-text attacks
REVERSED_PHRASES = [
    "snoitcurtsni suoiverp erongi",  # ignore previous instructions
    "tpmorp metsys",                  # system prompt
    "edom detcirtsernu",              # unrestricted mode
    "kaerblaj",                       # jailbreak
]


class RuleBasedLayer:
    """
    Layer 1: Fast regex + string matching for known injection patterns.
    
    Scans prompts against a registry of compiled regex patterns
    organized by attack category. Returns immediately on first match
    for minimum latency.
    """

    def __init__(self) -> None:
        self.patterns = COMPILED_PATTERNS
        self.case_sensitive = CASE_SENSITIVE_PATTERNS
        self.reversed_phrases = REVERSED_PHRASES

    def analyze(self, text: str) -> RuleBasedResult:
        """
        Analyze text against all rule-based patterns.
        Returns on first match for speed.
        """
        start = time.perf_counter()
        
        if not text or not text.strip():
            return RuleBasedResult(
                triggered=False,
                latency_ms=_elapsed_ms(start),
            )

        # ── Unicode Lookalike Normalization ──
        # NFKD normalizes mathematical bold/script letters, fullwidth chars, accents, homoglyphs, etc.
        text_normalized = unicodedata.normalize('NFKD', text)
        text_lower = text_normalized.lower()

        # ── Check reversed text attacks ──
        for phrase in self.reversed_phrases:
            if phrase in text_lower:
                return RuleBasedResult(
                    triggered=True,
                    matched_pattern=f"reversed: {phrase[::-1]}",
                    attack_category="ENCODING_ATTACKS",
                    score=0.95,
                    latency_ms=_elapsed_ms(start),
                )

        # ── Check base64 embedded in natural language ──
        # Find all words that look like base64 payloads (at least 12 chars)
        potential_b64_tokens = re.findall(r"\b[A-Za-z0-9+/]{12,}={0,2}\b", text)
        for token in potential_b64_tokens:
            try:
                # Add padding if needed
                padded_token = token + "=" * ((4 - len(token) % 4) % 4)
                decoded_bytes = base64.b64decode(padded_token, validate=True)
                decoded_text = decoded_bytes.decode("utf-8", errors="ignore").lower()
                
                # Check if decoded content matches any critical safety regexes
                for category, compiled in self.patterns.items():
                    for pattern, description in compiled:
                        if pattern.search(decoded_text):
                            return RuleBasedResult(
                                triggered=True,
                                matched_pattern=f"base64_embedded: {description} (decoded: {decoded_text[:40]})",
                                attack_category="ENCODING_ATTACKS",
                                score=0.95,
                                latency_ms=_elapsed_ms(start),
                            )
            except Exception:
                pass

        # ── Check compiled patterns (case-insensitive on normalized text) ──
        for category, compiled in self.patterns.items():
            for pattern, description in compiled:
                if pattern.search(text_normalized):
                    return RuleBasedResult(
                        triggered=True,
                        matched_pattern=description,
                        attack_category=category,
                        score=0.95,
                        latency_ms=_elapsed_ms(start),
                    )

        # ── Check case-sensitive patterns ──
        for pattern, description, category in self.case_sensitive:
            if pattern.search(text_normalized):
                return RuleBasedResult(
                    triggered=True,
                    matched_pattern=description,
                    attack_category=category,
                    score=0.90,
                    latency_ms=_elapsed_ms(start),
                )

        # ── Many-shot length heuristic ──
        word_count = len(text_normalized.split())
        if word_count > 3000:
            imperative_count = sum(
                1 for word in text_lower.split()
                if word in {"ignore", "override", "bypass", "disable", "forget", "pretend"}
            )
            if imperative_count >= 5:
                return RuleBasedResult(
                    triggered=True,
                    matched_pattern="many-shot: long prompt with injection keywords",
                    attack_category="MANY_SHOT",
                    score=0.85,
                    latency_ms=_elapsed_ms(start),
                )

        return RuleBasedResult(
            triggered=False,
            score=0.0,
            latency_ms=_elapsed_ms(start),
        )


def _elapsed_ms(start: float) -> float:
    """Calculate elapsed milliseconds from a perf_counter start."""
    return round((time.perf_counter() - start) * 1000, 2)
