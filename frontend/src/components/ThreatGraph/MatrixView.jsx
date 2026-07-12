import { useMemo, useState } from 'react';
import { formatAttackType, getAttackColor } from '../../utils/formatters';

const FALLBACK_PALETTE = ['#F87171','#FBBF24','#34D399','#60A5FA','#A78BFA','#F472B6','#38BDF8','#4ADE80','#FB923C'];
const resolveColor = (t, i) => {
  const c = getAttackColor?.(t);
  return (c && c.toLowerCase() !== '#ffffff' && c.toLowerCase() !== 'white') ? c : FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
};

export default function MatrixView({ data }) {
  const [sortMode, setSortMode] = useState('cluster'); // cluster | traffic | alpha
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);

  const { attackTypes, keys, matrix, maxWeight, keyTotals } = useMemo(() => {
    if (!data?.length) return { attackTypes: [], keys: [], matrix: new Map(), maxWeight: 0, keyTotals: new Map() };

    const attackTypeSet = [...new Set(data.map(d => d.target))];
    const keyTotalsMap = new Map();
    const keyDominant = new Map();
    const cellMap = new Map();
    let max = 0;

    data.forEach(({ source, target, weight }) => {
      const cellKey = `${source}|${target}`;
      const cellW = (cellMap.get(cellKey) || 0) + weight;
      cellMap.set(cellKey, cellW);
      max = Math.max(max, cellW);

      keyTotalsMap.set(source, (keyTotalsMap.get(source) || 0) + weight);

      const dom = keyDominant.get(source);
      if (!dom || cellW > dom.weight) keyDominant.set(source, { type: target, weight: cellW });
    });

    let keyList = [...keyTotalsMap.keys()];
    const typeIndex = new Map(attackTypeSet.map((t, i) => [t, i]));

    if (sortMode === 'cluster') {
      keyList.sort((a, b) => {
        const da = typeIndex.get(keyDominant.get(a)?.type) ?? 999;
        const db = typeIndex.get(keyDominant.get(b)?.type) ?? 999;
        return da !== db ? da - db : keyTotalsMap.get(b) - keyTotalsMap.get(a);
      });
    } else if (sortMode === 'traffic') {
      keyList.sort((a, b) => keyTotalsMap.get(b) - keyTotalsMap.get(a));
    } else {
      keyList.sort((a, b) => a.localeCompare(b));
    }

    return { attackTypes: attackTypeSet, keys: keyList, matrix: cellMap, maxWeight: max, keyTotals: keyTotalsMap };
  }, [data, sortMode]);

  if (!data?.length) {
    return (
      <div className="h-full min-h-[400px] flex items-center justify-center text-luma-600 font-mono text-sm uppercase tracking-widest border border-white/5 rounded-xl bg-luma-100">
        No coordination data available
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-luma-100 rounded-xl overflow-hidden relative">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-luma-500">
          {keys.length} keys · {attackTypes.length} categories
        </span>
        <div className="flex items-center gap-1 bg-black/30 rounded-lg p-0.5 border border-white/5">
          {['cluster', 'traffic', 'alpha'].map(m => (
            <button
              key={m}
              onClick={() => setSortMode(m)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors ${
                sortMode === m ? 'bg-white/10 text-luma-100' : 'text-luma-500 hover:text-luma-300'
              }`}
            >
              {m === 'cluster' ? 'Grouped' : m === 'traffic' ? 'Traffic' : 'A–Z'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="inline-flex flex-col min-w-full">
          <div className="flex sticky top-0 z-10 bg-luma-100/95 backdrop-blur-sm border-b border-white/5">
            <div className="w-[140px] shrink-0" />
            {attackTypes.map((type, i) => (
              <div key={type} className="w-9 shrink-0 flex items-end justify-center pb-2" style={{ height: 96 }}>
                <span
                  className="text-[9px] font-mono uppercase tracking-wide whitespace-nowrap"
                  style={{ color: resolveColor(type, i), transform: 'rotate(-52deg) translateX(6px)', transformOrigin: 'left bottom' }}
                >
                  {formatAttackType(type)}
                </span>
              </div>
            ))}
          </div>

          {keys.map(key => {
            const total = keyTotals.get(key);
            return (
              <div
                key={key}
                className={`flex items-center border-b border-white/[0.03] cursor-pointer transition-colors ${
                  selectedKey === key ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
                }`}
                onClick={() => setSelectedKey(prev => prev === key ? null : key)}
              >
                <div className="w-[140px] shrink-0 pl-3 pr-2 py-1.5 flex justify-between items-center">
                  <span className="font-mono text-[10px] text-luma-400 truncate" title={key}>{key.length > 12 ? key.substring(0, 12) + '...' : key}</span>
                  <span className="ml-2 font-mono text-[9px] text-luma-600 shrink-0">{total}</span>
                </div>
                {attackTypes.map((type, i) => {
                  const weight = matrix.get(`${key}|${type}`) || 0;
                  const alpha = weight === 0 ? 0 : 0.15 + (weight / maxWeight) * 0.85;
                  const color = resolveColor(type, i);
                  const isHovered = hoveredCell === `${key}|${type}`;
                  return (
                    <div
                      key={type}
                      className="w-9 h-7 shrink-0 flex items-center justify-center relative"
                      onMouseEnter={(e) => { e.stopPropagation(); setHoveredCell(`${key}|${type}`); }}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {weight > 0 && (
                        <div
                          className="rounded-[3px] transition-all"
                          style={{ width: isHovered ? 24 : 20, height: isHovered ? 24 : 20, backgroundColor: color, opacity: alpha, boxShadow: isHovered ? `0 0 0 1px ${color}` : 'none' }}
                        />
                      )}
                      {isHovered && weight > 0 && (
                        <div className="absolute z-20 -top-7 left-1/2 -translate-x-1/2 bg-black border border-white/10 rounded px-1.5 py-0.5 text-[9px] font-mono text-luma-200 whitespace-nowrap pointer-events-none">
                          {weight} events
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-2 border-t border-white/5 text-[9px] font-mono text-luma-600 uppercase tracking-widest">
        Cell opacity = frequency · Rows grouped by dominant attack pattern
      </div>
    </div>
  );
}
