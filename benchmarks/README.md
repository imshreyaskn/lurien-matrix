# Lurien Matrix — Benchmark Evidence & Evaluation Suite

This directory contains the experimental benchmark datasets, raw prediction outputs, and statistical evaluation reports for the **Lurien Matrix** 6-layer LLM security firewall.

---

## Directory Organization

```text
benchmarks/
├── README.md                          # Benchmark documentation & reproduction guide
├── data/
│   └── benchmark_testset.json         # Evaluated test suite (357 samples across 5 categories)
└── results/
    ├── benchmark_report.md            # Comprehensive Markdown evaluation report
    ├── metrics.json                   # Structured KPIs, confusion matrix & latency percentiles
    ├── predictions.csv                # Tabular prediction export for Pandas/Excel
    ├── predictions.json               # Full per-prompt structured prediction objects
    └── runs/                          # Historical archive of evaluation runs
        ├── run_20261018_122831/       # Run 1 (p50: 45.4 ms)
        ├── run_20261018_122923/       # Run 2 (p50: 47.7 ms)
        └── run_20261018_123307/       # Run 3 (p50: 47.6 ms)
```

---

## Benchmark Summary

The evaluation assesses the firewall's ability to intercept malicious prompts while preserving benign developer and enterprise traffic.

* **Total Evaluated Prompts:** **357**
* **Positive (Malicious) Prompts:** **196**
* **Negative (Benign) Prompts:** **161**
* **Execution Environment:** In-process CPU pipeline (ONNX Runtime, SentenceTransformers `all-MiniLM-L6-v2`, FAISS vector search, Rule-based regex engine, Heuristic entropy detectors).

### Key Performance Indicators (KPIs)

| Metric | Result | Benchmark Target / Notes |
| :--- | :---: | :--- |
| **Detection Rate (TPR / Recall)** | **92.35%** | Caught 181 / 196 total adversarial prompts |
| **False Positive Rate (FPR)** | **13.66%** | Blocked only 22 / 161 benign engineering queries |
| **Overall Accuracy** | **89.64%** | Total classification accuracy (320 / 357) |
| **Balanced Accuracy** | **89.34%** | Unbiased accuracy across balanced classes |
| **Precision (PPV)** | **89.16%** | Reliability of positive threat alarms |
| **Specificity (TNR)** | **86.34%** | Safe passage rate for benign prompts |
| **F1 Score** | **0.9073** | Harmonic mean of Precision and Recall |
| **Matthews Correlation (MCC)** | **0.7905** | High overall classification correlation (-1 to +1) |
| **ROC-AUC** | **0.9354** | Discriminative power across threshold values |
| **PR-AUC** | **0.9406** | Precision-Recall curve area |
| **Median Pipeline Latency (p50)** | **47.58 ms** | Real-time proxy inspection overhead |
| **P95 Pipeline Latency** | **109.21 ms** | 95th percentile latency upper bound |

---

## Split Performance Comparison

| Dataset Split | Samples | TPR (Recall) | FPR (False Alarm) | Accuracy | F1 Score | Median Latency |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Baseline Smoke Test** | 100 | **98.0%** (49/50) | **2.0%** (1/50) | **98.0%** | **0.9800** | 42.8 ms |
| **Held-Out Generalization Suite** | 257 | **90.41%** (132/146) | **18.92%** (21/111) | **86.38%** | **0.8829** | 50.1 ms |

---

## Category-Level Detection Breakdown

| Category | Type | Prompts | Caught / Flagged | Rate | Mean Risk Score |
| :--- | :--- | ---: | ---: | ---: | ---: |
| **In-the-wild Jailbreaks (`rubend18`)** | Malicious | 60 | 60 | **100.0%** | 0.9046 |
| **Baseline Smoke Malicious** | Malicious | 50 | 49 | **98.0%** | 0.8010 |
| **Evasion & Obfuscation (Base64/ROT13/Pliny)** | Malicious | 26 | 25 | **96.15%** | 0.8119 |
| **Deepset Prompt Injections** | Malicious | 60 | 47 | **78.33%** | 0.6825 |
| **Hard Benign / Security Engineering Queries** | Benign | 55 | 9 | **16.36%** FPR | 0.4164 |
| **Deepset Benign Queries** | Benign | 56 | 12 | **21.43%** FPR | 0.4439 |
| **Baseline Smoke Safe Queries** | Benign | 50 | 1 | **2.00%** FPR | 0.3385 |

---

## Defense-in-Depth Layer Attribution

How threats were first neutralized across the 6-layer defense pipeline:

| Security Layer | Threats Intercepted | Share of Neutralized Threats |
| :--- | ---: | ---: |
| **Embedding Similarity Layer** (FAISS + MiniLM) | 94 | 51.9% |
| **Local DistilBERT ML Classifier** (ONNX CPU) | 46 | 25.4% |
| **Rule-Based Regex Engine** (Heuristics & Regex) | 41 | 22.7% |

*Early Exit Efficiency: **22.65%** of threats are terminated at or before Layer 2 without invoking downstream embedding lookup or ML inference, drastically reducing compute costs.*

---

## How to Reproduce

Run the comprehensive benchmark using the scripts in `scripts/`:

```bash
# 1. Run full in-process held-out benchmark
python scripts/run_comprehensive_benchmark.py --engine local --threshold 0.50

# 2. Or run via the benchmark CLI wrapper
python scripts/benchmark.py --held-out

# 3. Run against a live HTTP proxy gateway
python scripts/benchmark.py --url https://imdrizzle-lurien-matrix-firewall.hf.space --api-key <YOUR_KEY> --held-out
```
