/**
 * Format a risk score to a percentage string.
 */
export function formatRiskScore(score) {
  if (score === null || score === undefined || isNaN(score)) return '—';
  return `${(score * 100).toFixed(1)}%`;
}

/**
 * Format milliseconds to a human-readable string.
 */
export function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format a large number with commas.
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString();
}

/**
 * Format an ISO timestamp to a local time string.
 */
export function formatTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format an ISO timestamp to a local date+time string.
 */
export function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Truncate a string and add ellipsis.
 */
export function truncate(str, maxLen = 30) {
  if (!str) return '—';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

/**
 * Get color class based on risk score.
 */
export function getRiskColor(score, isBlocked = false) {
  if (isBlocked) return 'text-status-blocked';
  if (score === null || score === undefined || isNaN(score)) return 'text-luma-500';
  if (score >= 0.65) return 'text-status-blocked';
  if (score >= 0.35) return 'text-status-warn';
  return 'text-status-safe';
}

/**
 * Get background color class based on risk score.
 */
export function getRiskBg(score, isBlocked = false) {
  if (isBlocked) return 'bg-firewall-red/10 border-firewall-red text-status-blocked';
  if (score === null || score === undefined || isNaN(score)) return 'bg-luma-100 border-luma-300 text-luma-500';
  if (score >= 0.65) return 'bg-firewall-red/10 border-firewall-red text-status-blocked';
  if (score >= 0.35) return 'bg-firewall-yellow/10 border-firewall-yellow text-status-warn';
  return 'bg-firewall-green/10 border-firewall-green text-status-safe';
}

/**
 * Map attack type to a human-readable label.
 */
export function formatAttackType(type) {
  if (!type) return '—';
  const t = String(type);
  if (t.startsWith("pii_detected:")) {
    const piiType = type.split(":")[1]?.toUpperCase() || "DATA";
    return `PII Leak (${piiType})`;
  }
  if (type.startsWith("refusal_bypass:")) {
    return "Refusal Bypass";
  }
  if (type.startsWith("indirect_injection:")) {
    return "Indirect Injection";
  }
  if (type.startsWith("canary_echo:")) {
    return "Canary Leak";
  }

    const map = {
      role_override: 'Role Override',
      goal_hijacking: 'Goal Hijacking',
      context_poisoning: 'Context Poisoning',
      tool_manipulation: 'Tool Manipulation',
      cascading_amplification: 'Cascading Amplification',
      heuristic_composite: 'Heuristic Detection',
      prompt_extraction: 'Prompt Extraction',
      jailbreak_paraphrase: 'Jailbreak Paraphrase',
      out_of_scope: 'Out of Scope',
      direct_injection: 'Direct Injection',
      persona_hijacking: 'Persona Hijacking',
      system_override: 'System Override',
      encoding_attacks: 'Encoding Attack',
      many_shot: 'Many-Shot',
      injection: 'Injection',
      cumulative_risk_exceeded: 'Cumulative Risk Exceeded',
    };
    return map[t.toLowerCase()] || t || '—';
}

import { THREAT } from './theme';

export function getAttackColor(type) {
  if (!type) return THREAT.muted;
  const t = String(type);

  if (t.startsWith("pii_detected:")) return THREAT.red;
  if (t.startsWith("refusal_bypass:")) return THREAT.amber;
  if (t.startsWith("indirect_injection:")) return THREAT.purple;
  if (t.startsWith("canary_echo:")) return THREAT.blue;

  const map = {
    role_override: THREAT.red,
    goal_hijacking: THREAT.amber,
    context_poisoning: THREAT.purple,
    tool_manipulation: THREAT.blue,
    cascading_amplification: THREAT.amber,
    heuristic_composite: THREAT.amber,
    prompt_extraction: THREAT.purple,
    jailbreak_paraphrase: THREAT.blue,
    out_of_scope: THREAT.green,
    direct_injection: THREAT.red,
    persona_hijacking: THREAT.amber,
    system_override: THREAT.purple,
    encoding_attacks: THREAT.blue,
    many_shot: THREAT.red,
    injection: THREAT.red,
    cumulative_risk_exceeded: THREAT.amber,
  };
  return map[t.toLowerCase()] || THREAT.muted;
}

/**
 * Time ago string.
 */
export function timeAgo(iso) {
  if (!iso) return '—';
  const timestamp = new Date(iso).getTime();
  if (isNaN(timestamp)) return '—';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
