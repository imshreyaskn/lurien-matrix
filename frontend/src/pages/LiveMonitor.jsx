import { useState, useEffect, useRef } from 'react';
import { Activity, Shield, AlertTriangle, Zap } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import LiveGraph from '../components/LiveGraph';
import LiveTestWidget from '../components/LiveTestWidget';
import RiskBadge from '../components/RiskBadge';
import AttackChip from '../components/AttackChip';
import { formatTime, formatMs, formatNumber, timeAgo } from '../utils/formatters';
import { LAYER } from '../utils/theme';

/**
 * Live Firewall Monitor — THE HACKATHON DEMO VIEW
 * 
 * Split screen:
 *   Left:  Scrolling real-time log
 *   Right: D3 firewall graph with animations
 * Bottom: Live stats bar + test widget
 */
export default function LiveMonitor() {
  const [events, setEvents] = useState([]);
  const [sessionStats, setSessionStats] = useState({
    total: 0, blocked: 0, lastBlocked: null, lastBlockedTime: null,
  });
  const prevLogsRef = useRef([]);

  const { data: logsData } = usePolling(() => api.getLogs({ limit: 15 }), 3000);
  const { data: stats } = usePolling(() => api.getStats(), 5000);

  const logs = logsData?.logs || [];
  
  const activeLayersCount = stats?.layer_effectiveness
    ? Object.values(stats.layer_effectiveness).filter(v => v > 0).length
    : 0;

  // Detect new events for animation
  useEffect(() => {
    if (logs.length === 0) return;

    const prevIds = new Set(prevLogsRef.current.map(l => l.request_id));
    const newLogs = logs.filter(l => !prevIds.has(l.request_id));

    if (newLogs.length > 0) {
      setEvents(prev => {
        const next = [
          ...prev,
          ...newLogs.map(l => ({
            safe: l.safe,
            attack_type: l.attack_type,
            risk_score: l.risk_score,
            timestamp: l.timestamp,
          })),
        ];
        return next.slice(-1000); // Cap at 1000 to prevent memory leak
      });

      // Update session stats
      setSessionStats(prev => {
        const blocked = newLogs.filter(l => !l.safe);
        const lastBlocked = blocked.length > 0 ? blocked[0] : null;
        return {
          total: prev.total + newLogs.length,
          blocked: prev.blocked + blocked.length,
          lastBlocked: lastBlocked?.attack_type || prev.lastBlocked,
          lastBlockedTime: lastBlocked?.timestamp || prev.lastBlockedTime,
        };
      });
    }

    prevLogsRef.current = logs;
  }, [logs]);

  const blockRate = sessionStats.total > 0
    ? ((sessionStats.blocked / sessionStats.total) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="display-text text-luma-FFF font-sans uppercase">
            Live <span className="font-bold text-accent-gold">Monitor</span>
          </h1>
          <p className="text-luma-500 mt-1 font-mono text-sm tracking-wider uppercase">Real-time telemetry stream</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border border-white/10 bg-white/5 rounded-full backdrop-blur-md shadow-lg">
          <div className="w-2 h-2 rounded-full bg-status-online shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
          <span className="text-xs font-mono tracking-widest uppercase text-luma-FFF">
            Sys_Status: {activeLayersCount > 0 ? `${activeLayersCount}/6 Layers Active` : 'Active'}
          </span>
        </div>
      </div>

      {/* 6-Layer Status Bar */}
      <div className="p-4 flex flex-wrap justify-between items-center gap-3 border border-white/5 bg-luma-100/40 backdrop-blur-2xl rounded-lg shadow-xl">
        <span className="text-xs font-bold text-luma-500 uppercase tracking-widest">Active Pipeline Layers:</span>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold tracking-widest uppercase">
          {Object.entries(LAYER).map(([key, layer], index, arr) => (
            <div key={key} className="flex items-center gap-2">
              <span 
                className="px-2 py-1 rounded-md border shadow-sm"
                style={{ backgroundColor: layer.bg, borderColor: layer.border, color: layer.text }}
              >
                {layer.label}
              </span>
              {index < arr.length - 1 && <span className="text-luma-500">➔</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content: Split Screen */}
      <div className="grid grid-cols-5 gap-6">
        {/* Left Panel: Scrolling Log */}
        <div className="col-span-2 border border-white/5 bg-luma-100/40 backdrop-blur-2xl rounded-lg flex flex-col max-h-[500px] shadow-xl overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
            <h3 className="text-xs font-bold text-luma-FFF tracking-widest uppercase">
              REQUEST_STREAM
            </h3>
            <span className="text-xs text-luma-500 font-mono tracking-widest uppercase">
              {logs.length} ENTRIES
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {logs.length > 0 ? logs.map((log, i) => (
              <div
                key={log.request_id || i}
                className={`p-3 border rounded-md shadow-sm transition-all text-sm backdrop-blur-md ${
                  !log.safe
                    ? 'bg-accent-gold border-accent-gold text-luma-000 animate-fade-in shadow-[0_0_15px_rgba(212,184,158,0.3)]'
                    : log.risk_score >= 0.35
                    ? 'bg-black/40 border-white/20 text-luma-FFF'
                    : 'bg-black/20 border-white/5 text-luma-500 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-mono tracking-widest uppercase ${!log.safe ? 'text-luma-000' : 'text-luma-500'}`}>
                    {formatTime(log.timestamp)}
                  </span>
                  <RiskBadge score={log.risk_score} isBlocked={!log.safe} size="sm" />
                </div>
                <div className="flex items-center gap-2">
                  {!log.safe ? (
                    <span className="text-xs font-mono font-bold tracking-widest uppercase">
                      {log.flagged_layer === 'context_policy'
                        ? `BLOCKED_POLICY · ${log.app_context || 'GENERAL'}`
                        : `BLOCKED_LAYER · ${log.flagged_layer || 'FIREWALL'} · ${log.attack_type || 'ATTACK'}`}
                    </span>
                  ) : (
                    log.attack_type && <AttackChip type={log.attack_type} />
                  )}
                  <span className={`text-xs font-mono ml-auto tracking-widest ${!log.safe ? 'text-luma-000' : 'text-luma-500'}`}>
                    {formatMs(log.processing_time_ms)}
                  </span>
                </div>
              </div>
            )) : (
              <div className="h-full flex items-center justify-center text-luma-500 text-sm">
                <div className="text-center font-mono uppercase tracking-widest">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs">AWAITING_TELEMETRY</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: D3 Live Graph */}
        <div className="col-span-3 border border-white/5 bg-luma-100/40 backdrop-blur-2xl rounded-lg p-4 shadow-xl">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
            <h3 className="text-xs font-bold text-luma-FFF tracking-widest uppercase">
              TOPOLOGY_GRAPH
            </h3>
            <div className="text-xs text-luma-500 font-mono tracking-widest uppercase bg-black/20 px-3 py-1 rounded-full border border-white/5">
              {events.length} EVENTS TRACKED
            </div>
          </div>
          <LiveGraph events={events} />
        </div>
      </div>

      {/* Live Stats Bar */}
      <div className="border border-white/5 bg-black/20 backdrop-blur-2xl rounded-lg p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <StatItem
              icon={Shield}
              label="SESSION_CALLS"
              value={formatNumber(sessionStats.total)}
              color="text-luma-500"
            />
            <StatItem
              icon={AlertTriangle}
              label="PAYLOADS_BLOCKED"
              value={formatNumber(sessionStats.blocked)}
              color="text-luma-FFF"
            />
            <StatItem
              icon={Zap}
              label="THREAT_RATE"
              value={`${blockRate}%`}
              color="text-accent-gold"
            />
          </div>
          {sessionStats.lastBlocked && (
            <div className="text-xs text-luma-500 font-mono tracking-widest uppercase">
              LAST_BLOCK:{' '}
              <span className="text-luma-FFF font-bold">
                {sessionStats.lastBlocked.replace(/_/g, ' ')}
              </span>{' '}
              <span className="text-luma-500">
                {timeAgo(sessionStats.lastBlockedTime)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Live Test Widget */}
      <LiveTestWidget />
    </div>
  );
}

function StatItem({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className={`w-5 h-5 ${color}`} strokeWidth={1.5} />
      <div>
        <div className="text-xs text-luma-500 font-mono tracking-widest uppercase">{label}</div>
        <div className="text-lg font-bold text-luma-FFF font-mono tracking-widest">{value}</div>
      </div>
    </div>
  );
}
