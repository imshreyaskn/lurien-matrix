from pydantic import BaseModel
from typing import Optional
import os
import numpy as np
import faiss
import json
import logging
import time

logger = logging.getLogger("llm_firewall.layers.embedding")


class EmbeddingResult(BaseModel):
    triggered: bool
    similarity_score: float
    nearest_attack_preview: Optional[str] = None
    latency_ms: float
    ran: bool = True
    reason: Optional[str] = None


class EmbeddingSimilarityLayer:
    def __init__(
        self,
        index_path: str,
        texts_path: str,
        model,
        threshold: float = 0.85,
    ):
        self.model = model
        self.threshold = threshold
        self.index = None
        self.attack_texts: list[str] = []
        self.disabled_reason: Optional[str] = None

        try:
            if not os.path.isfile(index_path):
                raise FileNotFoundError(f"FAISS index not found: {index_path}")

            # A Git LFS pointer is a small text file, not a usable FAISS index.
            # Detect it explicitly so deployments can report a clear artifact error.
            with open(index_path, "rb") as index_file:
                header = index_file.read(256)
            if b"git-lfs.github.com/spec/v1" in header:
                raise ValueError(
                    "FAISS index path contains a Git LFS pointer; fetch/provision the binary artifact"
                )

            self.index = faiss.read_index(index_path)

            # JSON is used rather than pickle to avoid unsafe deserialization.
            if texts_path.endswith(".pkl"):
                texts_path = texts_path[:-4] + ".json"
            with open(texts_path, "r", encoding="utf-8") as text_file:
                data = json.load(text_file)
            if not isinstance(data, list) or not all(isinstance(item, str) for item in data):
                raise ValueError("FAISS text corpus must be a JSON array of strings")
            self.attack_texts = data

            if self.index.d != 384:
                raise ValueError(
                    f"Expected 384-dimensional all-MiniLM-L6-v2 vectors, got {self.index.d}"
                )
            if self.index.ntotal == 0:
                raise ValueError("FAISS index contains no vectors")
            if self.index.ntotal != len(self.attack_texts):
                raise ValueError(
                    f"FAISS index/corpus size mismatch: {self.index.ntotal} vectors vs "
                    f"{len(self.attack_texts)} text records"
                )
            if self.model is None:
                self.disabled_reason = "embedding_model_unavailable"
        except Exception as exc:
            self.index = None
            self.attack_texts = []
            self.disabled_reason = f"artifact_load_failed: {type(exc).__name__}: {exc}"
            logger.error("Embedding layer disabled: %s", self.disabled_reason)

    def check(self, prompt: str) -> EmbeddingResult:
        start = time.perf_counter()

        if self.disabled_reason:
            return EmbeddingResult(
                triggered=False,
                similarity_score=0.0,
                latency_ms=round((time.perf_counter() - start) * 1000, 3),
                ran=False,
                reason=self.disabled_reason,
            )
        if self.model is None:
            return EmbeddingResult(
                triggered=False,
                similarity_score=0.0,
                latency_ms=round((time.perf_counter() - start) * 1000, 3),
                ran=False,
                reason="embedding_model_unavailable",
            )

        try:
            embedding = self.model.encode([prompt], normalize_embeddings=True)
            embedding = np.asarray(embedding, dtype=np.float32)
            if embedding.ndim != 2 or embedding.shape != (1, self.index.d):
                raise ValueError(f"Unexpected query embedding shape: {embedding.shape}")

            similarities, indices = self.index.search(embedding, k=min(5, self.index.ntotal))
            top_similarity = float(similarities[0][0])
            top_idx = int(indices[0][0])
            triggered = top_similarity > self.threshold
            nearest = (
                self.attack_texts[top_idx][:100]
                if triggered and 0 <= top_idx < len(self.attack_texts)
                else None
            )
            return EmbeddingResult(
                triggered=triggered,
                similarity_score=round(top_similarity, 4),
                nearest_attack_preview=nearest,
                latency_ms=round((time.perf_counter() - start) * 1000, 3),
                ran=True,
            )
        except Exception as exc:
            logger.exception("Embedding similarity inference failed")
            return EmbeddingResult(
                triggered=False,
                similarity_score=0.0,
                latency_ms=round((time.perf_counter() - start) * 1000, 3),
                ran=False,
                reason=f"inference_failed: {type(exc).__name__}: {exc}",
            )
