from pydantic import BaseModel
from typing import Optional
import numpy as np
import faiss
import json
import logging
import time

logger = logging.getLogger("llm_firewall.layers.embedding")

class EmbeddingResult(BaseModel):
    triggered: bool
    similarity_score: float
    nearest_attack_preview: Optional[str] = None  # first 100 chars
    latency_ms: float
    ran: bool = True

class EmbeddingSimilarityLayer:
    def __init__(
        self,
        index_path: str,
        texts_path: str,
        model,                    # injected SentenceTransformer instance
        threshold: float = 0.85
    ):
        self.model     = model
        self.threshold = threshold
        self.index     = None
        self.attack_texts = []
        
        try:
            self.index = faiss.read_index(index_path)
            # Switch to JSON to prevent pickle RCE
            if texts_path.endswith(".pkl"):
                texts_path = texts_path.replace(".pkl", ".json")
            with open(texts_path, "r", encoding="utf-8") as f:
                self.attack_texts = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load FAISS index or texts: {e}. Embedding layer disabled.")

    def check(self, prompt: str) -> EmbeddingResult:
        start = time.perf_counter()

        if self.model is None or self.index is None or not self.attack_texts:
            return EmbeddingResult(
                triggered=False,
                similarity_score=0.0,
                latency_ms=round((time.perf_counter() - start) * 1000, 3),
                ran=False
            )

        embedding = self.model.encode(
            [prompt],
            normalize_embeddings=True
        )
        embedding = np.array(embedding).astype("float32")

        similarities, indices = self.index.search(embedding, k=5)
        top_similarity = float(similarities[0][0])
        top_idx        = int(indices[0][0])

        triggered = top_similarity > self.threshold
        nearest = None
        if triggered and 0 <= top_idx < len(self.attack_texts):
            nearest = self.attack_texts[top_idx][:100]

        latency = (time.perf_counter() - start) * 1000
        return EmbeddingResult(
            triggered=triggered,
            similarity_score=round(top_similarity, 4),
            nearest_attack_preview=nearest,
            latency_ms=round(latency, 3),
            ran=True
        )
