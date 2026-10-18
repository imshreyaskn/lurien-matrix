<div align="center">

<img src="./frontend/public/logo.png" alt="Lurien Matrix" width="180" />

<h1>Lurien Matrix</h1>

<p>
  A proxy-based security layer for detecting prompt injection,
  malicious instructions, and unsafe model output before they
  reach the application.
</p>

<br />

<a href="https://lurienmatrix.vercel.app/">
  <img src="https://img.shields.io/badge/Live%20Dashboard-lurienmatrix.vercel.app-8B7355?style=for-the-badge" />
</a>

</div>

---

## Overview

Lurien Matrix is an LLM security firewall designed to sit between an application and its LLM provider.

Instead of relying on a single detection mechanism, incoming prompts pass through multiple layers of analysis. The pipeline combines deterministic rules, heuristic analysis, embedding similarity, local ML classification, and application-specific context policies.

Requests that cross the configured risk threshold are rejected before they reach the provider.

Safe requests can be forwarded through the proxy, where the resulting model response can also be inspected.

```mermaid
flowchart LR
    A[Application] --> B[Lurien Matrix]

    B --> C{Request Analysis}

    C -->|Unsafe| D[403 Blocked]
    C -->|Safe| E[LLM Provider]

    E --> F[Output Monitor]

    F -->|Safe| A
    F -->|Unsafe| D
```

---

# How It Works

A request entering Lurien Matrix goes through the detection pipeline in order.

```mermaid
flowchart TD
    A[Incoming Prompt]

    A --> B[Canary Detection]
    B --> C[Rule-Based Detection]
    C --> D[Heuristic Analysis]
    D --> E[Embedding Similarity]
    E --> F[DistilBERT Classification]
    F --> G[Context Policy]

    B -->|Risk Threshold Reached| X[Block]
    C -->|Risk Threshold Reached| X
    D -->|Risk Threshold Reached| X
    E -->|Risk Threshold Reached| X
    F -->|Risk Threshold Reached| X
    G -->|Risk Threshold Reached| X

    G -->|Safe| H[Proxy Engine]
    H --> I[LLM Provider]
    I --> J[Output Monitor]

    J -->|Safe| K[Return Response]
    J -->|Unsafe| X

    X --> L[403 + Security Report]
```

The pipeline short-circuits when the cumulative risk reaches the configured threshold, avoiding unnecessary processing for requests that have already been classified as unsafe.

---

# Detection Pipeline

## 1. Canary Detection

The first layer checks for configured canary values.

A canary can be configured globally or associated with an individual API key.

The detector uses `hmac.compare_digest` when comparing the supplied prompt against the configured canary.

A matching canary produces the highest risk score and can immediately terminate further processing.

---

## 2. Rule-Based Detection

The rule layer handles recognizable prompt-injection patterns without requiring model inference.

It contains patterns for categories such as:

* instruction overrides
* persona hijacking
* system prompt extraction
* system-message spoofing
* encoded attacks
* many-shot attacks

Before matching, the input is normalized to make simple obfuscation techniques less effective.

The implementation includes checks involving:

* Unicode normalization
* zero-width characters
* soft hyphens
* Base64 decoding
* reversed text
* repeated instructions
* prompt length anomalies

The patterns are precompiled and the layer can terminate the pipeline when a sufficiently strong match is found.

---

## 3. Heuristic Analysis

The heuristic layer looks for combinations of suspicious characteristics rather than relying on exact strings.

The current weighted signals are:

| Signal              | Weight |
| ------------------- | -----: |
| Instruction density |   0.25 |
| System context      |   0.25 |
| Role assignment     |   0.20 |
| Length anomaly      |   0.15 |
| Encoding entropy    |   0.10 |
| Repetition          |   0.05 |

The weighted signals produce a heuristic risk score that is combined with the results of the other layers.

---

## 4. Embedding Similarity

The embedding layer compares an incoming prompt against a collection of known attack examples.

The implementation uses:

* SentenceTransformers
* `all-MiniLM-L6-v2`
* FAISS
* normalized embeddings
* cosine similarity

For each prompt, the system retrieves the nearest five examples and evaluates the similarity against the configured threshold.

The default threshold is `0.85`.

```mermaid
flowchart LR
    A[Prompt] --> B[SentenceTransformer]
    B --> C[384-D Embedding]
    C --> D[FAISS Index]
    D --> E[Top 5 Similar Attacks]
    E --> F[Similarity Score]
    F --> G{>= Threshold?}
    G -->|Yes| H[Increase Risk]
    G -->|No| I[Continue Pipeline]
```

---

## 5. ML Classification

The ML layer uses a locally loaded DistilBERT classifier.

The current classification labels are:

```text
safe
role_override
goal_hijacking
context_poisoning
tool_manipulation
cascading_amplification
```

Inference runs through ONNX Runtime.

The classifier uses a maximum sequence length of 256 tokens.

The model is loaded once during application startup and reused across requests.

If the classifier cannot be loaded, the rest of the detection pipeline can continue operating using the available layers.

---

## 6. Context Policy

A prompt can be harmless in isolation and still be inappropriate for the application receiving it.

For example, a request asking a recipe assistant to write arbitrary code may not be a prompt injection, but it is outside the assistant's intended context.

Lurien Matrix supports context profiles for this purpose.

Built-in profiles include:

* `general`
* `coding_assistant`
* `recipe_bot`
* `customer_support`
* `education`
* `hr_assistant`

The incoming prompt is embedded and compared against examples associated with the selected profile.

Custom profiles can also be configured.

```mermaid
flowchart LR
    A[Prompt] --> B[Embedding Model]
    B --> C[Prompt Embedding]
    C --> D[Profile Examples]
    D --> E[Similarity]
    E --> F{Within Context?}

    F -->|Yes| G[Continue]
    F -->|No| H[Block]
```

---

# Risk Scoring

The individual layers contribute to a cumulative risk score.

Rather than replacing the previous score, each new signal is combined using:

```text
cumulative = 1 - ((1 - current) * (1 - new_score))
```

This allows several weaker signals to reinforce each other.

The default blocking threshold is `0.50`.

The threshold can also be overridden for individual requests.

---

# Request Lifecycle

In proxy mode, Lurien Matrix controls the complete request path.

```mermaid
sequenceDiagram
    participant App as Application
    participant FW as Lurien Matrix
    participant Provider as LLM Provider

    App->>FW: LLM Request
    FW->>FW: Authenticate API Key
    FW->>FW: Apply Rate Limit
    FW->>FW: Run Detection Pipeline

    alt Unsafe Request
        FW-->>App: 403 + Security Report
    else Safe Request
        FW->>Provider: Forward Request
        Provider-->>FW: Model Response
        FW->>FW: Output Monitoring

        alt Unsafe Output
            FW-->>App: Blocked Response
        else Safe Output
            FW-->>App: Provider Response
        end
    end
```

---

# Proxy Engine

The proxy layer handles provider-specific request and response formats.

Current providers include:

* OpenAI
* Groq
* Gemini
* Anthropic

The proxy handles both regular and streaming responses.

Provider-specific request parsing is required because the structure of chat requests and authentication headers differs between providers.

```mermaid
flowchart TD
    A[Application] --> B[Lurien Matrix Proxy]

    B --> C{Provider}

    C -->|OpenAI| D[OpenAI API]
    C -->|Groq| E[Groq API]
    C -->|Gemini| F[Gemini API]
    C -->|Anthropic| G[Anthropic API]

    D --> H[Provider Response]
    E --> H
    F --> H
    G --> H

    H --> I[Output Monitor]
    I --> J[Application]
```

---

# Output Monitoring

Security checks also run against model responses.

The output monitor currently looks for patterns associated with:

* email addresses
* phone numbers
* credit card numbers
* SSNs
* OpenAI API keys
* Google API keys
* Anthropic API keys
* AWS access keys
* leaked canary values
* refusal-bypass language
* indirect injection indicators

For streaming responses, the implementation buffers response content so that output can be inspected while the stream is being processed.

```mermaid
flowchart TD
    A[LLM Response] --> B[Output Monitor]

    B --> C[PII Detection]
    B --> D[Credential Detection]
    B --> E[Canary Detection]
    B --> F[Injection Indicators]

    C --> G{Violation?}
    D --> G
    E --> G
    F --> G

    G -->|Yes| H[Stop / Block Response]
    G -->|No| I[Return Response]
```

---

# Authentication & Rate Limiting

Requests to the firewall are authenticated using API keys.

The API key format used by the backend begins with:

```text
fw_live_
```

Raw API keys are not stored directly. The backend stores a SHA-256 hash of the key.

Redis handles request-rate tracking.

The configured limits are:

```text
10,000 requests / minute
1,000,000 requests / month
```

The rate limiter uses atomic Redis operations for the counters.

---

# Persistence

Lurien Matrix uses separate systems for different types of data.

```mermaid
flowchart LR
    FW[Lurien Matrix]

    FW --> M[(MongoDB)]
    FW --> R[(Redis)]
    FW --> N[(Neo4j)]

    M --> M1[Users]
    M --> M2[API Keys]
    M --> M3[Firewall Logs]
    M --> M4[Daily Statistics]

    R --> R1[Rate Limits]

    N --> N1[Threat Relationships]
    N --> N2[Attack Types]
    N --> N3[Prompt Hashes]
```

### MongoDB

Used for application and firewall persistence:

* users
* API keys
* firewall logs
* daily statistics

Prompts are represented using hashes and metadata rather than storing the raw prompt in firewall logs.

### Redis

Used primarily for rate limiting and request counters.

### Neo4j

Used to maintain relationships between API keys, attack types, and observed prompt hashes.

This also supports the graph-based threat visualization in the dashboard.

---

# Node.js SDK

The repository contains a Node.js package under `npm-package/`.

The package exposes the firewall through a small client API:

```javascript
const { LurienMatrix } = require("lurien-matrix");

const firewall = new LurienMatrix({
  apiKey: process.env.LURIEN_MATRIX_KEY
});
```

### Direct Check

```javascript
const result = await firewall.check(
  "user prompt"
);

if (!result.safe) {
  console.log(result.attack_type);
}
```

### Express Middleware

```javascript
app.use(
  "/api/chat",
  firewall.middleware(),
  chatHandler
);
```

### Proxy

```javascript
const firewall = new LurienMatrix({
  apiKey: process.env.LURIEN_MATRIX_KEY,
  mode: "proxy",
  provider: "openai",
  llmApiKey: process.env.OPENAI_API_KEY
});
```

The SDK also exposes `FirewallBlockedError` for handling blocked proxy requests.

---

# API

The main FastAPI endpoints include:

```text
POST /v1/check
POST /v1/check/batch
POST /v1/proxy/{provider}

GET  /v1/stats
GET  /v1/logs
POST /v1/keys

GET  /health
```

Authentication routes and graph-related endpoints are also part of the backend API.

---

# Architecture

```mermaid
flowchart TB

    Client[Client Application]

    subgraph Lurien["Lurien Matrix"]
        API[FastAPI API]

        subgraph Pipeline["Detection Pipeline"]
            L0[Canary]
            L1[Rules]
            L2[Heuristics]
            L3[FAISS Embeddings]
            L4[DistilBERT]
            L5[Context Policy]
        end

        Proxy[Proxy Engine]
        Monitor[Output Monitor]
    end

    subgraph Infrastructure["Infrastructure"]
        Mongo[(MongoDB)]
        Redis[(Redis)]
        Neo[(Neo4j)]
    end

    subgraph Providers["LLM Providers"]
        OpenAI[OpenAI]
        Gemini[Gemini]
        Anthropic[Anthropic]
        Groq[Groq]
    end

    Client --> API
    API --> L0
    L0 --> L1
    L1 --> L2
    L2 --> L3
    L3 --> L4
    L4 --> L5

    L5 -->|Safe| Proxy
    L5 -->|Unsafe| Client

    Proxy --> OpenAI
    Proxy --> Gemini
    Proxy --> Anthropic
    Proxy --> Groq

    OpenAI --> Monitor
    Gemini --> Monitor
    Anthropic --> Monitor
    Groq --> Monitor

    Monitor --> Client

    API --> Mongo
    API --> Redis
    API --> Neo
```

---

# Project Structure

```text
lurien-matrix/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   ├── classifier/
│   │   ├── layers/
│   │   ├── proxy/
│   │   ├── db/
│   │   └── utils/
│   │
│   ├── models/
│   ├── data/
│   ├── scripts/
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   └── src/
│
├── npm-package/
│   ├── src/
│   ├── types/
│   └── package.json
│
├── scripts/
├── docker-compose.yml
└── README.md
```

---

# Tech Stack

| Area             | Technology           |
| ---------------- | -------------------- |
| Backend          | Python, FastAPI      |
| HTTP             | HTTPX                |
| ML               | DistilBERT           |
| ML Runtime       | ONNX Runtime         |
| Embeddings       | SentenceTransformers |
| Vector Search    | FAISS                |
| Database         | MongoDB              |
| Rate Limiting    | Redis                |
| Graph            | Neo4j                |
| Frontend         | React, Vite          |
| Styling          | Tailwind CSS         |
| Visualization    | D3.js, Recharts      |
| SDK              | Node.js              |
| Containerization | Docker               |

---

# Running Locally

### Backend

```bash
cd backend

pip install -r requirements.txt

uvicorn src.api.main:app --reload
```

Configure the required environment variables and supporting services before starting the backend.

### Frontend

```bash
cd frontend

npm install
npm run dev
```

### Docker

```bash
docker compose up --build
```

---

# Benchmarks & Experimental Evidence

Lurien Matrix includes experimental benchmarks for evaluating firewall accuracy, defense-in-depth short-circuiting, and real-time inference latency across both a baseline smoke test and a diverse held-out generalization test set.

### 1. Generalization Benchmark (357 Prompts across 5 Attack/Benign Categories)

To establish generalization beyond the smoke test, the held-out suite incorporates:
* **In-the-wild Adversarial Jailbreaks (`rubend18/ChatGPT-Jailbreak-Prompts`)**: DAN, developer mode overrides, multi-persona escalation.
* **Standard Prompt Injection Benchmark (`deepset/prompt-injections` test split)**: Indirect instruction injections and goal hijacking.
* **Adversarial Evasion & Obfuscation**: Base64/ROT13 encoding, delimiter smuggling, zero-width spaces, and Pliny format templates.
* **Hard Benign & Boundary Prompts**: Harmless cybersecurity queries, system administration commands (`kill -9`, `logrotate`, `.gitignore`), and programming syntax.
* **Baseline Smoke Test**: 50 malicious + 50 benign conversational prompts.

#### Performance Summary (Full 357-Prompt Suite)

| Metric | Result | Benchmark Objective |
| :--- | ---: | :--- |
| **True Positive Rate (TPR / Recall)** | **92.35%** | Neutralizes 181 / 196 malicious attacks |
| **False Positive Rate (FPR)** | **13.66%** | Blocks only 22 / 161 benign queries |
| **Overall Accuracy** | **89.64%** | Total classification accuracy |
| **Balanced Accuracy** | **89.34%** | Balanced across positive and negative classes |
| **Precision (PPV)** | **89.16%** | Confidence in positive threat alerts |
| **Specificity (TNR)** | **86.34%** | Accuracy on benign inputs |
| **F1 Score** | **0.9073** | Harmonic balance between Precision & Recall |
| **Matthews Correlation Coefficient (MCC)** | **0.7905** | High overall classification correlation (-1 to +1) |
| **ROC-AUC** | **0.9354** | Discriminative power across threshold values |
| **PR-AUC** | **0.9406** | Precision-Recall curve area |
| **Median Pipeline Latency (p50)** | **47.6 ms** | Real-time proxy inspection overhead |
| **P95 Pipeline Latency** | **109.2 ms** | 95th percentile latency |

#### Split Performance Comparison

| Dataset Split | Samples | TPR (Recall) | FPR (False Alarm) | Accuracy | F1 Score | Median Latency |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Baseline Smoke Test** | 100 | **98.0%** (49/50) | **2.0%** (1/50) | **98.0%** | **0.9800** | 41.8 ms |
| **Held-Out Generalization Suite** | 257 | **90.41%** (132/146) | **18.92%** (21/111) | **86.38%** | **0.8829** | 53.2 ms |

#### Category-Level Detection Breakdown

| Category | Type | Prompts | Caught / Flagged | Rate |
| :--- | :--- | ---: | ---: | ---: |
| In-the-wild Jailbreaks (`rubend18`) | Malicious | 60 | 60 | **100.0%** |
| Baseline Smoke Malicious | Malicious | 50 | 49 | **98.0%** |
| Evasion & Obfuscation (Base64/ROT13/Pliny) | Malicious | 26 | 25 | **96.15%** |
| Deepset Prompt Injections | Malicious | 60 | 47 | **78.33%** |
| Hard Benign / Security Engineering Queries | Benign | 55 | 9 | **16.36%** FPR |
| Deepset Benign Queries | Benign | 56 | 12 | **21.43%** FPR |
| Baseline Smoke Safe Queries | Benign | 50 | 1 | **2.00%** FPR |

#### Defense-in-Depth Layer Attribution

| Security Layer | Threats Intercepted | Share of Neutralized Threats |
| :--- | ---: | ---: |
| **Embedding Similarity Layer** (FAISS + MiniLM) | 94 | 51.9% |
| **Local DistilBERT ML Classifier** (ONNX CPU) | 46 | 25.4% |
| **Rule-Based Regex Engine** (Heuristics & Regex) | 41 | 22.7% |

*Early Exit Efficiency: **22.65%** of threats are terminated at or before Layer 2 without invoking downstream embedding lookup or ML inference.*

### Reproducing the Benchmarks & Raw Logs

All raw predictions, per-layer outputs, and metrics are organized under [`benchmarks/results/`](file:///e:/Drizzle/VS/firewall/benchmarks/results/):

```bash
# 1. Run full held-out benchmark with raw predictions preservation (JSON + CSV)
python scripts/benchmark.py --held-out

# 2. Or run directly with custom thresholds and engine
python scripts/run_comprehensive_benchmark.py --engine local --threshold 0.50

# 3. Run classic 50-malicious / 50-benign smoke test
python scripts/benchmark.py --engine local
```

Raw artifacts organized under `benchmarks/results/`:
* [`predictions.json`](file:///e:/Drizzle/VS/firewall/benchmarks/results/predictions.json) & [`predictions.csv`](file:///e:/Drizzle/VS/firewall/benchmarks/results/predictions.csv): Full prediction record, risk scores, flagged layers, and latency per sample.
* [`metrics.json`](file:///e:/Drizzle/VS/firewall/benchmarks/results/metrics.json): Structured KPI metrics, confusion matrix, and category breakdowns.
* [`benchmark_report.md`](file:///e:/Drizzle/VS/firewall/benchmarks/results/benchmark_report.md): Comprehensive Markdown report with failure analysis.
* [`benchmarks/README.md`](file:///e:/Drizzle/VS/firewall/benchmarks/README.md): Benchmark methodology, KPIs, and directory architecture.

---

# Design

The main idea behind Lurien Matrix is to avoid making one model responsible for every security decision.

The detection pipeline combines several types of signals:

```mermaid
flowchart LR
    A[Prompt]

    A --> B[Deterministic]
    A --> C[Statistical]
    A --> D[Semantic]
    A --> E[ML]
    A --> F[Application Context]

    B --> G[Risk Score]
    C --> G
    D --> G
    E --> G
    F --> G

    G --> H{Threshold}
    H -->|Block| I[Reject]
    H -->|Pass| J[Forward]
```

This gives the firewall different ways to identify a request:

* known attack patterns can be caught with rules
* unusual prompt structure can be identified heuristically
* semantically similar attacks can be found through embeddings
* attack categories can be classified by the local ML model
* application-specific requests can be evaluated through context policies

---

# Project Status

Lurien Matrix is an experimental security system for studying and implementing layered defenses around LLM applications.

It is not intended to imply that prompt injection, data leakage, or model misuse can be completely prevented by a single firewall.

The project focuses on the engineering problem of placing an independently deployable inspection layer between an application and its LLM providers.

---

<div align="center">

**Lurien Matrix**

LLM Security Firewall

<a href="https://lurienmatrix.vercel.app/">Live Dashboard</a>
 ·  <a href="https://github.com/imshreyaskn/lurien-matrix">GitHub</a>

</div>
