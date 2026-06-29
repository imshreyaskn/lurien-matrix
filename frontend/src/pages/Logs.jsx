import { useState, useEffect } from 'react';
import { FileText, Filter, Download, ArrowLeft, ArrowRight, Eye, RefreshCw } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import RiskBadge from '../components/RiskBadge';
import AttackChip from '../components/AttackChip';
import LogDrawer from '../components/LogDrawer';
import { formatDateTime, formatMs, truncate } from '../utils/formatters';

export default function Logs() {
  const [selectedLog, setSelectedLog] = useState(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [attackType, setAttackType] = useState('');
  const [flaggedLayer, setFlaggedLayer] = useState('');
  
  // Custom refresh trigger
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchLogs = () => {
    return api.getLogs({
      page,
      limit,
      flagged_only: flaggedOnly || undefined,
      blocked_only: blockedOnly || undefined,
      attack_type: attackType || undefined,
      flagged_layer: flaggedLayer || undefined,
    });
  };

  const { data, loading, refresh } = usePolling(fetchLogs, 10000, true);

  // Trigger reload on filter/page change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      refresh();
    }, 300); // 300ms debounce
    return () => clearTimeout(timer);
  }, [page, flaggedOnly, blockedOnly, attackType, flaggedLayer, refreshTrigger, refresh]);

  const logs = data?.logs || [];
  const total = data?.total || 0;
  const pages = data?.pages || 1;

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    
    const headers = ['Request ID', 'Timestamp', 'Safe', 'Risk Score', 'Attack Type', 'Confidence', 'Provider', 'Model', 'Blocked', 'Latency (ms)'];
    const rows = logs.map(l => [
      escapeCSV(l.request_id),
      escapeCSV(l.timestamp),
      escapeCSV(l.safe),
      escapeCSV(l.risk_score),
      escapeCSV(l.attack_type || 'none'),
      escapeCSV(l.confidence || 0),
      escapeCSV(l.provider || 'direct'),
      escapeCSV(l.model || 'none'),
      escapeCSV(l.blocked),
      escapeCSV(l.processing_time_ms)
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.map(escapeCSV).join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `llm_firewall_logs_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-light text-luma-FFF font-sans tracking-widest uppercase">
            Firewall <span className="font-bold text-accent-gold tracking-widest">Logs</span>
          </h1>
          <p className="text-luma-500 mt-1 font-mono text-sm tracking-widest uppercase">Audit trail of all processed payloads</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefreshTrigger(p => p + 1)}
            className="p-2.5 border border-luma-300 bg-luma-000 text-luma-700 hover:text-luma-FFF hover:bg-luma-100 transition-colors"
            title="Refresh logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExportCSV}
            disabled={logs.length === 0}
            className="px-4 py-2.5 bg-accent-gold text-luma-000 border border-accent-gold text-sm font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-accent-gold/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            EXPORT CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="border border-luma-300 bg-luma-000 p-4 grid grid-cols-5 gap-4 items-center">
        <div>
          <label className="text-xs text-luma-500 font-mono tracking-widest uppercase mb-1 block">Vector Class</label>
          <select
            value={attackType}
            onChange={(e) => { setAttackType(e.target.value); setPage(1); }}
            className="w-full bg-luma-000 border border-luma-300 px-3 py-2 text-sm font-mono text-luma-FFF focus:outline-none focus:border-luma-700 uppercase tracking-widest"
          >
            <option value="">ALL VECTORS</option>
            <option value="DIRECT_INJECTION">DIRECT INJECTION</option>
            <option value="PERSONA_HIJACKING">PERSONA HIJACKING</option>
            <option value="SYSTEM_OVERRIDE">SYSTEM OVERRIDE</option>
            <option value="PROMPT_EXTRACTION">PROMPT EXTRACTION</option>
            <option value="ENCODING_ATTACKS">ENCODING ATTACKS</option>
            <option value="MANY_SHOT">MANY SHOT</option>
            <option value="jailbreak_paraphrase">JAILBREAK (SEMANTIC)</option>
            <option value="injection">ML INJECTION</option>
            <option value="out_of_scope">OUT OF SCOPE</option>
            <option value="heuristic_composite">HEURISTIC ANOMALY</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-luma-500 font-mono tracking-widest uppercase mb-1 block">Tripped Layer</label>
          <select
            value={flaggedLayer}
            onChange={(e) => { setFlaggedLayer(e.target.value); setPage(1); }}
            className="w-full bg-luma-000 border border-luma-300 px-3 py-2 text-sm font-mono text-luma-FFF focus:outline-none focus:border-luma-700 uppercase tracking-widest"
          >
            <option value="">ALL LAYERS</option>
            <option value="canary">L0 CANARY</option>
            <option value="rule_based">L1 RULE-BASED</option>
            <option value="heuristic">L2 HEURISTIC</option>
            <option value="embedding_similarity">L3 EMBEDDING</option>
            <option value="ml_classifier">L4 ML CLASSIFIER</option>
            <option value="context_policy">L5 CONTEXT POLICY</option>
          </select>
        </div>

        <div className="flex gap-4 pt-4 col-span-2">
          <label className="flex items-center gap-2 text-xs text-luma-500 font-mono tracking-widest uppercase cursor-pointer">
            <input
              type="checkbox"
              checked={flaggedOnly}
              onChange={(e) => { setFlaggedOnly(e.target.checked); setPage(1); }}
              className="bg-luma-000 border-luma-300 text-luma-FFF focus:ring-luma-700"
            />
            FLAGGED ONLY
          </label>
          <label className="flex items-center gap-2 text-xs text-luma-500 font-mono tracking-widest uppercase cursor-pointer">
            <input
              type="checkbox"
              checked={blockedOnly}
              onChange={(e) => { setBlockedOnly(e.target.checked); setPage(1); }}
              className="bg-luma-000 border-luma-300 text-luma-FFF focus:ring-luma-700"
            />
            BLOCKED ONLY
          </label>
        </div>
      </div>

      {/* Logs Table */}
      <div className="border border-luma-300 bg-luma-000 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-luma-100 border-b border-luma-300 text-xs font-bold text-luma-500 tracking-widest uppercase font-mono">
                <th className="p-4 w-28">TIMESTAMP</th>
                <th className="p-4">REQUEST_ID</th>
                <th className="p-4 w-24">STATUS</th>
                <th className="p-4 w-24">RISK</th>
                <th className="p-4">VECTOR</th>
                <th className="p-4 w-24">LAYER</th>
                <th className="p-4 w-24">LATENCY</th>
                <th className="p-4 w-16">VIEW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-luma-300 text-xs font-mono tracking-widest uppercase">
              {logs.map((log) => (
                <tr
                  key={log.request_id}
                  className={`hover:bg-luma-100 transition-colors ${
                    !log.safe ? 'text-luma-FFF' : 'text-luma-500'
                  }`}
                >
                  <td className="p-4 text-xs font-mono">
                    {formatDateTime(log.timestamp)}
                  </td>
                  <td className="p-4 font-mono text-xs">
                    {truncate(log.request_id, 18)}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-bold border ${
                      log.safe 
                        ? 'border-luma-500 text-luma-500'
                        : 'bg-accent-gold text-luma-000 border-accent-gold animate-flicker'
                    }`}>
                      {log.safe ? 'SAFE' : 'BLOCKED'}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-xs">
                    {(log.risk_score * 100).toFixed(1)}%
                  </td>
                  <td className="p-4">
                    {log.attack_type ? <AttackChip type={log.attack_type} /> : '—'}
                  </td>
                  <td className="p-4 text-xs font-mono">
                    {log.flagged_layer || '—'}
                  </td>
                  <td className="p-4 font-mono text-xs">
                    {formatMs(log.processing_time_ms)}
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="p-1 hover:bg-luma-300 text-luma-700 hover:text-luma-FFF transition-colors border border-transparent hover:border-luma-500"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-luma-500 tracking-widest">
                    NO INGRESS LOGS DETECTED
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="p-4 border-t border-luma-300 flex items-center justify-between">
            <span className="text-xs text-luma-500 font-mono tracking-widest uppercase">
              PAGE {page} OF {pages} ({total} SIGNALS)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="p-2 border border-luma-300 bg-luma-000 text-luma-700 hover:text-luma-FFF disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(p + 1, pages))}
                disabled={page === pages}
                className="p-2 border border-luma-300 bg-luma-000 text-luma-700 hover:text-luma-FFF disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
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
