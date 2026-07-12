import { useMemo, useState, useEffect, useRef } from 'react';
import { formatAttackType, getAttackColor } from '../../utils/formatters';

const FALLBACK_PALETTE = ['#F87171','#FBBF24','#34D399','#60A5FA','#A78BFA','#F472B6','#38BDF8','#4ADE80','#FB923C'];
const resolveColor = (t, i) => {
  let c = getAttackColor?.(t);
  if (c && typeof c === 'object') c = c.text || c.border;
  return (c && typeof c === 'string' && c.toLowerCase() !== '#ffffff' && c.toLowerCase() !== 'white') ? c : FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
};

export default function NetworkView({ data }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [activeHub, setActiveHub] = useState(null);
  const [activeKey, setActiveKey] = useState(null);

  // Handle Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const updateDimensions = () => {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight
      });
    };
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(containerRef.current);
    updateDimensions();
    const timeoutId = setTimeout(updateDimensions, 100);
    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  const { width, height } = dimensions;
  const cx = width / 2;
  const cy = height / 2;
  // Increase hubR to push nodes outward
  const hubR = Math.min(width, height) * 0.38;

  const layout = useMemo(() => {
    if (!data?.length) return null;
    const attackTypes = [...new Set(data.map(d => d.target))];
    const hubAngle = new Map(attackTypes.map((t, i) => [t, (i / attackTypes.length) * 2 * Math.PI - Math.PI / 2]));

    const agg = new Map();
    data.forEach(({ source, target, weight }) => {
      if (!agg.has(source)) agg.set(source, { vx: 0, vy: 0, total: 0, hubs: new Set() });
      const a = hubAngle.get(target);
      const k = agg.get(source);
      k.vx += Math.cos(a) * weight;
      k.vy += Math.sin(a) * weight;
      k.total += weight;
      k.hubs.add(target);
    });

    let keyList = [...agg.entries()].map(([id, k]) => ({
      id, total: k.total, hubCount: k.hubs.size, hubs: k.hubs, angle: Math.atan2(k.vy, k.vx),
    }));

    // Deterministic de-overlap within 5° angular buckets, largest key first
    const BUCKET = (Math.PI * 2) / 72;
    const buckets = new Map();
    keyList.forEach(k => {
      const b = Math.round(k.angle / BUCKET);
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b).push(k);
    });
    buckets.forEach(list => {
      list.sort((a, b) => b.total - a.total);
      list.forEach((k, i) => { k.angle += (i - (list.length - 1) / 2) * BUCKET * 0.7; });
    });

    const maxTotal = Math.max(...keyList.map(k => k.total));
    const innerR = hubR * 0.32, outerR = hubR * 0.9;

    keyList = keyList.map(k => {
      const pull = k.hubCount > 1 ? 0.55 : 1; // multi-category keys pulled toward center
      const r = innerR + (outerR - innerR) * pull * (0.35 + 0.65 * (k.total / maxTotal));
      return { ...k, x: cx + r * Math.cos(k.angle), y: cy + r * Math.sin(k.angle) };
    });

    const hubs = attackTypes.map((t, i) => {
      const a = hubAngle.get(t);
      return { id: t, x: cx + hubR * Math.cos(a), y: cy + hubR * Math.sin(a), color: resolveColor(t, i) };
    });

    const links = data.map(({ source, target, weight }) => {
      const s = keyList.find(k => k.id === source);
      const h = hubs.find(x => x.id === target);
      return { source, target, weight, x1: s.x, y1: s.y, x2: h.x, y2: h.y };
    });

    return { hubs, keys: keyList, links, maxTotal };
  }, [data, cx, cy, hubR]);

  if (!layout) {
    return (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center text-luma-600 font-mono text-sm uppercase tracking-widest border border-white/5 rounded-xl bg-luma-100">
        No coordination data available
      </div>
    );
  }

  const activeSet = activeHub
    ? new Set(layout.keys.filter(k => k.hubs.has(activeHub)).map(k => k.id))
    : activeKey
    ? new Set([activeKey])
    : null;

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" onClick={() => { setActiveHub(null); setActiveKey(null); }}>
        {layout.links.map((l, i) => {
          const dimmed = activeSet && !activeSet.has(l.source) && l.target !== activeHub;
          const midX = (l.x1 + l.x2) / 2 + (l.y1 - l.y2) * 0.08;
          const midY = (l.y1 + l.y2) / 2 + (l.x2 - l.x1) * 0.08;
          return (
            <path
              key={i}
              d={`M${l.x1},${l.y1} Q${midX},${midY} ${l.x2},${l.y2}`}
              fill="none"
              stroke="white"
              strokeOpacity={dimmed ? 0.02 : activeSet ? 0.35 : 0.08}
              strokeWidth={Math.min(l.weight, 6) * 0.4}
            />
          );
        })}

        {layout.keys.map(k => {
          const dimmed = activeSet && !activeSet.has(k.id);
          const r = Math.sqrt(k.total / layout.maxTotal) * 8 + 3;
          return (
            <circle
              key={k.id} cx={k.x} cy={k.y} r={r}
              fill="#6B7280" fillOpacity={dimmed ? 0.1 : 0.9}
              stroke="white" strokeOpacity={dimmed ? 0.05 : 0.2}
              className="cursor-pointer transition-opacity"
              onMouseEnter={(e) => { e.stopPropagation(); setActiveKey(k.id); }}
              onClick={(e) => e.stopPropagation()}
            >
              <title>{k.id} ({k.total} events)</title>
            </circle>
          );
        })}

        {layout.hubs.map(h => (
          <g key={h.id} onMouseEnter={(e) => { e.stopPropagation(); setActiveHub(h.id); }} onClick={(e) => e.stopPropagation()} className="cursor-pointer">
            <circle cx={h.x} cy={h.y} r={16} fill={h.color} stroke="white" strokeOpacity={0.4} strokeWidth={2} />
            <rect x={h.x - 70} y={h.y + 22} width={140} height={20} fill="rgba(10,10,10,0.8)" rx={4} />
            <text x={h.x} y={h.y + 35} textAnchor="middle" className="font-mono uppercase" style={{ fontSize: 11, fill: '#E5E7EB', letterSpacing: '0.05em' }}>
              {formatAttackType(h.id)}
            </text>
          </g>
        ))}
      </svg>

      <div className="absolute bottom-4 left-4 text-[9px] font-mono text-luma-500 uppercase tracking-widest bg-black/60 px-2 py-1 rounded border border-white/5">
        Radius = traffic · Center pull = multi-category keys · Hover to isolate
      </div>
    </div>
  );
}
