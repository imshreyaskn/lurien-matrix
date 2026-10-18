from pydantic import BaseModel
from typing import Optional
import os
import time


class CanaryResult(BaseModel):
    triggered: bool
    matched_canary: Optional[str] = None
    attack_type: str = "prompt_extraction"
    score: float = 0.0
    latency_ms: float = 0.0
    ran: bool = True


class CanaryTokenDetector:
    """Detect a configured canary anywhere in the inspected text.

    Canary values are deliberately redacted from results so that diagnostics
    and API responses cannot echo the secret token back to the caller.
    """

    def __init__(self):
        self.system_canary = os.getenv("SYSTEM_CANARY")

    def check(
        self,
        prompt: str,
        custom_canary: Optional[str] = None,
    ) -> CanaryResult:
        start = time.perf_counter()
        canaries = [c for c in (self.system_canary, custom_canary) if c]
        if not canaries:
            return CanaryResult(
                triggered=False,
                score=0.0,
                latency_ms=round((time.perf_counter() - start) * 1000, 3),
                ran=False,
            )

        prompt_lower = prompt.casefold()
        for canary in canaries:
            if canary.casefold() in prompt_lower:
                return CanaryResult(
                    triggered=True,
                    # Do not place the value of a secret canary in logs or API output.
                    matched_canary="[REDACTED]",
                    attack_type="prompt_extraction",
                    score=1.0,
                    latency_ms=round((time.perf_counter() - start) * 1000, 3),
                    ran=True,
                )

        return CanaryResult(
            triggered=False,
            score=0.0,
            latency_ms=round((time.perf_counter() - start) * 1000, 3),
            ran=True,
        )
