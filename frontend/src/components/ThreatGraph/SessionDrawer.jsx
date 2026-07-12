import { X } from 'lucide-react';
import { formatTime, formatAttackType, getRiskBg, getRiskColor, getAttackColor } from '../../utils/formatters';

export default function SessionDrawer({ session, onClose }) {
  if (!session) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="relative w-full max-w-lg bg-luma-000 border-l border-white/10 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-luma-100">
          <div>
            <h2 className="text-lg font-light text-white mb-1">Session Timeline</h2>
            <p className="text-xs font-mono text-luma-400">
              ID: {session.session_id.substring(0, 12)}...
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-luma-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-8 grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-lg p-4">
              <div className="text-[10px] text-luma-500 font-mono uppercase mb-1">Threat Score</div>
              <div className="text-2xl font-mono text-firewall-red">
                {(session.threat_score * 100).toFixed(1)}
              </div>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <div className="text-[10px] text-luma-500 font-mono uppercase mb-1">Blocked / Total</div>
              <div className="text-2xl font-mono text-white">
                {session.blocked_count} <span className="text-luma-500 text-lg">/ {session.total_requests}</span>
              </div>
            </div>
          </div>

          <h3 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6">
            Event Sequence
          </h3>

          <div className="relative border-l-2 border-white/10 ml-3 space-y-6 pb-6">
            {session.events.map((ev, idx) => (
              <div key={idx} className="relative pl-6">
                {/* Timeline Dot */}
                <div 
                  className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-4 border-luma-000`}
                  style={{ backgroundColor: ev.safe ? '#4ADE80' : getAttackColor(ev.attack_type) }}
                />
                
                <div className="bg-white/5 border border-white/5 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono text-luma-400">
                      {formatTime(ev.timestamp)}
                    </span>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${getRiskBg(ev.risk_score, !ev.safe)}`}>
                      {ev.safe ? 'PASSED' : 'BLOCKED'}
                    </span>
                  </div>
                  
                  {!ev.safe ? (
                    <>
                      <div className="text-sm font-medium text-white mb-1">
                        {formatAttackType(ev.attack_type)}
                      </div>
                      <div className="text-xs text-luma-400 font-mono">
                        Caught by: <span className="text-luma-200">{ev.flagged_layer}</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-luma-300">
                      Safe request processed.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
      </div>
    </div>
  );
}
