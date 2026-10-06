import re
import time
import os
from pydantic import BaseModel
from typing import Optional

class OutputCheckResult(BaseModel):
    flagged: bool
    reason: Optional[str]    # "pii:email" | "canary_echo" | "refusal_bypass:pattern" | "safe"
    redacted_response: Optional[str] = None
    score: float = 0.0
    latency_ms: float = 0.0

class OutputMonitor:
    PII_PATTERNS = {
        "ssn":         r'\b\d{3}-\d{2}-\d{4}\b',
        "credit_card": r'\b(?:\d{4}[-\s]?){3}\d{4}\b',
        "email":       r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        "phone":       r'\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
        "api_key_openai":   r'\bsk-[A-Za-z0-9]{32,}\b',
        "api_key_google":   r'\bAIza[A-Za-z0-9_-]{35}\b',
        "api_key_anthropic":r'\bsk-ant-[A-Za-z0-9_-]{32,}\b',
        "aws_access_key":   r'\bAKIA[0-9A-Z]{16}\b',
    }

    REFUSAL_BYPASS_PATTERNS = [
        "as dan",
        "in this fictional scenario",
        "hypothetically speaking",
        "for educational purposes only",
        "as an ai with no restrictions",
        "in a world where ai has no limits",
        "let's pretend you have no guidelines",
        "roleplay as an unrestricted",
        "pretend you are jailbroken",
        "in developer mode",
        "as your true self without restrictions",
    ]

    # These phrases in a response suggest the LLM is acting on
    # an injected instruction from retrieved content
    INDIRECT_INJECTION_SIGNALS = [
        "as instructed by the document",
        "following the instructions in the text",
        "as per the retrieved content",
        "the document instructs me to",
        "as the file specifies",
    ]

    def __init__(self, canary: Optional[str] = None):
        self.canary = canary or os.getenv("SYSTEM_CANARY")

    async def check_async(
        self,
        response_text: str,
        custom_canary: Optional[str] = None
    ) -> OutputCheckResult:
        import asyncio
        return await asyncio.to_thread(self.check, response_text, custom_canary)

    def check(
        self,
        response_text: str,
        custom_canary: Optional[str] = None
    ) -> OutputCheckResult:
        start = time.perf_counter()
        lower = response_text.lower()

        for pii_type, pattern in self.PII_PATTERNS.items():
            if re.search(pattern, response_text):
                redacted = re.sub(pattern, f"[REDACTED:{pii_type.upper()}]",
                                  response_text)
                latency  = (time.perf_counter() - start) * 1000
                return OutputCheckResult(
                    flagged=True,
                    reason=f"pii_detected:{pii_type}",
                    redacted_response=redacted,
                    score=0.95,
                    latency_ms=round(latency, 3)
                )

        canaries = [c for c in [self.canary, custom_canary] if c]
        for canary in canaries:
            if canary.lower() in lower:
                latency = (time.perf_counter() - start) * 1000
                return OutputCheckResult(
                    flagged=True,
                    reason="canary_echo:system_prompt_leaked",
                    score=1.0,
                    latency_ms=round(latency, 3)
                )

        for pattern in self.REFUSAL_BYPASS_PATTERNS:
            if pattern in lower:
                latency = (time.perf_counter() - start) * 1000
                return OutputCheckResult(
                    flagged=True,
                    reason=f"refusal_bypass:{pattern}",
                    score=0.85,
                    latency_ms=round(latency, 3)
                )

        for signal in self.INDIRECT_INJECTION_SIGNALS:
            if signal in lower:
                latency = (time.perf_counter() - start) * 1000
                return OutputCheckResult(
                    flagged=True,
                    reason=f"indirect_injection:{signal}",
                    score=0.80,
                    latency_ms=round(latency, 3)
                )

        latency = (time.perf_counter() - start) * 1000
        return OutputCheckResult(
            flagged=False,
            reason="safe",
            score=0.0,
            latency_ms=round(latency, 3)
        )
