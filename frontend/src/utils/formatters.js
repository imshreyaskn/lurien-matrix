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
  if (isBlocked) return 'text-firewall-red';
  if (score === null || score === undefined || isNaN(score)) return 'text-luma-500';
  if (score >= 0.65) return 'text-firewall-red';
  if (score >= 0.35) return 'text-firewall-yellow';
  return 'text-firewall-green';
}

/**
 * Get background color class based on risk score.
 */
export function getRiskBg(score, isBlocked = false) {
  if (isBlocked) return 'bg-firewall-red/10 border-firewall-red text-firewall-red';
  if (score === null || score === undefined || isNaN(score)) return 'bg-luma-100 border-luma-300 text-luma-500';
  if (score >= 0.65) return 'bg-firewall-red/10 border-firewall-red text-firewall-red';
  if (score >= 0.35) return 'bg-firewall-yellow/10 border-firewall-yellow text-firewall-yellow';
  return 'bg-firewall-green/10 border-firewall-green text-firewall-green';
}

/**
 * Map attack type to a human-readable label.
 */
export function formatAttackType(type) {
  if (!type) return '—';
  if (type.startsWith("pii_detected:")) {
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
    DIRECT_INJECTION: 'Direct Injection',
    PERSONA_HIJACKING: 'Persona Hijacking',
    SYSTEM_OVERRIDE: 'System Override',
    ENCODING_ATTACKS: 'Encoding Attack',
    MANY_SHOT: 'Many-Shot',
  };
  return map[type] || type || '—';
}

export function getAttackColor(type) {
  const defaultColor = { bg: '#111111', border: '#333333', text: '#AAAAAA' };
  if (!type) return defaultColor;

  const red = { bg: 'rgba(155, 68, 68, 0.15)', border: '#9B4444', text: '#9B4444' };
  const green = { bg: 'rgba(74, 124, 89, 0.15)', border: '#4A7C59', text: '#4A7C59' };
  const yellow = { bg: 'rgba(200, 159, 60, 0.15)', border: '#C89F3C', text: '#C89F3C' };
  const blue = { bg: 'rgba(69, 107, 125, 0.15)', border: '#456B7D', text: '#456B7D' };
  const purple = { bg: 'rgba(107, 91, 149, 0.15)', border: '#6B5B95', text: '#6B5B95' };

  if (type.startsWith("pii_detected:")) return red;
  if (type.startsWith("refusal_bypass:")) return yellow;
  if (type.startsWith("indirect_injection:")) return purple;
  if (type.startsWith("canary_echo:")) return blue;

  const map = {
    role_override: red,
    goal_hijacking: yellow,
    context_poisoning: purple,
    tool_manipulation: blue,
    cascading_amplification: yellow,
    heuristic_composite: yellow,
    prompt_extraction: purple,
    jailbreak_paraphrase: blue,
    out_of_scope: green,
    DIRECT_INJECTION: red,
    PERSONA_HIJACKING: yellow,
    SYSTEM_OVERRIDE: purple,
    ENCODING_ATTACKS: blue,
    MANY_SHOT: red,
  };
  return map[type] || defaultColor;
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
