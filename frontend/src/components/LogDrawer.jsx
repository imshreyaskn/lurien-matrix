import { X } from 'lucide-react';
import LayerBreakdown from './LayerBreakdown';
import RiskBadge from './RiskBadge';
import AttackChip from './AttackChip';
import { formatDateTime, formatMs } from '../utils/formatters';

/**
 * Slide-out drawer showing full log detail.
 */
export default function LogDrawer({ log, onClose }) {
  if (!log) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full md:w-[500px] bg-luma-000 border-l border-luma-300 z-50 animate-slide-in overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-luma-000 border-b border-luma-300 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold tracking-widest text-luma-FFF uppercase">PAYLOAD TELEMETRY</h2>
            <p className="text-xs font-mono text-luma-500 mt-0.5 tracking-widest uppercase">
              {log.request_id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 border border-transparent hover:border-luma-500 hover:bg-luma-100 text-luma-500 hover:text-luma-FFF transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Status & Score */}
          <div className="flex items-center gap-3">
            <RiskBadge score={log.risk_score} isBlocked={!log.safe} size="lg" />
            {log.attack_type && <AttackChip type={log.attack_type} />}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <MetaItem label="TIMESTAMP" value={formatDateTime(log.timestamp)} />
            <MetaItem label="LATENCY" value={formatMs(log.processing_time_ms)} />
            <MetaItem label="NODE" value={log.provider || 'DIRECT_INJECTION'} />
            <MetaItem label="MODEL" value={log.model || '—'} />
            <MetaItem label="TRIPPED_LAYER" value={log.flagged_layer || '—'} />
            <MetaItem label="CONFIDENCE" value={log.confidence ? `${(log.confidence * 100).toFixed(1)}%` : '—'} />
          </div>

          {/* Flagged Pattern */}
          {log.flagged_pattern && (
            <div>
              <h3 className="text-xs font-bold text-luma-700 uppercase tracking-widest mb-2">
                FLAGGED SIGNATURE
              </h3>
              <div className="bg-luma-000 border border-luma-FFF p-3">
                <code className="text-xs text-luma-FFF font-mono tracking-widest uppercase break-all">
                  {log.flagged_pattern}
                </code>
              </div>
            </div>
          )}

          {/* Layer Breakdown */}
          <div>
            <h3 className="text-xs font-bold text-luma-700 uppercase tracking-widest mb-3">
              PIPELINE TRACE
            </h3>
            <LayerBreakdown layers={log.layers} />
          </div>

          {/* Heuristic Signals */}
          {log.layers?.heuristic?.signals && (
            <div>
              <h3 className="text-xs font-bold text-luma-700 uppercase tracking-widest mb-3">
                HEURISTIC VECTORS
              </h3>
              <div className="space-y-2">
                {Object.entries(log.layers.heuristic.signals).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-luma-500 font-mono tracking-widest uppercase w-40 truncate">
                      {key.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 h-1 bg-luma-100 overflow-hidden border border-luma-300">
                      <div
                        className="h-full transition-all duration-500 bg-luma-FFF"
                        style={{ width: `${(val * 100).toFixed(0)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-luma-FFF tracking-widest w-12 text-right">
                      {(val * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ML Scores */}
          {log.layers?.ml_classifier?.all_scores && (
            <div>
              <h3 className="text-xs font-bold text-luma-700 uppercase tracking-widest mb-3">
                CLASSIFIER TENSORS
              </h3>
              <div className="space-y-2">
                {Object.entries(log.layers.ml_classifier.all_scores)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cls, score]) => (
                    <div key={cls} className="flex items-center gap-3">
                      <span className="text-xs text-luma-500 font-mono tracking-widest uppercase w-32 truncate">{cls}</span>
                      <div className="flex-1 h-1 bg-luma-100 overflow-hidden border border-luma-300">
                        <div
                          className="h-full bg-luma-FFF transition-all duration-500"
                          style={{ width: `${(score * 100).toFixed(0)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono font-bold text-luma-FFF tracking-widest w-12 text-right">
                        {(score * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Prompt Hash */}
          <div>
            <h3 className="text-xs font-bold text-luma-700 uppercase tracking-widest mb-2">
              PAYLOAD CHECKSUM (SHA-256)
            </h3>
            <code className="text-xs text-luma-500 font-mono break-all uppercase tracking-widest">
              {log.prompt_hash || '—'}
            </code>
          </div>
        </div>
      </div>
    </>
  );
}

function MetaItem({ label, value }) {
  return (
    <div className="bg-luma-100 p-3 border border-luma-300">
      <div className="text-xs font-bold text-luma-500 tracking-widest uppercase mb-1">{label}</div>
      <div className="text-xs font-mono font-bold text-luma-FFF uppercase truncate tracking-widest">{value}</div>
    </div>
  );
}
