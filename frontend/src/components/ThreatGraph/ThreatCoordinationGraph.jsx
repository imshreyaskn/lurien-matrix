import { useState } from 'react';
import MatrixView from './MatrixView';
import ThreatFlowDiagram from './ThreatFlowDiagram';
import ErrorBoundary from '../ErrorBoundary';

export default function ThreatCoordinationGraph({ data, flowData, replayCounts }) {
  const [view, setView] = useState('pipeline');
  return (
    <div className="w-full h-full flex flex-col gap-2 relative">
      <div className="absolute -top-11 right-6 z-20 flex justify-end">
        <div className="flex items-center gap-1 bg-black/40 rounded-lg p-0.5 border border-white/10 backdrop-blur-sm">
          {['pipeline', 'matrix'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors ${
                view === v ? 'bg-white/10 text-luma-100' : 'text-luma-500 hover:text-luma-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 w-full h-full relative">
        <ErrorBoundary>
          {view === 'pipeline' ? (
            <ThreatFlowDiagram data={flowData} replayCounts={replayCounts} />
          ) : (
            <MatrixView data={data} />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
