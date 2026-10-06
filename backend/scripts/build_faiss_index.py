import os
import json
import pickle
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

MODEL = "all-MiniLM-L6-v2"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(BACKEND_DIR, "data", "faiss")
ATTACK_JSON = os.path.join(OUT_DIR, "attack_texts.json")
os.makedirs(OUT_DIR, exist_ok=True)

print(f"Backend directory: {BACKEND_DIR}")
print(f"Output directory: {OUT_DIR}")

print(f"Loading SentenceTransformer: {MODEL}...")
model = SentenceTransformer(MODEL)

print(f"Loading merged attack texts from {ATTACK_JSON}...")
try:
    with open(ATTACK_JSON, "r", encoding="utf-8") as f:
        attack_texts = json.load(f)
except Exception as e:
    print(f"Failed to load JSON: {e}")
    exit(1)

attack_texts = list(set(attack_texts))
print(f"Total deduplicated attack prompts to encode: {len(attack_texts)}")

if not attack_texts:
    print("Error: No attack prompts found. Index cannot be built.")
    exit(1)

print(f"Building FAISS index from {len(attack_texts)} attack prompts...")

embeddings = model.encode(
    attack_texts,
    batch_size=256,
    normalize_embeddings=True,
    show_progress_bar=True
)

# Convert to float32 numpy array (FAISS requirement)
embeddings = np.array(embeddings, dtype=np.float32)

# Build FAISS index (Inner Product for cosine similarity since vectors are normalized)
d = embeddings.shape[1]
index = faiss.IndexFlatIP(d)
index.add(embeddings)

faiss_path = os.path.join(OUT_DIR, "attack_index.faiss")
texts_path = os.path.join(OUT_DIR, "attack_texts.pkl")

faiss.write_index(index, faiss_path)

with open(texts_path, "wb") as f:
    pickle.dump(attack_texts, f)

print(f"Index built: {index.ntotal} vectors, dim={d}")
print(f"Saved index to {faiss_path}")
print(f"Saved texts to {texts_path}")
