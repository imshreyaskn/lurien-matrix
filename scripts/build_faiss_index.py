import os
import json
import numpy as np
import faiss
import pandas as pd
from sentence_transformers import SentenceTransformer
from datasets import load_dataset

MODEL = "all-MiniLM-L6-v2"

# Detect absolute paths based on this script location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(BACKEND_DIR, "data", "faiss")
os.makedirs(OUT_DIR, exist_ok=True)

print(f"Backend directory: {BACKEND_DIR}")
print(f"Output directory: {OUT_DIR}")

# Initialize model
print(f"Loading SentenceTransformer: {MODEL}...")
model = SentenceTransformer(MODEL)

attack_texts = []

# Source 1: deepset/prompt-injections
try:
    print("Loading deepset/prompt-injections...")
    ds = load_dataset("deepset/prompt-injections", split="train")
    attack_texts += [ex["text"] for ex in ds if ex["label"] == 1]
    print(f"Added {len(ds)} samples from deepset/prompt-injections.")
except Exception as e:
    print(f"Warning: Could not load deepset/prompt-injections: {e}")

# Source 2: rubend18/ChatGPT-jailbreak-prompts
try:
    print("Loading rubend18/ChatGPT-jailbreak-prompts...")
    ds2 = load_dataset("rubend18/ChatGPT-jailbreak-prompts", split="train")
    for ex in ds2:
        text = ex.get("text") or ex.get("prompt") or ""
        if text:
            attack_texts.append(text)
    print(f"Added {len(ds2)} samples from rubend18/ChatGPT-jailbreak-prompts.")
except Exception as e:
    print(f"Warning: Could not load rubend18/ChatGPT-jailbreak-prompts: {e}")

# Source 3: XLS files (check root, backend, and parent directories)
xls_filenames = ["input_prompts_csv.xls", "input_prompts_csv__1_.xls"]
search_dirs = [
    BACKEND_DIR,
    os.path.dirname(BACKEND_DIR), # D:\llm-firewall
    SCRIPT_DIR
]

for filename in xls_filenames:
    found = False
    for s_dir in search_dirs:
        path = os.path.join(s_dir, filename)
        if os.path.exists(path):
            try:
                print(f"Found XLS file at: {path}. Loading...")
                df = pd.read_excel(path) # Use read_excel for xls files
                col = "prompt" if "prompt" in df.columns else ("Goal" if "Goal" in df.columns else df.columns[0])
                loaded = df[col].dropna().astype(str).tolist()
                attack_texts += loaded
                print(f"Added {len(loaded)} samples from {filename}.")
                found = True
                break
            except Exception as e:
                print(f"Error reading {path}: {e}")
                # Try read_csv in case it's actually a CSV named .xls
                try:
                    df = pd.read_csv(path)
                    col = "prompt" if "prompt" in df.columns else ("Goal" if "Goal" in df.columns else df.columns[0])
                    loaded = df[col].dropna().astype(str).tolist()
                    attack_texts += loaded
                    print(f"Added {len(loaded)} samples from {filename} (loaded as CSV).")
                    found = True
                    break
                except Exception as e2:
                    print(f"Error reading as CSV {path}: {e2}")

    if not found:
        print(f"XLS file '{filename}' not found in search paths.")

# Deduplicate
attack_texts = list(set(attack_texts))
print(f"Total deduplicated attack prompts: {len(attack_texts)}")

if not attack_texts:
    print("Error: No attack prompts found. Index cannot be built.")
    exit(1)

print(f"Building FAISS index from {len(attack_texts)} attack prompts...")

# Encode all attack prompts (normalize for cosine similarity)
embeddings = model.encode(
    attack_texts,
    batch_size=256,
    normalize_embeddings=True,
    show_progress_bar=True
)
embeddings = np.array(embeddings).astype("float32")

# Build flat inner-product index (equivalent to cosine similarity when vectors are L2-normalized)
dimension = embeddings.shape[1] # 384 for MiniLM
index = faiss.IndexFlatIP(dimension)
index.add(embeddings)

index_path = os.path.join(OUT_DIR, "attack_index.faiss")
texts_path = os.path.join(OUT_DIR, "attack_texts.json")

faiss.write_index(index, index_path)
with open(texts_path, "w", encoding="utf-8") as f:
    json.dump(attack_texts, f, ensure_ascii=False, indent=2)

print(f"Index built: {index.ntotal} vectors, dim={dimension}")
print(f"Saved index to {index_path}")
print(f"Saved texts to {texts_path}")
