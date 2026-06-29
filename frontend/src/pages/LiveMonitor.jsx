import { useState, useEffect, useRef } from 'react';
import { Activity, Shield, AlertTriangle, Zap } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import LiveGraph from '../components/LiveGraph';
import LiveTestWidget from '../components/LiveTestWidget';
import RiskBadge from '../components/RiskBadge';
import AttackChip from '../components/AttackChip';
import { formatTime, formatMs, formatNumber, timeAgo } from '../utils/formatters';

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

  const logs = logsData?.logs || [];
  if (logsData) console.log('[monitor] poll →', { total: logsData.total, count: logs.length });

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
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-light text-luma-FFF font-sans tracking-widest uppercase">
            Live <span className="font-bold text-accent-gold tracking-widest">Monitor</span>
          </h1>
          <p className="text-luma-500 mt-1 font-mono text-sm tracking-widest uppercase">Real-time telemetry stream</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 border border-luma-500 bg-luma-100">
          <div className="w-2 h-2 bg-[#10B981] animate-flicker" style={{ boxShadow: '0 0 8px #10B981' }} />
          <span className="text-xs font-mono tracking-widest uppercase text-luma-FFF">Sys_Status: Active</span>
        </div>
      </div>

      {/* 6-Layer Status Bar */}
      <div className="p-4 flex flex-wrap justify-between items-center gap-3 border border-luma-300 bg-luma-100">
        <span className="text-xs font-bold text-luma-500 uppercase tracking-widest">Active Pipeline Layers:</span>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono font-bold tracking-widest uppercase">
          <span className="px-2 py-0.5 border border-[#52495c] text-[#D1C4E9] bg-[#3a3242]">CANARY</span>
          <span className="text-luma-500">➔</span>
          <span className="px-2 py-0.5 border border-[#5c3e3e] text-[#FFCDD2] bg-[#3a2727]">RULE-BASED</span>
          <span className="text-luma-500">➔</span>
          <span className="px-2 py-0.5 border border-[#5c503e] text-[#FFE0B2] bg-[#3a3227]">HEURISTIC</span>
          <span className="text-luma-500">➔</span>
          <span className="px-2 py-0.5 border border-[#5c563e] text-[#FFF9C4] bg-[#3a3627]">EMBEDDING</span>
          <span className="text-luma-500">➔</span>
          <span className="px-2 py-0.5 border border-[#324a3e] text-[#A5D6A7] bg-[#25352c]">OPENAI</span>
          <span className="text-luma-500">➔</span>
          <span className="px-2 py-0.5 border border-[#3e4d5c] text-[#B3E5FC] bg-[#27313a]">ML</span>
          <span className="text-luma-500">➔</span>
          <span className="px-2 py-0.5 border border-[#5c3e45] text-[#F8BBD0] bg-[#3a272b]">CONTEXT POLICY</span>
        </div>
      </div>

      {/* Main Content: Split Screen */}
      <div className="grid grid-cols-5 gap-6">
        {/* Left Panel: Scrolling Log */}
        <div className="col-span-2 border border-luma-300 bg-luma-000 flex flex-col max-h-[500px]">
          <div className="p-4 border-b border-luma-300 flex items-center justify-between bg-luma-100">
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
                className={`p-3 border transition-all text-sm ${
                  !log.safe
                    ? 'bg-accent-gold border-accent-gold text-luma-000 animate-fade-in'
                    : log.risk_score >= 0.35
                    ? 'bg-luma-100 border-luma-500 text-luma-FFF'
                    : 'bg-luma-000 border-luma-300 text-luma-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-mono tracking-widest uppercase ${!log.safe ? 'text-luma-000' : 'text-luma-500'}`}>
                    {formatTime(log.timestamp)}
                  </span>
                  <RiskBadge score={log.risk_score} size="sm" />
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
        <div className="col-span-3 border border-luma-300 bg-luma-000 p-4">
          <div className="flex items-center justify-between mb-4 border-b border-luma-300 pb-2">
            <h3 className="text-xs font-bold text-luma-FFF tracking-widest uppercase">
              TOPOLOGY_GRAPH
            </h3>
            <div className="text-xs text-luma-500 font-mono tracking-widest uppercase">
              {events.length} EVENTS TRACKED
            </div>
          </div>
          <LiveGraph events={events} />
        </div>
      </div>

      {/* Live Stats Bar */}
      <div className="border border-luma-300 bg-luma-100 p-4">
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
