from pydantic import BaseModel
from typing import Optional
import os
import hmac
import time

class CanaryResult(BaseModel):
    triggered: bool
    matched_canary: Optional[str] = None
    attack_type: str = "prompt_extraction"
    score: float = 0.0
    latency_ms: float = 0.0
    ran: bool = True

class CanaryTokenDetector:
    """
    Checks if the incoming prompt contains a canary token that
    should only exist inside the LLM system prompt — never in
    user input. If found, the user is attempting prompt extraction.

    Two canary sources:
      1. SYSTEM_CANARY env var — global firewall canary
      2. Per-API-key canary — set when developer registers app
         (passed in at runtime, optional)
    """
    def __init__(self):
        self.system_canary = os.getenv("SYSTEM_CANARY")

    def check(self, prompt: str,
              custom_canary: Optional[str] = None) -> CanaryResult:
        start = time.perf_counter()

        canaries_to_check = []
        if self.system_canary:
            canaries_to_check.append(self.system_canary)
        if custom_canary:
            canaries_to_check.append(custom_canary)

        if not canaries_to_check:
            latency = (time.perf_counter() - start) * 1000
            return CanaryResult(
                triggered=False,
                score=0.0,
                latency_ms=round(latency, 3),
                ran=False
            )

        prompt_lower = prompt.lower()
        for canary in canaries_to_check:
            # Use constant-time comparison to prevent timing attacks
            # Check lowercased versions
            if hmac.compare_digest(
                canary.lower().ljust(256).encode('utf-8', errors='ignore'),
                prompt_lower[:len(canary)].ljust(256).encode('utf-8', errors='ignore')
            ):
                latency = (time.perf_counter() - start) * 1000
                return CanaryResult(
                    triggered=True,
                    matched_canary=canary,
                    attack_type="prompt_extraction",
                    score=1.0,
                    latency_ms=round(latency, 3),
                    ran=True
                )

        latency = (time.perf_counter() - start) * 1000
        return CanaryResult(
            triggered=False,
            score=0.0,
            latency_ms=round(latency, 3),
            ran=True
        )
