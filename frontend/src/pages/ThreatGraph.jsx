import { useState } from 'react';
import { Network, Activity, Search, ShieldAlert, Key, Clock, AlertTriangle } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import { formatAttackType, timeAgo } from '../utils/formatters';
import ErrorBoundary from '../components/ErrorBoundary';

// Subcomponents
import VelocityChart from '../components/ThreatGraph/VelocityChart';
import ThreatCoordinationGraph from '../components/ThreatGraph/ThreatCoordinationGraph';
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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column: Graph and Velocity (9 cols) */}
        <div className="xl:col-span-9 flex flex-col gap-6">
          
          {/* Main Visual: Force Graph */}
          {!isOffline && (
            <div className="relative flex-1 flex flex-col min-h-[600px] xl:min-h-[calc(100vh-400px)] w-full">
              <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2 px-6 pt-6">
                <Network className="w-4 h-4 text-accent-gold" />
                Coordination Intelligence (Key → Attack)
              </h2>
              <div className="flex-1 w-full relative">
                <ErrorBoundary>
                  <ThreatCoordinationGraph data={data.force_graph} />
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* Velocity Chart */}
          <ErrorBoundary>
            <VelocityChart data={velocityData} />
          </ErrorBoundary>

        </div>

        {/* Right Column: History and Tables (3 cols) */}
        <div className="xl:col-span-3 flex flex-col gap-6">
          
          {/* Session Chains */}
          <div className="bg-luma-100 border border-white/5 rounded-xl p-6 flex flex-col max-h-[400px]">
            <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-4 flex items-center gap-2 shrink-0">
              <Clock className="w-4 h-4 text-accent-gold" />
              High-Risk Session Chains
            </h2>
            <div className="flex-1 overflow-y-auto pr-2">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] text-luma-500 font-mono tracking-wider">
                    <th className="pb-2 font-normal">SESSION</th>
                    <th className="pb-2 font-normal text-right">SCORE</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr><td colSpan="2" className="py-4 text-center text-luma-600 font-mono text-xs uppercase">No Active Sessions</td></tr>
                  ) : (
                    sessions.map((sess) => (
                      <tr 
                        key={sess.session_id} 
                        className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer group"
                        onClick={() => setSelectedSession(sess)}
                      >
                        <td className="py-3 font-mono text-xs text-white group-hover:text-accent-gold transition-colors">
                          {sess.session_id.substring(0, 8)}...
                        </td>
                        <td className="py-3 font-mono text-xs text-right">
                          <span className={`px-2 py-0.5 rounded ${sess.threat_score > 0.5 ? 'bg-firewall-red/20 text-firewall-red' : 'bg-firewall-yellow/20 text-firewall-yellow'}`}>
                            {(sess.threat_score * 100).toFixed(0)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* API Key Breakdown */}
          {!isOffline && (
            <div className="bg-luma-100 border border-white/5 rounded-xl p-6 flex flex-col max-h-[300px]">
              <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-4 flex items-center gap-2 shrink-0">
                <Key className="w-4 h-4 text-accent-gold" />
                App Targeting Breakdown
              </h2>
              <div className="flex-1 overflow-y-auto pr-2">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] text-luma-500 font-mono tracking-wider">
                      <th className="pb-2 font-normal">API KEY</th>
                      <th className="pb-2 font-normal text-right">COUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.api_key_breakdown.length === 0 ? (
                      <tr><td colSpan="2" className="py-4 text-center text-luma-600 font-mono text-xs">No threats detected.</td></tr>
                    ) : (
                      data.api_key_breakdown.map((item, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors group cursor-default">
                          <td className="py-2 font-mono text-xs text-white truncate max-w-[120px]">{item.key_id.substring(0, 8)}...</td>
                          <td className="py-2 font-mono text-xs text-luma-300 text-right">{item.attack_count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Layer Bypass Patterns */}
          {!isOffline && (
            <div className="bg-luma-100 border border-white/5 rounded-xl p-6 flex flex-col max-h-[300px]">
              <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-4 flex items-center gap-2 shrink-0">
                <ShieldAlert className="w-4 h-4 text-accent-gold" />
                Layer Bypass Patterns
              </h2>
              <div className="flex-1 overflow-y-auto pr-2">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] text-luma-500 font-mono tracking-wider">
                      <th className="pb-2 font-normal">ATTACK TYPE</th>
                      <th className="pb-2 font-normal text-right">ML ONLY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.layer_bypass.length === 0 ? (
                      <tr><td colSpan="2" className="py-4 text-center text-luma-600 font-mono text-xs">No bypasses detected.</td></tr>
                    ) : (
                      data.layer_bypass.map((item, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-2 font-mono text-[10px] text-luma-300">{formatAttackType(item.attack_type)}</td>
                          <td className="py-2 font-mono text-[10px] text-firewall-red text-right">{item.caught_by_ml_only}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>

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
