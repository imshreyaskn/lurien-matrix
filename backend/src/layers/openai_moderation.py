import os
import time
import httpx
from typing import Optional
from dataclasses import dataclass

@dataclass
class ModerationResult:
    triggered: bool
    score: float
    latency_ms: float
    categories: dict
    flagged_category: Optional[str] = None

class OpenAIModerationLayer:
    """
    Layer 2.5: Optional OpenAI Moderation API check.
    Uses httpx to avoid heavy openai sdk dependency (ponytail mode).
    Only runs if OPENAI_API_KEY is present in environment.
    """
    def __init__(self, api_key: Optional[str] = None):
        # Allow passing key directly or falling back to env var
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.url = "https://api.openai.com/v1/moderations"
        self.enabled = bool(self.api_key)

    def analyze(self, text: str) -> ModerationResult:
        if not self.enabled:
            return ModerationResult(False, 0.0, 0.0, {})

        start = time.perf_counter()
        
        try:
            with httpx.Client(timeout=3.0) as client:
                response = client.post(
                    self.url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "input": text,
                        "model": "omni-moderation-latest"
                    }
                )
                response.raise_for_status()
                data = response.json()
                
                result = data["results"][0]
                flagged = result["flagged"]
                categories = result["categories"]
                category_scores = result["category_scores"]
                
                # Find the highest scoring category if flagged
                max_score = 0.0
                flagged_category = None
                
                if flagged:
                    for cat, is_flagged in categories.items():
                        if is_flagged and category_scores[cat] > max_score:
                            max_score = category_scores[cat]
                            flagged_category = cat
                            
                latency = (time.perf_counter() - start) * 1000
                return ModerationResult(
                    triggered=flagged,
                    score=max_score,
                    latency_ms=latency,
                    categories=category_scores,
                    flagged_category=flagged_category
                )
                
        except Exception as e:
            # In ponytail mode, network failures should fail open (do not block) to not break the pipeline
            latency = (time.perf_counter() - start) * 1000
            return ModerationResult(False, 0.0, latency, {})
