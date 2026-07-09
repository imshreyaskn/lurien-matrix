import { formatMs } from '../utils/formatters';
import { LAYER } from '../utils/theme';

/**
 * Visual breakdown of all 6 classifier layers.
 */
export default function LayerBreakdown({ layers }) {
  if (!layers) return null;

  const {
    canary,
    rule_based,
    heuristic,
    openai_moderation,
    embedding_similarity,
    ml_classifier,
    context_policy,
  } = layers;

  return (
    <div className="space-y-3">
      {/* Layer 0 — Canary */}
      <LayerRow
        name="Canary Token"
        number="L0"
        color={LAYER.l0}
        ran={canary?.ran !== false}
        triggered={canary?.triggered}
        score={canary?.score}
        latency={canary?.latency_ms}
        detail={
          canary?.triggered
            ? "SYSTEM PROMPT EXTRACTION DETECTED"
            : "NO CANARY TOKEN FOUND"
        }
      />

      {/* Layer 1: Rule-Based */}
      <LayerRow
        name="Rule-Based"
        number="L1"
        color={LAYER.l1}
        ran={rule_based?.ran !== false}
        triggered={rule_based?.triggered}
        score={rule_based?.score}
        latency={rule_based?.latency_ms}
        detail={rule_based?.matched_pattern ? `SIGNATURE MATCH: ${rule_based.matched_pattern}` : "NO SIGNATURE MATCH"}
      />

      {/* Layer 2: Heuristic */}
      <LayerRow
        name="Heuristic"
        number="L2"
        color={LAYER.l2}
        ran={heuristic?.ran !== false}
        triggered={heuristic?.triggered}
        score={heuristic?.score}
        latency={heuristic?.latency_ms}
        detail={heuristic?.reason ? `ANOMALY DETECTED: ${heuristic.reason}` : "ANOMALY CHECK PASSED"}
      />

      {/* Layer 3 — Embedding Similarity */}
      <LayerRow
        name="Embedding Similarity"
        number="L3"
        color={LAYER.l3}
        ran={embedding_similarity?.ran !== false}
        triggered={embedding_similarity?.triggered}
        score={embedding_similarity?.similarity_score}
        latency={embedding_similarity?.latency_ms}
        detail={
          embedding_similarity?.triggered
            ? `SIMILAR TO ATTACK (${(embedding_similarity.similarity_score * 100).toFixed(1)}%): "${embedding_similarity.nearest_attack_preview}"`
            : `MAX SIMILARITY: ${(embedding_similarity?.similarity_score * 100 || 0).toFixed(1)}%`
        }
      />

      {/* Layer 4 — ML Classifier */}
      <LayerRow
        name="ML Classifier"
        number="L4"
        color={LAYER.l4}
        ran={ml_classifier?.ran !== false}
        triggered={ml_classifier?.triggered}
        score={ml_classifier?.confidence}
        latency={ml_classifier?.latency_ms}
        detail={ml_classifier?.attack_class ? `CLASS: ${ml_classifier.attack_class}` : ml_classifier?.reason || "CLASSIFICATION CLEAN"}
      />

      {/* Layer 5 — Context Policy */}
      <LayerRow
        name="Context Policy"
        number="L5"
        color={LAYER.l5}
        ran={context_policy?.ran !== false}
        triggered={context_policy?.triggered}
        score={context_policy?.score}
        latency={context_policy?.latency_ms}
        detail={
          context_policy?.reason === "no_policy"
            ? "NO INTENT POLICY ACTIVE"
            : context_policy?.triggered
            ? `OUT OF SCOPE FOR "${context_policy.app_context}" (${(context_policy.similarity_to_intent * 100).toFixed(1)}%)`
            : `WITHIN SCOPE FOR "${context_policy?.app_context}"`
        }
      />
    </div>
  );
}

function LayerRow({ name, number, color, ran, triggered, score, latency, detail }) {
  const isSkipped = !ran;
  const opacity = isSkipped ? 'opacity-30' : 'opacity-100';

  return (
    <div className={`flex items-center gap-3 py-3 px-3 mb-2 bg-black/20 border border-white/5 rounded-lg backdrop-blur-md ${opacity}`}>
      {/* Number badge */}
      <div 
        className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold shrink-0 font-mono border`}
        style={!isSkipped ? {
          backgroundColor: color.bg,
          borderColor: color.border,
          color: color.text,
        } : {}}
      >
        {number}
      </div>

      {/* Name + detail */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold tracking-widest uppercase" style={!isSkipped ? { color: color.text } : {}}>{name}</div>
        <div className="text-xs text-luma-500 font-mono tracking-widest uppercase truncate">
          {isSkipped ? 'BYPASSED' : detail || '—'}
        </div>
      </div>

      {/* Score */}
      {score !== null && score !== undefined && (
        <div className="text-right shrink-0">
          <div className={`text-xs font-mono font-bold tracking-widest ${triggered ? 'text-luma-FFF' : 'text-luma-500'}`}>
            {(score * 100).toFixed(1)}%
          </div>
        </div>
      )}

      {/* Latency */}
      <div className="text-xs text-luma-500 font-mono shrink-0 w-14 text-right tracking-widest">
        {ran ? formatMs(latency) : '—'}
      </div>

      {/* Status */}
      <div className="shrink-0 text-xs font-mono font-bold w-12 text-right">
        {isSkipped ? (
          <span className="text-luma-300">SKIP</span>
        ) : triggered ? (
          <span className="px-1" style={{ backgroundColor: color.text, color: color.bg }}>FLAG</span>
        ) : (
          <span style={{ color: color.text }}>PASS</span>
        )}
      </div>
    </div>
  );
}
