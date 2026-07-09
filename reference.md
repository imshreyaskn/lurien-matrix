# Lurien Matrix Firewall - Project Reference

This file contains critical, long-lived context about the project architecture, deployment details, and technical decisions to prevent context loss across sessions.

## 1. Deployment Details
- **Hugging Face Space (Live API)**: `https://imdrizzle-lurien-matrix-firewall.hf.space`
- **Hugging Face Repo Slug**: `imDrizzle/lurien-matrix-firewall`
- **GitHub Repository**: `imshreyaskn/lurien-matrix` (Note: GitHub contains the entire monorepo. HF Space only tracks the `backend/` directory).

### Strict Deployment Rules
- **GitHub Push Policy**: Always push the *entire* codebase (monorepo) to GitHub. NEVER push the ML model files (e.g. `model_quantized.onnx`, `spm.model`, etc.) or sensitive `.env` files to GitHub. Always respect the `.gitignore`.
- **Hugging Face Push Policy**: ONLY push the contents of the `backend/` folder to the root of the Hugging Face Space. Do not push `frontend/`, `npm-package/`, or root configuration files. Use `hf_transfer` or the Hugging Face API to upload the backend files directly to the Space. Ensure the HF Space root looks exactly like the inside of the `backend/` folder.

## 2. Infrastructure & Secrets
- **MongoDB Atlas**:
  - Connection string format: `mongodb://sabharishc98:<db_password>@ac-0kesxwy-shard-00-00.hnlcjkk...`
  - Current Password: *Updated to `MustBeTheWater` (July 2026)*
  - Network Access: IP Whitelist is configured to `0.0.0.0/0` (Allows HF Space to connect).
- **Hugging Face Secrets**: 
  - All `.env` variables from `backend/.env` have been migrated directly into Hugging Face Space Secrets via the HF API. The `backend/.env` file is excluded from HF via `.gitignore` for security.
- **Upstash Redis**: Used for rate-limiting. Falls back gracefully if connection fails (rate limiting is disabled).

## 3. Project Architecture
The project is a monorepo consisting of:
- `backend/`: FastAPI application containing the core firewall logic.
- `frontend/`: React dashboard for generating API keys and viewing logs.
- `npm-package/`: Node.js SDK (`lurien-matrix`) for easy client integration.
- `model_training/`: Scripts and notebooks for fine-tuning the ONNX models.

### Firewall Pipeline Layers
The backend evaluates prompts through a strict 6-layer sequence:
1. **CanaryTokenDetector**: Checks for hardcoded system leak tokens.
2. **RuleBasedLayer**: Fast regex and keyword matching for known attack vectors.
3. **HeuristicLayer**: Entropy and length-based anomaly detection.
4. **EmbeddingSimilarityLayer**: FAISS index search using `SentenceTransformer('all-MiniLM-L6-v2')`.
5. **InjectionClassifier (ML)**: Local ONNX DistilBERT sequence classification (labels: safe, role_override, goal_hijacking, context_poisoning, tool_manipulation, cascading_amplification).
6. **ContextAwarePolicyLayer**: Cross-references against allowed app-contexts (e.g., HR bot vs Coding bot).

## 4. Key Gotchas & Solutions
- **Uvicorn / Docker Logs**: If the HF Space hangs silently on `===== Application Startup =====`, it's because Python buffers stdout. `ENV PYTHONUNBUFFERED=1` must be set in the `Dockerfile`.
- **Hugging Face Deployments**: Free HF Spaces (CPU-basic) can take ~4-5 minutes to build the Docker image when dependencies change.
- **Dependencies**: `python-jose` and `passlib` are required for API authentication. Overwriting `backend/requirements.txt` with the ML-only `requirements.txt` from the root will cause the FastAPI server to crash on boot.
