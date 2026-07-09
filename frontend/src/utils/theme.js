/**
 * Lurien Matrix — JS-side design tokens.
 * Single source of truth for all colors used in inline styles,
 * Recharts, D3, and any non-Tailwind context.
 *
 * Keep in sync with tailwind.config.js color tokens.
 */

// ── Base ink scale ────────────────────────────────────────
export const INK = {
  0:    '#000000',
  50:   '#0A0A0A',
  100:  '#111111',
  200:  '#1A1A1A',
  300:  '#333333',
  500:  '#666666',
  700:  '#AAAAAA',
  900:  '#E0E0E0',
  1000: '#FFFFFF',
};

export const GOLD = '#D4B89E';

// ── Threat / attack type colors ───────────────────────────
// Used by getAttackColor and chart series
export const THREAT = {
  red:    { bg: 'rgba(155,68,68,0.15)',   border: '#9B4444', text: '#9B4444' },
  amber:  { bg: 'rgba(200,159,60,0.15)',  border: '#C89F3C', text: '#C89F3C' },
  green:  { bg: 'rgba(74,124,89,0.15)',   border: '#4A7C59', text: '#4A7C59' },
  blue:   { bg: 'rgba(69,107,125,0.15)',  border: '#456B7D', text: '#456B7D' },
  purple: { bg: 'rgba(107,91,149,0.15)',  border: '#6B5B95', text: '#6B5B95' },
  muted:  { bg: INK[100],                 border: INK[300],  text: INK[700]  },
};

// Solid hex values for chart series (Recharts stroke/fill)
export const THREAT_HEX = ['#9B4444', '#C89F3C', '#4A7C59', '#456B7D', '#6B5B95', '#D4B89E', '#8C92AC'];

// ── Layer-specific colors (6 pipeline layers) ─────────────
// Canonical color object used by LayerBreakdown AND LiveMonitor pipeline pills.
export const LAYER = {
  l0: { bg: '#2E2538', border: '#4A3F57', text: '#C4B5D9', label: 'CANARY'         },
  l1: { bg: '#2E1E1E', border: '#4D2F2F', text: '#E8B4B4', label: 'RULE-BASED'     },
  l2: { bg: '#2E2818', border: '#4D4228', text: '#E8D4A0', label: 'HEURISTIC'       },
  l3: { bg: '#252E20', border: '#394828', text: '#B8D4A8', label: 'EMBEDDING'       },
  l4: { bg: '#1E2830', border: '#2F3F50', text: '#A8C8E0', label: 'ML CLASSIFIER'   },
  l5: { bg: '#2E2025', border: '#4D303A', text: '#E8B8C8', label: 'CONTEXT POLICY'  },
};

// ── Status colors ─────────────────────────────────────────
export const STATUS = {
  safe:     '#4A7C59',
  warn:     '#C89F3C',
  blocked:  '#9B4444',
  online:   '#10B981',   // system live indicator
  offline:  '#EF4444',   // system error indicator
};

// ── Recharts shared theme ─────────────────────────────────
// Import this in every chart component — no more inline contentStyle objects.
export const CHART_THEME = {
  tooltip: {
    contentStyle: {
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      color: '#FFFFFF',
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
    },
    labelStyle: { color: INK[700] },
    cursor: { fill: 'rgba(255,255,255,0.03)' },
  },
  grid: {
    stroke: 'rgba(255,255,255,0.06)',
    strokeDasharray: '0',
  },
  axis: {
    stroke: INK[300],
    tick: {
      fill: INK[500],
      fontSize: 10,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
    },
  },
};
