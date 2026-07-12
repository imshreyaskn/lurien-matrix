import { useState } from 'react';
import { Network, Activity, Search, ShieldAlert, Key, Clock, AlertTriangle } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import { formatAttackType, timeAgo } from '../utils/formatters';
import ErrorBoundary from '../components/ErrorBoundary';

// Subcomponents
import VelocityChart from '../components/ThreatGraph/VelocityChart';
import ThreatForceGraph from '../components/ThreatGraph/ForceGraph';
import SessionDrawer from '../components/ThreatGraph/SessionDrawer';

export default function ThreatGraph() {
  const [selectedSession, setSelectedSession] = useState(null);

  // Poll multiple endpoints
  const { data: statsRes, loading: statsLoading } = usePolling(() => api.getGraphStats(), 30000);
  const { data: velocityRes } = usePolling(() => api.getThreatVelocity(), 30000);
  const { data: chainsRes } = usePolling(() => api.getSessionChains(), 30000);

  const isOffline = statsRes?.status === 'graph_offline';
  const data = statsRes?.data || { force_graph: [], layer_bypass: [], top_replayed: [], api_key_breakdown: [] };
  const velocityData = velocityRes?.data || [];
  const sessions = chainsRes?.data || [];

  const totalCampaigns = data.force_graph.reduce((acc, curr) => acc + curr.weight, 0);
  const replayedHashes = data.top_replayed.length;
  const bypasses = data.layer_bypass.reduce((acc, curr) => acc + curr.caught_by_ml_only, 0);
  const providersTargeted = data.api_key_breakdown.length;

  return (
    <div className="space-y-8 pb-32">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-light tracking-tight text-white mb-2">
            Threat <span className="text-accent-gold font-serif italic">Intelligence</span>
          </h1>
          <p className="text-luma-400">SOC Dashboard: Coordinated attacks, session chains, and API Key behavior.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-luma-100 border border-white/5 rounded-lg text-xs font-mono text-luma-400">
            <div className={`w-2 h-2 rounded-full ${isOffline ? 'bg-firewall-red' : 'bg-firewall-green animate-pulse'}`} />
            {isOffline ? 'GRAPH OFFLINE' : 'LIVE SYNC'}
          </div>
        </div>
      </div>

      {isOffline && (
        <div className="bg-firewall-red/10 border border-firewall-red/20 rounded-xl p-4 flex items-center gap-4">
          <AlertTriangle className="w-6 h-6 text-firewall-red" />
          <p className="text-sm font-medium text-white">Graph Intelligence Offline. Core MongoDB stats and session chains are still available.</p>
        </div>
      )}

      {/* Zone 1: Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <StatCard label="Threat Triggers" value={totalCampaigns} />
        <StatCard label="Replayed Hashes" value={replayedHashes} />
        <StatCard label="ML-Only Bypasses" value={bypasses} />
        <StatCard label="Targeted Apps" value={providersTargeted} />
      </div>

      {/* Zone 2: Velocity Chart */}
      <ErrorBoundary>
        <VelocityChart data={velocityData} />
      </ErrorBoundary>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Zone 3: Force Graph (7 cols) */}
        {!isOffline && (
          <div className="xl:col-span-7 bg-luma-100 border border-white/5 rounded-xl p-6 relative">
            <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
              <Network className="w-4 h-4 text-accent-gold" />
              Coordination Intelligence (Key → Attack)
            </h2>
            <ErrorBoundary>
              <ThreatForceGraph data={data.force_graph} />
            </ErrorBoundary>
          </div>
        )}

        {/* Zone 4: API Key Breakdown (5 cols) */}
        {!isOffline && (
          <div className="xl:col-span-5 bg-luma-100 border border-white/5 rounded-xl p-6 flex flex-col">
            <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
              <Key className="w-4 h-4 text-accent-gold" />
              App Targeting Breakdown
            </h2>
            <div className="flex-1 overflow-y-auto pr-2">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] text-luma-500 font-mono tracking-wider">
                    <th className="pb-3 font-normal">API KEY</th>
                    <th className="pb-3 font-normal">TOP THREAT</th>
                    <th className="pb-3 font-normal text-right">COUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {data.api_key_breakdown.length === 0 ? (
                    <tr><td colSpan="3" className="py-4 text-center text-luma-600 font-mono text-xs">No threats detected.</td></tr>
                  ) : (
                    data.api_key_breakdown.map((item, idx) => (
                      <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors group cursor-default">
                        <td className="py-3 font-mono text-xs text-white truncate max-w-[100px]">{item.key_id.substring(0, 10)}...</td>
                        <td className="py-3 font-mono text-xs text-firewall-red">{formatAttackType(item.attack_type)}</td>
                        <td className="py-3 font-mono text-xs text-luma-300 text-right">{item.attack_count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Zone 5: Session Chains */}
      <div className="bg-luma-100 border border-white/5 rounded-xl p-6">
        <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
          <Clock className="w-4 h-4 text-accent-gold" />
          High-Risk Session Chains
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-[10px] text-luma-500 font-mono tracking-wider">
                <th className="pb-3 font-normal">SESSION ID</th>
                <th className="pb-3 font-normal text-center">THREAT SCORE</th>
                <th className="pb-3 font-normal text-center">BLOCKED / TOTAL</th>
                <th className="pb-3 font-normal text-right">LAST SEEN</th>
                <th className="pb-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan="5" className="py-8 text-center text-luma-600 font-mono text-sm uppercase tracking-widest">No Active Sessions</td></tr>
              ) : (
                sessions.map((sess) => (
                  <tr 
                    key={sess.session_id} 
                    className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                    onClick={() => setSelectedSession(sess)}
                  >
                    <td className="py-4 font-mono text-sm text-white group-hover:text-accent-gold transition-colors">{sess.session_id.substring(0, 12)}...</td>
                    <td className="py-4 font-mono text-sm text-center">
                      <span className={`px-2 py-1 rounded ${sess.threat_score > 0.5 ? 'bg-firewall-red/20 text-firewall-red' : 'bg-firewall-yellow/20 text-firewall-yellow'}`}>
                        {(sess.threat_score * 100).toFixed(1)}
                      </span>
                    </td>
                    <td className="py-4 font-mono text-sm text-luma-300 text-center">
                      <span className="text-white">{sess.blocked_count}</span> / {sess.total_requests}
                    </td>
                    <td className="py-4 font-mono text-sm text-luma-400 text-right">
                      {timeAgo(sess.events[sess.events.length - 1].timestamp)}
                    </td>
                    <td className="py-4 text-right pr-4">
                      <div className="text-xs font-mono text-luma-500 group-hover:text-white transition-colors flex items-center justify-end gap-1">
                        VIEW TIMELINE <Network className="w-3 h-3" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zones 6 & 7: Tables */}
      {!isOffline && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-luma-100 border border-white/5 rounded-xl p-6">
            <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-accent-gold" />
              Layer Bypass Patterns
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] text-luma-500 font-mono tracking-wider">
                    <th className="pb-3 font-normal">ATTACK TYPE</th>
                    <th className="pb-3 font-normal text-right">CAUGHT BY ML ONLY</th>
                  </tr>
                </thead>
                <tbody>
                  {data.layer_bypass.length === 0 ? (
                    <tr><td colSpan="2" className="py-4 text-center text-luma-600 font-mono text-xs">No bypasses detected.</td></tr>
                  ) : (
                    data.layer_bypass.map((item, idx) => (
                      <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 font-mono text-sm text-luma-300">{formatAttackType(item.attack_type)}</td>
                        <td className="py-3 font-mono text-sm text-firewall-red text-right">{item.caught_by_ml_only}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-luma-100 border border-white/5 rounded-xl p-6">
            <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
              <Search className="w-4 h-4 text-accent-gold" />
              Top Replayed Hashes
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] text-luma-500 font-mono tracking-wider">
                    <th className="pb-3 font-normal">HASH</th>
                    <th className="pb-3 font-normal">ATTACK TYPE</th>
                    <th className="pb-3 font-normal text-right">TIMES SEEN</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_replayed.length === 0 ? (
                    <tr><td colSpan="3" className="py-4 text-center text-luma-600 font-mono text-xs">No replays detected.</td></tr>
                  ) : (
                    data.top_replayed.map((item, idx) => (
                      <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="py-3 font-mono text-sm text-luma-300 truncate max-w-[150px]">{item.hash}</td>
                        <td className="py-3 font-mono text-xs text-luma-400">{formatAttackType(item.attack_type)}</td>
                        <td className="py-3 font-mono text-sm text-white text-right">{item.times_seen}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Drawers */}
      <SessionDrawer 
        session={selectedSession} 
        onClose={() => setSelectedSession(null)} 
      />
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-luma-100 border border-white/5 p-6 rounded-xl relative overflow-hidden group">
      <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="text-xs font-mono text-luma-500 mb-2 uppercase tracking-widest">{label}</div>
      <div className="text-4xl font-light text-white font-mono">{value}</div>
    </div>
  );
}
