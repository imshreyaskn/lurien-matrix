import { useState } from 'react';
import MatrixView from './MatrixView';
import NetworkView from './NetworkView';
import ErrorBoundary from '../Layout/ErrorBoundary';

export default function ThreatCoordinationGraph({ data }) {
  const [view, setView] = useState('matrix');
  return (
    <div className="w-full h-full flex flex-col gap-2 relative">
      <div className="absolute top-0 right-4 z-20 flex justify-end">
        <div className="flex items-center gap-1 bg-black/30 rounded-lg p-0.5 border border-white/5 backdrop-blur-sm">
          {['matrix', 'network'].map(v => (
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
          {view === 'matrix' ? <MatrixView data={data} /> : <NetworkView data={data} />}
        </ErrorBoundary>
      </div>
    </div>
  );
}
