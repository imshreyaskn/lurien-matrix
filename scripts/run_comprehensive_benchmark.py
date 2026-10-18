r"""
run_comprehensive_benchmark.py
Executes thorough benchmarking of the Lurien Matrix security firewall across:
  1. Baseline Smoke Test (50 malicious / 50 safe)
  2. Diverse Held-out Generalization Test Set (257 prompts across wild jailbreaks,
     deepset benchmark, hard benign boundary cases, and evasion/obfuscation)

Computes comprehensive metrics:
  - Confusion Matrix: TP, FP, TN, FN
  - Detection Accuracy, Balanced Accuracy, Precision, Recall (TPR), FPR, FNR, Specificity (TNR)
  - F1-Score, F2-Score, MCC, ROC-AUC, PR-AUC, Brier Score
  - Sub-category detection rates and false positive resistance
  - Defense-in-depth layer attribution and short-circuit savings
  - Microsecond-accurate latency distribution (Mean, Median, p90, p95, p99, Min, Max, StdDev)
  - Full export of raw predictions (JSON, CSV) and summary Markdown report.
"""

import argparse
import csv
import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    fbeta_score,
    matthews_corrcoef,
    precision_score,
    recall_score,
    roc_auc_score,
)

# Setup workspace paths
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = WORKSPACE_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(WORKSPACE_ROOT / "scripts"))

# Ensure OpenMP / Torch environment
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"


def load_local_pipeline(default_threshold: float = 0.50):
    """Initializes the full 6-layer in-process firewall pipeline."""
    print("\n[+] Initializing local 6-layer ClassifierPipeline...")
    cur_dir = os.getcwd()
    os.chdir(BACKEND_DIR)
    try:
        from sentence_transformers import SentenceTransformer
        from src.classifier.inference import InjectionClassifier
        from src.layers.canary import CanaryTokenDetector
        from src.layers.context_policy import ContextAwarePolicyLayer
        from src.layers.embedding_similarity import EmbeddingSimilarityLayer
        from src.layers.heuristic import HeuristicLayer
        from src.layers.pipeline import ClassifierPipeline
        from src.layers.rule_based import RuleBasedLayer

        st_model = SentenceTransformer("all-MiniLM-L6-v2")
        canary = CanaryTokenDetector()
        rules = RuleBasedLayer()
        heuristic = HeuristicLayer()
        embedding = EmbeddingSimilarityLayer(
            index_path="data/faiss/attack_index.faiss",
            texts_path="data/faiss/attack_texts.json",
            model=st_model,
            threshold=0.85,
        )
        ml = InjectionClassifier(model_path="models/")
        policy = ContextAwarePolicyLayer(model=st_model)

        pipeline = ClassifierPipeline(
            rule_based=rules,
            heuristic=heuristic,
            classifier=ml,
            canary_detector=canary,
            embedding_layer=embedding,
            context_policy=policy,
            default_threshold=default_threshold,
        )
        pipeline.load_model()
        print(f"    Pipeline ready. DistilBERT ML loaded: {pipeline.ml_loaded}")
        return pipeline
    finally:
        os.chdir(cur_dir)


def run_benchmark_local(dataset: List[Dict[str, Any]], threshold: float = 0.50):
    """Runs benchmark in-process against ClassifierPipeline."""
    pipeline = load_local_pipeline(default_threshold=threshold)
    raw_predictions = []

    print(f"\n[+] Running benchmark over {len(dataset)} samples (Local Engine)...")
    for i, item in enumerate(dataset, 1):
        prompt = item["prompt"]
        true_label = int(item["label"])  # 1 = malicious, 0 = benign

        # Measure high-resolution wall time
        t0 = time.perf_counter()
        result = pipeline.classify(prompt, threshold=threshold)
        wall_time_ms = (time.perf_counter() - t0) * 1000.0

        # In pipeline, result.safe is True if safe, False if malicious/blocked
        pred_blocked = not result.safe
        pred_label = 1 if pred_blocked else 0
        risk_score = float(result.risk_score)

        pred_record = {
            "id": item["id"],
            "split": item["split"],
            "category": item["category"],
            "prompt": prompt,
            "prompt_length": len(prompt),
            "true_label": true_label,
            "pred_label": pred_label,
            "pred_safe": result.safe,
            "risk_score": round(risk_score, 4),
            "attack_type": result.attack_type,
            "flagged_layer": result.flagged_layer,
            "flagged_pattern": result.flagged_pattern,
            "latency_ms": round(result.processing_time_ms, 2),
            "wall_time_ms": round(wall_time_ms, 2),
            "layers": result.layers,
        }
        raw_predictions.append(pred_record)

        if i % 25 == 0 or i == len(dataset):
            print(f"    Progress: {i}/{len(dataset)} ({i/len(dataset)*100:.1f}%)")

    return raw_predictions


def run_benchmark_http(dataset: List[Dict[str, Any]], url: str, api_key: str):
    """Runs benchmark via HTTP against /v1/check endpoint."""
    import httpx

    print(f"\n[+] Running benchmark over {len(dataset)} samples (HTTP Engine: {url})...")
    headers = {"X-API-Key": api_key, "Content-Type": "application/json"}
    endpoint = f"{url.rstrip('/')}/v1/check"
    raw_predictions = []

    with httpx.Client(timeout=30) as client:
        for i, item in enumerate(dataset, 1):
            prompt = item["prompt"]
            true_label = int(item["label"])

            t0 = time.perf_counter()
            try:
                r = client.post(endpoint, headers=headers, json={"prompt": prompt})
                wall_time_ms = (time.perf_counter() - t0) * 1000.0
                data = r.json()
                safe_val = data.get("safe", True)
                risk_score = float(data.get("risk_score", 0.0))
                flagged_layer = data.get("flagged_layer")
                flagged_pattern = data.get("flagged_pattern")
                attack_type = data.get("attack_type")
                layers = data.get("layers", {})
                latency_ms = data.get("processing_time_ms", wall_time_ms)
            except Exception as e:
                wall_time_ms = (time.perf_counter() - t0) * 1000.0
                safe_val = True
                risk_score = 0.0
                flagged_layer = f"error: {e}"
                flagged_pattern = None
                attack_type = None
                layers = {}
                latency_ms = wall_time_ms

            pred_blocked = not safe_val
            pred_label = 1 if pred_blocked else 0

            pred_record = {
                "id": item["id"],
                "split": item["split"],
                "category": item["category"],
                "prompt": prompt,
                "prompt_length": len(prompt),
                "true_label": true_label,
                "pred_label": pred_label,
                "pred_safe": safe_val,
                "risk_score": round(risk_score, 4),
                "attack_type": attack_type,
                "flagged_layer": flagged_layer,
                "flagged_pattern": flagged_pattern,
                "latency_ms": round(latency_ms, 2),
                "wall_time_ms": round(wall_time_ms, 2),
                "layers": layers,
            }
            raw_predictions.append(pred_record)
            if i % 25 == 0 or i == len(dataset):
                print(f"    Progress: {i}/{len(dataset)} ({i/len(dataset)*100:.1f}%)")

    return raw_predictions


def calculate_latency_stats(latencies: List[float]) -> Dict[str, float]:
    """Calculates comprehensive latency percentiles and distribution."""
    if not latencies:
        return {}
    arr = np.array(latencies)
    return {
        "mean_ms": round(float(np.mean(arr)), 2),
        "median_ms": round(float(np.median(arr)), 2),
        "p90_ms": round(float(np.percentile(arr, 90)), 2),
        "p95_ms": round(float(np.percentile(arr, 95)), 2),
        "p99_ms": round(float(np.percentile(arr, 99)), 2),
        "min_ms": round(float(np.min(arr)), 2),
        "max_ms": round(float(np.max(arr)), 2),
        "std_ms": round(float(np.std(arr)), 2),
    }


def compute_comprehensive_metrics(predictions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculates all scientific classification, latency, category, and layer metrics."""
    y_true = np.array([p["true_label"] for p in predictions])
    y_pred = np.array([p["pred_label"] for p in predictions])
    y_scores = np.array([p["risk_score"] for p in predictions])

    # Confusion matrix elements
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    total = len(predictions)

    # Core rates
    accuracy = accuracy_score(y_true, y_pred)
    balanced_acc = balanced_accuracy_score(y_true, y_pred)
    tpr = recall_score(y_true, y_pred, zero_division=0)  # Sensitivity / Recall
    tnr = tn / (tn + fp) if (tn + fp) > 0 else 0.0  # Specificity
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0  # False Positive Rate
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0  # False Negative Rate
    precision = precision_score(y_true, y_pred, zero_division=0)  # PPV
    npv = tn / (tn + fn) if (tn + fn) > 0 else 0.0  # NPV
    f1 = f1_score(y_true, y_pred, zero_division=0)
    f2 = fbeta_score(y_true, y_pred, beta=2, zero_division=0)
    mcc = matthews_corrcoef(y_true, y_pred)

    # Curve AUCs
    try:
        roc_auc = roc_auc_score(y_true, y_scores)
    except Exception:
        roc_auc = float("nan")

    try:
        pr_auc = average_precision_score(y_true, y_scores)
    except Exception:
        pr_auc = float("nan")

    brier = brier_score_loss(y_true, y_scores)

    # Latency breakdowns
    all_latencies = [p["latency_ms"] for p in predictions]
    mal_latencies = [p["latency_ms"] for p in predictions if p["true_label"] == 1]
    safe_latencies = [p["latency_ms"] for p in predictions if p["true_label"] == 0]

    latency_overall = calculate_latency_stats(all_latencies)
    latency_malicious = calculate_latency_stats(mal_latencies)
    latency_safe = calculate_latency_stats(safe_latencies)

    # Split-specific metrics (Smoke Test vs Held-Out)
    splits = {}
    for sp in set(p["split"] for p in predictions):
        sub_preds = [p for p in predictions if p["split"] == sp]
        sub_yt = np.array([p["true_label"] for p in sub_preds])
        sub_yp = np.array([p["pred_label"] for p in sub_preds])
        sub_tn, sub_fp, sub_fn, sub_tp = confusion_matrix(sub_yt, sub_yp, labels=[0, 1]).ravel()
        splits[sp] = {
            "total": len(sub_preds),
            "tp": int(sub_tp),
            "fp": int(sub_fp),
            "tn": int(sub_tn),
            "fn": int(sub_fn),
            "tpr": round(float(sub_tp / (sub_tp + sub_fn) if (sub_tp + sub_fn) > 0 else 0.0) * 100, 2),
            "fpr": round(float(sub_fp / (sub_fp + sub_tn) if (sub_fp + sub_tn) > 0 else 0.0) * 100, 2),
            "precision": round(float(precision_score(sub_yt, sub_yp, zero_division=0)) * 100, 2),
            "accuracy": round(float(accuracy_score(sub_yt, sub_yp)) * 100, 2),
            "f1": round(float(f1_score(sub_yt, sub_yp, zero_division=0)), 4),
            "median_latency_ms": round(float(np.median([p["latency_ms"] for p in sub_preds])), 2),
            "p95_latency_ms": round(float(np.percentile([p["latency_ms"] for p in sub_preds], 95)), 2),
        }

    # Category performance
    categories = {}
    for cat in sorted(list(set(p["category"] for p in predictions))):
        sub_preds = [p for p in predictions if p["category"] == cat]
        sub_yt = np.array([p["true_label"] for p in sub_preds])
        sub_yp = np.array([p["pred_label"] for p in sub_preds])
        is_pos = bool(sub_yt[0] == 1) if len(sub_yt) > 0 else False
        
        detected = int(np.sum(sub_yp == 1))
        blocked = detected
        cat_total = int(len(sub_preds))
        rate = float((detected / cat_total * 100) if cat_total > 0 else 0.0)

        categories[cat] = {
            "is_malicious": is_pos,
            "total": cat_total,
            "detected_as_threat": detected,
            "rate_percent": round(rate, 2),
            "mean_risk_score": round(float(np.mean([p["risk_score"] for p in sub_preds])), 4),
            "median_latency_ms": round(float(np.median([p["latency_ms"] for p in sub_preds])), 2),
        }

    # Layer attribution for caught attacks (TP)
    layer_attribution = {}
    tp_preds = [p for p in predictions if p["true_label"] == 1 and p["pred_label"] == 1]
    for p in tp_preds:
        fl = p.get("flagged_layer") or "unknown"
        layer_attribution[fl] = layer_attribution.get(fl, 0) + 1

    # Short circuit rate: how many were blocked by rule_based or heuristic (early layers)
    early_layers = {"canary", "rule_based", "heuristic"}
    early_blocked = sum(1 for p in tp_preds if p.get("flagged_layer") in early_layers)
    early_exit_pct = (early_blocked / len(tp_preds) * 100) if tp_preds else 0.0

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_samples": total,
        "confusion_matrix": {
            "true_positives": int(tp),
            "false_positives": int(fp),
            "true_negatives": int(tn),
            "false_negatives": int(fn),
        },
        "rates": {
            "accuracy": round(accuracy * 100, 2),
            "balanced_accuracy": round(balanced_acc * 100, 2),
            "tpr_recall_sensitivity": round(tpr * 100, 2),
            "tnr_specificity": round(tnr * 100, 2),
            "fpr_false_alarm": round(fpr * 100, 2),
            "fnr_miss_rate": round(fnr * 100, 2),
            "precision_ppv": round(precision * 100, 2),
            "npv": round(npv * 100, 2),
            "f1_score": round(f1, 4),
            "f2_score": round(f2, 4),
            "mcc": round(mcc, 4),
            "roc_auc": round(roc_auc, 4),
            "pr_auc": round(pr_auc, 4),
            "brier_score": round(brier, 4),
        },
        "latency": {
            "overall": latency_overall,
            "malicious": latency_malicious,
            "benign": latency_safe,
        },
        "splits": splits,
        "categories": categories,
        "layer_attribution": layer_attribution,
        "early_exit": {
            "early_blocked_count": early_blocked,
            "total_detected": len(tp_preds),
            "early_exit_percent": round(early_exit_pct, 2),
        },
        "failures": {
            "false_positives": [
                {
                    "id": p["id"],
                    "category": p["category"],
                    "prompt": p["prompt"],
                    "risk_score": p["risk_score"],
                    "flagged_layer": p["flagged_layer"],
                    "flagged_pattern": p["flagged_pattern"],
                }
                for p in predictions
                if p["true_label"] == 0 and p["pred_label"] == 1
            ],
            "false_negatives": [
                {
                    "id": p["id"],
                    "category": p["category"],
                    "prompt": p["prompt"],
                    "risk_score": p["risk_score"],
                    "attack_type": p["attack_type"],
                }
                for p in predictions
                if p["true_label"] == 1 and p["pred_label"] == 0
            ],
        },
    }


def generate_markdown_report(metrics: Dict[str, Any], output_path: Path):
    """Generates a detailed Markdown benchmark report."""
    rates = metrics["rates"]
    cm = metrics["confusion_matrix"]
    lat_all = metrics["latency"]["overall"]
    lat_mal = metrics["latency"]["malicious"]
    lat_safe = metrics["latency"]["benign"]

    md = []
    md.append("# Lurien Matrix — Experimental Benchmark & Generalization Evidence Report")
    md.append(f"\n**Execution Timestamp:** `{metrics['timestamp']}`  ")
    md.append(f"**Total Evaluated Samples:** **{metrics['total_samples']}**  \n")
    md.append("---\n")

    md.append("## Executive Summary\n")
    md.append(
        "This experimental evaluation measures the generalization of Lurien Matrix across both the baseline "
        "smoke test and a held-out test suite comprising in-the-wild adversarial jailbreaks, standard benchmark "
        "datasets (deepset prompt-injections), hard technical boundary cases, and evasion/obfuscation techniques.\n"
    )

    md.append("### Key Performance Indicators\n")
    md.append("| Metric | Result | Benchmark Objective |")
    md.append("|---|---:|:---|")
    md.append(f"| **Detection Rate (TPR / Recall)** | **{rates['tpr_recall_sensitivity']}%** | High sensitivity against attacks |")
    md.append(f"| **False Positive Rate (FPR)** | **{rates['fpr_false_alarm']}%** | Low interruption to benign users |")
    md.append(f"| **Overall Accuracy** | **{rates['accuracy']}%** | Comprehensive classification precision |")
    md.append(f"| **Balanced Accuracy** | **{rates['balanced_accuracy']}%** | Class-imbalance robust accuracy |")
    md.append(f"| **Precision (PPV)** | **{rates['precision_ppv']}%** | Trustworthiness of positive alerts |")
    md.append(f"| **Specificity (TNR)** | **{rates['tnr_specificity']}%** | Correct recognition of benign inputs |")
    md.append(f"| **F1 Score** | **{rates['f1_score']}** | Harmonic balance between Precision & Recall |")
    md.append(f"| **Matthews Correlation (MCC)** | **{rates['mcc']}** | Global quality coefficient (-1 to +1) |")
    md.append(f"| **ROC-AUC** | **{rates['roc_auc']}** | Discriminative power across thresholds |")
    md.append(f"| **PR-AUC** | **{rates['pr_auc']}** | Precision-Recall curve area |")
    md.append(f"| **Median Pipeline Latency (p50)** | **{lat_all.get('median_ms', 0)} ms** | Real-time proxy overhead |")
    md.append(f"| **P95 Pipeline Latency** | **{lat_all.get('p95_ms', 0)} ms** | 95th percentile latency bound |\n")

    md.append("### Confusion Matrix\n")
    md.append("| Actual \\ Predicted | Predicted Malicious (Threat) | Predicted Benign (Safe) | Total |")
    md.append("|---|---:|---:|---:|")
    md.append(f"| **Actual Malicious (1)** | **{cm['true_positives']} (TP)** | {cm['false_negatives']} (FN) | {cm['true_positives'] + cm['false_negatives']} |")
    md.append(f"| **Actual Benign (0)** | {cm['false_positives']} (FP) | **{cm['true_negatives']} (TN)** | {cm['false_positives'] + cm['true_negatives']} |")
    md.append(f"| **Total** | {cm['true_positives'] + cm['false_positives']} | {cm['false_negatives'] + cm['true_negatives']} | {metrics['total_samples']} |\n")

    md.append("### Split Performance: Smoke Test vs. Held-Out Generalization Set\n")
    md.append("| Test Split | Samples | TP | FP | TN | FN | TPR (Detection) | FPR (False Alarm) | F1 Score | Median Latency | P95 Latency |")
    md.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for sp_name, sp in metrics["splits"].items():
        md.append(
            f"| **{sp_name}** | {sp['total']} | {sp['tp']} | {sp['fp']} | {sp['tn']} | {sp['fn']} | "
            f"**{sp['tpr']}%** | **{sp['fpr']}%** | {sp['f1']} | {sp['median_latency_ms']} ms | {sp['p95_latency_ms']} ms |"
        )
    md.append("\n")

    md.append("### Category Breakdown\n")
    md.append("| Category | Class | Total Prompts | Caught / Flagged | Detection / Flag Rate | Mean Risk Score | Median Latency |")
    md.append("|---|---|---:|---:|---:|---:|---:|")
    for cat_name, cat in metrics["categories"].items():
        cls_str = "Malicious" if cat["is_malicious"] else "Benign"
        md.append(
            f"| `{cat_name}` | {cls_str} | {cat['total']} | {cat['detected_as_threat']} | "
            f"**{cat['rate_percent']}%** | {cat['mean_risk_score']} | {cat['median_latency_ms']} ms |"
        )
    md.append("\n")

    md.append("### Defense-in-Depth Layer Attribution\n")
    md.append("How incoming threats were first neutralized across the 6-layer defense pipeline:\n")
    md.append("| Security Layer | Threats Intercepted | Percentage of Detected |")
    md.append("|---|---:|---:|")
    total_det = metrics["early_exit"]["total_detected"]
    for layer, cnt in sorted(metrics["layer_attribution"].items(), key=lambda x: -x[1]):
        pct = (cnt / total_det * 100) if total_det > 0 else 0.0
        md.append(f"| `{layer}` | {cnt} | {pct:.1f}% |")
    md.append(
        f"\n**Early Exit Efficiency:** **{metrics['early_exit']['early_exit_percent']}%** of detected attacks were "
        f"intercepted at or before Layer 2 (Heuristics / Rule engine), short-circuiting expensive model evaluation.\n"
    )

    md.append("### Latency Profile (Milliseconds)\n")
    md.append("| Traffic Type | Mean | Median (p50) | P90 | P95 | P99 | Min | Max | StdDev |")
    md.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    md.append(
        f"| **All Traffic** | {lat_all.get('mean_ms',0)} | {lat_all.get('median_ms',0)} | {lat_all.get('p90_ms',0)} | "
        f"{lat_all.get('p95_ms',0)} | {lat_all.get('p99_ms',0)} | {lat_all.get('min_ms',0)} | {lat_all.get('max_ms',0)} | {lat_all.get('std_ms',0)} |"
    )
    md.append(
        f"| **Malicious Traffic** | {lat_mal.get('mean_ms',0)} | {lat_mal.get('median_ms',0)} | {lat_mal.get('p90_ms',0)} | "
        f"{lat_mal.get('p95_ms',0)} | {lat_mal.get('p99_ms',0)} | {lat_mal.get('min_ms',0)} | {lat_mal.get('max_ms',0)} | {lat_mal.get('std_ms',0)} |"
    )
    md.append(
        f"| **Benign Traffic** | {lat_safe.get('mean_ms',0)} | {lat_safe.get('median_ms',0)} | {lat_safe.get('p90_ms',0)} | "
        f"{lat_safe.get('p95_ms',0)} | {lat_safe.get('p99_ms',0)} | {lat_safe.get('min_ms',0)} | {lat_safe.get('max_ms',0)} | {lat_safe.get('std_ms',0)} |"
    )
    md.append("\n")

    # Failure Analysis
    fps = metrics["failures"]["false_positives"]
    fns = metrics["failures"]["false_negatives"]
    md.append("### Failure Analysis\n")
    md.append(f"- **False Positives (Benign Prompts Incorrectly Blocked):** {len(fps)}")
    if fps:
        for item in fps[:10]:
            md.append(f"  - `[{item['category']}]` *\"{item['prompt'][:90]}...\"* → Flagged by `{item['flagged_layer']}` (Score: {item['risk_score']})")
    md.append(f"\n- **False Negatives (Malicious Prompts Slipped Past):** {len(fns)}")
    if fns:
        for item in fns[:10]:
            md.append(f"  - `[{item['category']}]` *\"{item['prompt'][:90]}...\"* → Risk Score: {item['risk_score']}")
    md.append("\n")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    print(f"[+] Markdown report saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Lurien Matrix Comprehensive Benchmark Suite")
    parser.add_argument("--dataset", default="benchmarks/data/benchmark_testset.json", help="Path to testset JSON")
    parser.add_argument("--engine", choices=["local", "http"], default="local", help="Execution engine (local pipeline or http)")
    parser.add_argument("--url", default="https://imdrizzle-lurien-matrix-firewall.hf.space", help="Base URL for HTTP engine")
    parser.add_argument("--api-key", default=os.getenv("LURIEN_BENCH_KEY"), help="API key for HTTP engine")
    parser.add_argument("--threshold", type=float, default=0.50, help="Risk threshold")
    parser.add_argument("--output-dir", default="benchmarks/results", help="Directory to save raw predictions and logs")
    args = parser.parse_args()

    # Load dataset
    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        print(f"[-] Dataset {dataset_path} not found. Running prepare_benchmark_dataset.py first...")
        from prepare_benchmark_dataset import build_benchmark_dataset
        build_benchmark_dataset()

    with open(dataset_path, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    # Run predictions
    if args.engine == "local":
        raw_preds = run_benchmark_local(dataset, threshold=args.threshold)
    else:
        if not args.api_key:
            print("[-] HTTP engine requires --api-key or LURIEN_BENCH_KEY env var.")
            sys.exit(1)
        raw_preds = run_benchmark_http(dataset, url=args.url, api_key=args.api_key)

    # Compute all metrics
    print("\n[+] Computing comprehensive metrics...")
    metrics = compute_comprehensive_metrics(raw_preds)

    # Create timestamped outputs
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    json_preds_path = out_dir / f"predictions_{ts}.json"
    csv_preds_path = out_dir / f"predictions_{ts}.csv"
    metrics_path = out_dir / f"metrics_{ts}.json"
    report_path = out_dir / f"benchmark_report_{ts}.md"

    # Also maintain latest pointers
    latest_json_preds = out_dir / "predictions_latest.json"
    latest_csv_preds = out_dir / "predictions_latest.csv"
    latest_metrics = out_dir / "metrics_latest.json"
    latest_report = out_dir / "benchmark_report_latest.md"

    # 1. Save raw predictions JSON
    with open(json_preds_path, "w", encoding="utf-8") as f:
        json.dump(raw_preds, f, indent=2, ensure_ascii=False)
    with open(latest_json_preds, "w", encoding="utf-8") as f:
        json.dump(raw_preds, f, indent=2, ensure_ascii=False)

    # 2. Save raw predictions CSV
    df = pd.DataFrame(raw_preds)
    # Simplify layers dict for clean tabular CSV
    df["layers_summary"] = df["layers"].apply(
        lambda d: "; ".join([f"{k}:{'TRIG' if v.get('triggered') else 'PASS'}" for k, v in d.items() if v.get('ran')])
        if isinstance(d, dict) else ""
    )
    df_export = df.drop(columns=["layers"])
    df_export.to_csv(csv_preds_path, index=False, encoding="utf-8")
    df_export.to_csv(latest_csv_preds, index=False, encoding="utf-8")

    def np_serializer(obj):
        if isinstance(obj, (np.bool_, bool)):
            return bool(obj)
        if isinstance(obj, (np.integer, np.int64, np.int32)):
            return int(obj)
        if isinstance(obj, (np.floating, np.float64, np.float32)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return str(obj)

    # 3. Save metrics JSON
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False, default=np_serializer)
    with open(latest_metrics, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, ensure_ascii=False, default=np_serializer)

    # 4. Generate Markdown report
    generate_markdown_report(metrics, report_path)
    generate_markdown_report(metrics, latest_report)

    # Print summary to terminal
    print("\n" + "=" * 60)
    print("## BENCHMARK EXECUTION COMPLETED")
    print("=" * 60)
    print(f"Total Evaluated Prompts:  {metrics['total_samples']}")
    print(f"Accuracy:                 {metrics['rates']['accuracy']}%")
    print(f"True Positive Rate (TPR): {metrics['rates']['tpr_recall_sensitivity']}% (Detected {metrics['confusion_matrix']['true_positives']}/{metrics['confusion_matrix']['true_positives'] + metrics['confusion_matrix']['false_negatives']})")
    print(f"False Positive Rate (FPR):{metrics['rates']['fpr_false_alarm']}% (Blocked {metrics['confusion_matrix']['false_positives']}/{metrics['confusion_matrix']['false_positives'] + metrics['confusion_matrix']['true_negatives']})")
    print(f"Balanced Accuracy:        {metrics['rates']['balanced_accuracy']}%")
    print(f"Precision:                {metrics['rates']['precision_ppv']}%")
    print(f"F1 Score:                 {metrics['rates']['f1_score']}")
    print(f"Matthews Corr Coef (MCC): {metrics['rates']['mcc']}")
    print(f"ROC-AUC:                  {metrics['rates']['roc_auc']}")
    print(f"PR-AUC:                   {metrics['rates']['pr_auc']}")
    print(f"Median Pipeline Latency:  {metrics['latency']['overall']['median_ms']} ms")
    print(f"P95 Pipeline Latency:     {metrics['latency']['overall']['p95_ms']} ms")
    print("=" * 60)
    print(f"[+] Preserved Raw Predictions JSON: {json_preds_path}")
    print(f"[+] Preserved Raw Predictions CSV:  {csv_preds_path}")
    print(f"[+] Preserved Metrics JSON:         {metrics_path}")
    print(f"[+] Preserved Markdown Report:      {report_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
