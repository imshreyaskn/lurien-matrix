import { BarChart3, Clock, AlertTriangle, ShieldCheck, Flame } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import { formatAttackType, formatNumber } from '../utils/formatters';

import { CHART_THEME, THREAT_HEX } from '../utils/theme';

const LURIEN_COLORS = THREAT_HEX;

export default function Analytics() {
  const { data: stats, error, loading } = usePolling(() => api.getStats(), 5000);

  // 1. Attack Breakdown Chart (Horizontal bar)
  const attackData = stats?.attack_breakdown
    ? Object.entries(stats.attack_breakdown)
        .map(([name, value], i) => ({
          name: formatAttackType(name),
          value,
          fill: LURIEN_COLORS[i % LURIEN_COLORS.length],
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  // 2. Risk Score Distribution
  const riskDistData = stats?.risk_distribution || [];

  // 3. 30-Day Stacked Trend
  const trendData = stats?.attack_over_time || [];

  // 4. Hourly Heatmap Grid
  const heatmapData = stats?.hourly_heatmap || [];

  // 5. Top Flagged Patterns
  const topPatterns = stats?.top_flagged_patterns || [];

  // 6. Layer Effectiveness
  const layerData = stats?.layer_effectiveness || {};

  // Days of week label mapping
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Helper to color-code heatmap cells based on count
  const getCellColor = (count, maxCount) => {
    if (count === 0) return 'bg-luma-100 border-luma-100'; // No activity

    const intensity = count / maxCount;
    if (intensity > 0.8) return 'bg-firewall-red border-firewall-red text-luma-FFF';
    if (intensity > 0.5) return 'bg-firewall-red/80 border-firewall-red/80 text-luma-FFF';
    if (intensity > 0.3) return 'bg-firewall-red/60 border-firewall-red/60 text-luma-FFF';
    if (intensity > 0.1) return 'bg-firewall-red/40 border-firewall-red/40';
    return 'bg-firewall-red/20 border-firewall-red/20';
  };

  return (
    <div className="space-y-8 pb-12 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="display-text text-luma-FFF font-sans uppercase">
          Threat <span className="font-bold text-accent-gold">Analytics</span>
        </h1>
        <p className="text-luma-500 mt-1 font-mono text-sm tracking-wider uppercase">
          Deep telemetry of vector attacks and tracking grids.
        </p>
      </div>

      {/* Hero Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="p-6 bg-white/5 backdrop-blur-2xl border border-white/5 rounded-lg flex flex-col justify-between min-h-[140px] shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
          <div className="text-xs text-luma-700 uppercase font-bold tracking-widest">TOTAL THREATS</div>
          <div className="text-[36px] font-semibold text-luma-FFF font-mono mt-4 tabular-nums leading-none">
            {formatNumber(stats?.flagged_count || 0)}
          </div>
          <div className="text-xs text-luma-500 font-mono tracking-widest mt-2">
            {stats?.flag_rate?.toFixed(1) || 0}% THREATS
          </div>
        </div>
        <div className="p-6 bg-white/5 backdrop-blur-2xl border border-white/5 rounded-lg flex flex-col justify-between min-h-[140px] shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
          <div className="text-xs text-luma-700 uppercase font-bold tracking-widest">AVG LATENCY</div>
          <div className="text-[36px] font-semibold text-luma-FFF font-mono mt-4 tabular-nums leading-none">
            {stats?.avg_processing_time_ms?.toFixed(1) || 0}MS
          </div>
          <div className="text-xs text-luma-500 font-mono tracking-widest mt-2">
            FASTEST PATH &lt;5MS
          </div>
        </div>
        <div className="p-6 bg-white/5 backdrop-blur-2xl border border-accent-gold/50 rounded-lg flex flex-col justify-between min-h-[140px] shadow-[0_0_30px_rgba(212,184,158,0.15)] transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
          <div className="text-xs text-accent-gold uppercase font-bold tracking-widest">SYS STATUS</div>
          <div className="text-[36px] font-semibold font-mono mt-4 text-luma-FFF tabular-nums leading-none">
            {loading && !stats ? '...' : error ? 'ERR' : 'ACTIVE'}
          </div>
          <div className="text-xs text-accent-gold/80 font-mono tracking-widest mt-2">
            {error ? 'API LOST' : 'MATRIX PIPELINE OK'}
          </div>
        </div>
        <div className="p-6 bg-white/5 backdrop-blur-2xl border border-white/5 rounded-lg flex flex-col justify-between min-h-[140px] shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
          <div className="text-xs text-luma-700 uppercase font-bold tracking-widest">ACTIVE VECTORS</div>
          <div className="text-[36px] font-semibold text-luma-FFF font-mono mt-4 tabular-nums leading-none">
            {attackData.length}
          </div>
          <div className="text-xs text-luma-500 font-mono tracking-widest mt-2">
            DISTINCT VECTORS
          </div>
        </div>
      </div>

      {/* Row 1: Attack type breakdown over time (stepped line chart) */}
      <div className="bg-white/5 backdrop-blur-2xl border border-white/5 rounded-lg p-8 shadow-xl">
        <h3 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
          Vector Proliferation Tracking (30 Days)
        </h3>
        <div className="h-80">
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="1 3" stroke="#333333" vertical={false} />
                <XAxis dataKey="date" stroke="#666666" fontSize={10} fontFamily="monospace" tickLine={false} />
                <YAxis stroke="#666666" fontSize={10} fontFamily="monospace" tickLine={false} />
                <Tooltip {...CHART_THEME.tooltip} />
                <Legend iconType="square" wrapperStyle={{ fontSize: '10px', paddingTop: '10px', fontFamily: 'monospace', textTransform: 'uppercase', color: '#AAAAAA' }} />
                <Line isAnimationActive={false} type="step" dot={false} strokeWidth={1} name="Role Override" dataKey="role_override" stroke={LURIEN_COLORS[0]} />
                <Line isAnimationActive={false} type="step" dot={false} strokeWidth={1} name="Goal Hijacking" dataKey="goal_hijacking" stroke={LURIEN_COLORS[1]} />
                <Line isAnimationActive={false} type="step" dot={false} strokeWidth={1} name="Context Poisoning" dataKey="context_poisoning" stroke={LURIEN_COLORS[2]} />
                <Line isAnimationActive={false} type="step" dot={false} strokeWidth={1} name="Tool Manipulation" dataKey="tool_manipulation" stroke={LURIEN_COLORS[3]} />
                <Line isAnimationActive={false} type="step" dot={false} strokeWidth={1} name="Cascading Amp" dataKey="cascading_amplification" stroke={LURIEN_COLORS[4]} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-luma-500 font-mono text-sm uppercase tracking-widest">
              Processing Node Data...
            </div>
          )}
        </div>
      </div>

      {/* Row 2: 24-Hour Heatmap Grid */}
      <div className="bg-white/5 backdrop-blur-2xl border border-white/5 rounded-lg p-8 shadow-xl">
        <h3 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-4 flex items-center gap-2">
          Hourly Ingress Constellation
        </h3>
        <p className="text-xs text-luma-500 font-mono tracking-widest uppercase mb-6">
          Payload density visualization.
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-[800px] space-y-1">
            {/* Header / Hours */}
            <div className="flex items-center text-center pb-2">
              <div className="w-12 text-xs font-mono text-luma-500 text-left">DAY</div>
              <div className="flex-1 grid grid-cols-24 gap-[1px]">
                {Array.from({ length: 24 }).map((_, h) => (
                  <div key={h} className="text-xs font-mono text-luma-300">
                    {h.toString().padStart(2, '0')}
                  </div>
                ))}
              </div>
            </div>

            {/* Days Grid */}
            {DAYS.map((dayName, dayIdx) => {
              const dayCells = heatmapData.filter(d => d.day === dayIdx);
              return (
                <div key={dayIdx} className="flex items-center">
                  <div className="w-12 text-xs font-mono text-luma-700 uppercase">{dayName}</div>
                  <div className="flex-1 grid grid-cols-24 gap-[1px]">
                    {Array.from({ length: 24 }).map((_, h) => {
                      const cell = dayCells.find(c => c.hour === h) || { count: 0 };
                      return (
                        <div
                          key={h}
                          title={`${dayName} at ${h.toString().padStart(2, '0')}:00 - ${cell.count} threats`}
                          className={`aspect-square w-full border ${getCellColor(cell.count, 50)}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Legend */}
            <div className="flex items-center justify-end gap-6 pt-6 text-xs text-luma-500 font-mono tracking-widest uppercase">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-luma-000 border border-luma-100" /> SAFE
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-luma-300 border border-luma-500" /> LOW
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-luma-500 border border-luma-700" /> MED
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-luma-700 border border-luma-900" /> HIGH
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-luma-FFF border border-luma-FFF" /> CRIT
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Histogram of Risk Scores & Layer effectiveness */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Risk Score Histogram */}
        <div className="bg-white/5 backdrop-blur-2xl border border-white/5 rounded-lg p-8 shadow-xl">
          <h3 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
            Risk Score Density
          </h3>
          <div className="h-64">
            {riskDistData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskDistData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="1 3" stroke="#333333" vertical={false} />
                  <XAxis dataKey="range" stroke="#666666" fontSize={10} fontFamily="monospace" tickLine={false} />
                  <YAxis stroke="#666666" fontSize={10} fontFamily="monospace" tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} {...CHART_THEME.tooltip} />
                  <Bar isAnimationActive={false} dataKey="count" fill="#D4B89E" maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-luma-500 font-mono text-sm uppercase tracking-widest">
                Generating Score Map...
              </div>
            )}
          </div>
        </div>

        {/* Layer Effectiveness */}
        <div className="bg-white/5 backdrop-blur-2xl border border-white/5 rounded-lg p-8 shadow-xl">
          <h3 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
            Intercept Topology
          </h3>
          <div className="space-y-6 mt-4">
            <LayerStat
              name="Canary Token (L0)"
              description="System prompt leakage prevention using unique tokens"
              percentage={layerData.canary_pct || 0}
              color="#D4B89E"
            />
            <LayerStat
              name="Rule-Based (L1)"
              description="Regex patterns for direct prompts, homoglyphs & base64"
              percentage={layerData.rule_based_pct || 0}
              color="#D4B89E"
            />
            <LayerStat
              name="Heuristic (L2)"
              description="6-signal weighted anomaly vector scans"
              percentage={layerData.heuristic_pct || 0}
              color="#D4B89E"
            />
            <LayerStat
              name="Embedding Sim (L3)"
              description="FAISS nearest-neighbor matching against historical injections"
              percentage={layerData.embedding_pct || 0}
              color="#D4B89E"
            />
            <LayerStat
              name="ML Classifier (L4)"
              description="DistilBERT fine-tune for contextual & cascading vectors"
              percentage={layerData.ml_pct || 0}
              color="#D4B89E"
            />
            <LayerStat
              name="Context Policy (L5)"
              description="Dynamic application intent validation using semantic alignment"
              percentage={layerData.context_pct || 0}
              color="#D4B89E"
            />
          </div>
        </div>
      </div>

      {/* Row 4: Top flagged patterns list */}
      <div className="bg-white/5 backdrop-blur-2xl border border-white/5 rounded-lg p-8 shadow-xl">
        <h3 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-4">
          Identified Malicious Signatures
        </h3>
        {topPatterns.length > 0 ? (
          <div className="grid grid-cols-2 gap-4">
            {topPatterns.map((item, i) => (
              <div key={item.pattern} className="flex items-center gap-3 py-3 border-b border-luma-300 bg-transparent">
                <span className="text-xs font-mono font-bold text-luma-500 w-6">
                  {(i + 1).toString().padStart(2, '0')}
                </span>
                <code className="text-xs text-luma-FFF font-mono flex-1 truncate uppercase tracking-widest">
                  {item.pattern}
                </code>
                <span className="text-xs font-bold text-luma-000 font-mono bg-accent-gold px-2 py-0.5 tracking-widest">
                  {item.count} HIT
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-luma-500 font-mono text-sm uppercase tracking-widest">
            No Signatures Mapped
          </div>
        )}
      </div>
    </div>
  );
}

function LayerStat({ name, description, percentage, color }) {
  const safePct = typeof percentage === 'number' && !isNaN(percentage) ? percentage : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <div className="text-xs font-bold text-luma-FFF font-mono tracking-widest uppercase">{name}</div>
          <div className="text-xs text-luma-500 uppercase">{description}</div>
        </div>
        <div className="text-right">
          <div className="text-base font-light font-mono text-luma-FFF">
            {safePct.toFixed(1)}%
          </div>
        </div>
      </div>
      <div className="h-[1px] bg-luma-300 w-full relative mt-2">
        <div
          className="absolute top-0 left-0 h-[1px] transition-all duration-1000"
          style={{ width: `${safePct}%`, backgroundColor: color || '#FFFFFF' }}
        />
      </div>
    </div>
  );
}
