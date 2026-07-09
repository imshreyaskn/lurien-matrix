import { useState } from 'react';
import { Shield, AlertTriangle, Zap, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import RiskBadge from '../components/RiskBadge';
import AttackChip from '../components/AttackChip';
import LogDrawer from '../components/LogDrawer';
import { formatNumber, formatMs, formatTime, formatAttackType, getAttackColor, timeAgo } from '../utils/formatters';
import { CHART_THEME } from '../utils/theme';



export default function Overview() {
  const [selectedLog, setSelectedLog] = useState(null);

  const { data: stats, loading: statsLoading, error: statsError } = usePolling(() => api.getStats(), 5000);
  const { data: logsData, error: logsError } = usePolling(() => api.getLogs({ limit: 10 }), 3000);

  const logs = logsData?.logs || [];

  // Prepare donut chart data
  const attackData = stats?.attack_breakdown
    ? Object.entries(stats.attack_breakdown).map(([name, value]) => {
        const colorObj = getAttackColor(name);
        return {
          name: formatAttackType(name),
          value,
          color: colorObj.text,
        };
      })
    : [];

  // Prepare layer effectiveness data
  const layerData = stats?.layer_effectiveness
    ? [
        { name: 'Canary Token', value: stats.layer_effectiveness.canary_pct, color: '#9B4444' },
        { name: 'Rule-Based', value: stats.layer_effectiveness.rule_based_pct, color: '#C89F3C' },
        { name: 'Heuristic', value: stats.layer_effectiveness.heuristic_pct, color: '#4A7C59' },
        { name: 'Embedding Similarity', value: stats.layer_effectiveness.embedding_pct, color: '#456B7D' },
        { name: 'ML Classifier', value: stats.layer_effectiveness.ml_pct, color: '#6B5B95' },
        { name: 'Context Policy', value: stats.layer_effectiveness.context_pct, color: '#D4B89E' },
      ]
    : [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="display-text text-luma-FFF font-sans uppercase">
          Lurien <span className="font-bold text-accent-gold">Core</span>
        </h1>
        <p className="text-luma-500 mt-1 font-mono text-sm tracking-wider uppercase">Real-time threat matrix telemetry</p>
      </div>

      {(statsError || logsError) && (
        <div className="bg-firewall-red/10 border border-firewall-red rounded-none p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-firewall-red shrink-0" />
          <span className="text-sm font-mono text-firewall-red uppercase tracking-widest">Failed to load dashboard data.</span>
        </div>
      )}

      {/* Hero Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <MetricCard
          label="INGRESS REQ"
          value={formatNumber(stats?.total_checks || 0)}
          delta={`${formatNumber(stats?.requests_today || 0)} TDY`}
          highlight={false}
        />
        <MetricCard
          label="THREATS BLOCKED"
          value={formatNumber(stats?.blocked_count || 0)}
          delta={`${stats?.block_rate?.toFixed(1) || 0}% RATE`}
          highlight={true}
        />
        <MetricCard
          label="DETECTION RATE"
          value={`${stats?.block_rate?.toFixed(1) || 0}%`}
          delta="CONFIDENCE"
          highlight={false}
        />
        <MetricCard
          label="SYS LATENCY"
          value={formatMs(stats?.avg_processing_time_ms)}
          delta="< 150MS TGT"
          highlight={false}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Donut Chart */}
        <div className="bg-luma-100/40 backdrop-blur-2xl border border-white/5 rounded-[32px] p-8 shadow-xl">
          <h3 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-4">
            Vector Distribution
          </h3>
          {attackData.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="w-48 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={attackData}
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                      isAnimationActive={false}
                    >
                      {attackData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip {...CHART_THEME.tooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 font-mono text-sm">
                {attackData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5" style={{ backgroundColor: entry.color }} />
                    <span className="text-luma-500 uppercase tracking-widest">{entry.name}</span>
                    <span className="text-luma-FFF font-bold ml-auto">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-luma-500 font-mono text-sm uppercase tracking-widest">
              Awaiting Payload Data...
            </div>
          )}
        </div>

        {/* Layer Effectiveness */}
        <div className="bg-luma-100/40 backdrop-blur-2xl border border-white/5 rounded-[32px] p-8 shadow-xl">
          <h3 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-4">
            Matrix Interception Layers
          </h3>
          <div className="space-y-5 mt-6 font-mono">
            {layerData.map((layer) => (
              <div key={layer.name} className="space-y-1">
                <div className="flex justify-between text-xs uppercase tracking-widest">
                  <span className="text-luma-500">{layer.name}</span>
                  <span className="font-bold text-luma-FFF">
                    {layer.value.toFixed(1)}%
                  </span>
                </div>
                <div className="h-[1px] bg-luma-300 w-full relative">
                  <div
                    className="absolute top-0 left-0 h-[1px] transition-all duration-1000"
                    style={{ width: `${layer.value}%`, backgroundColor: layer.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          {layerData.length === 0 && (
            <div className="h-32 flex items-center justify-center text-luma-500 font-mono text-sm uppercase tracking-widest">
              Matrix Inactive
            </div>
          )}
        </div>
      </div>

      {/* Real-time Feed */}
      <div className="bg-luma-100/40 backdrop-blur-2xl border border-white/5 rounded-[32px] p-8 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-luma-700 tracking-widest uppercase">
            Ingress Terminal Feed
          </h3>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-status-online" />
            <span className="text-xs text-luma-500 font-mono tracking-widest uppercase">Live Stream</span>
          </div>
        </div>

        {logs.length > 0 ? (
          <div className="space-y-0 border-t border-luma-300">
            {logs.map((log, i) => (
              <button
                key={log.request_id || i}
                onClick={() => setSelectedLog(log)}
                className={`w-full flex items-center gap-4 py-3 px-4 cursor-pointer border-b border-luma-300 transition-transform hover:-translate-y-px hover:bg-luma-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-gold ${
                  !log.safe ? 'text-luma-FFF' : 'text-luma-500'
                }`}
              >
                <span className="text-xs font-mono tracking-widest w-20 shrink-0">
                  {formatTime(log.timestamp)}
                </span>
                <span className="text-xs font-mono tracking-widest w-24 truncate shrink-0">
                  {log.prompt_hash?.slice(0, 12) || '—'}
                </span>
                <RiskBadge score={log.risk_score} isBlocked={!log.safe} size="sm" />
                {log.attack_type && <AttackChip type={log.attack_type} />}
                <span className="text-xs font-mono tracking-widest ml-auto">
                  {formatMs(log.processing_time_ms)}
                </span>
                <span className="text-xs font-mono tracking-widest uppercase w-16 text-right">
                  {log.provider || 'CHK'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-luma-500 font-mono text-sm tracking-widest uppercase border border-dashed border-luma-300">
            <div className="text-center">
              <p>AWAITING INGRESS SIGNALS...</p>
            </div>
          </div>
        )}
      </div>

      {/* Log Drawer */}
      {selectedLog && (
        <LogDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}

function MetricCard({ label, value, delta, highlight }) {
  return (
    <div className={`p-6 bg-luma-100/40 backdrop-blur-2xl border rounded-[32px] flex flex-col justify-between min-h-[140px] shadow-xl transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] ${highlight ? 'border-accent-gold/50 shadow-[0_0_30px_rgba(212,184,158,0.15)]' : 'border-white/5'}`}>
      <span className={`text-xs font-bold uppercase tracking-widest ${highlight ? 'text-accent-gold' : 'text-luma-700'}`}>
        {label}
      </span>
      <div className="text-[36px] font-semibold font-mono mt-4 tabular-nums text-luma-FFF leading-none">
        {value}
      </div>
      <div className={`text-xs font-mono tracking-widest mt-2 ${highlight ? 'text-accent-gold/80' : 'text-luma-500'}`}>
        {delta}
      </div>
    </div>
  );
}
