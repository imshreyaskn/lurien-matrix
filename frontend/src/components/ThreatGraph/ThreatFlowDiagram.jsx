import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { formatAttackType, getAttackColor } from '../../utils/formatters';

const FALLBACK = ['#F87171','#FBBF24','#34D399','#60A5FA','#A78BFA','#F472B6','#38BDF8','#4ADE80','#FB923C'];
const resolveColor = (t, i) => {
  let c = getAttackColor?.(t);
  if (c && typeof c === 'object') c = c.text || c.border;
  return (c && typeof c === 'string' && c.toLowerCase() !== '#ffffff' && c.toLowerCase() !== 'white') ? c : FALLBACK[i % FALLBACK.length];
};

const COL_W = 160;
const NODE_H_MIN = 20;
const NODE_GAP = 6;
const LAYER_COLORS = {
  rule_based: '#38BDF8',
  heuristic: '#818CF8',
  ml_classifier: '#A78BFA',
  embedding_similarity: '#34D399',
  context_policy: '#FBBF24',
  canary: '#FB923C',
  openai_moderation: '#F472B6',
};

function layoutColumn(items, x, totalHeight) {
  const sum = items.reduce((a, b) => a + b.value, 0) || 1;
  const usable = totalHeight - NODE_GAP * (items.length - 1);
  let y = 0;
  return items.map(item => {
    const h = Math.max(NODE_H_MIN, (item.value / sum) * usable);
    const node = { ...item, x, y, h };
    y += h + NODE_GAP;
    return node;
  });
}

function ribbonPath(x0, y0Top, y0Bot, x1, y1Top, y1Bot) {
  const mx = (x0 + x1) / 2;
  return `M${x0},${y0Top} C${mx},${y0Top} ${mx},${y1Top} ${x1},${y1Top}
          L${x1},${y1Bot} C${mx},${y1Bot} ${mx},${y0Bot} ${x0},${y0Bot} Z`;
}

function formatLayerName(name) {
  if (!name) return '—';
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function ThreatFlowDiagram({ data, replayCounts = {} }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 560 });
  const [hoverKey, setHoverKey] = useState(null);
  const [hoverAttack, setHoverAttack] = useState(null);
  const [hoverLayer, setHoverLayer] = useState(null);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.contentRect.width > 0) {
          setSize({ 
            w: entry.contentRect.width, 
            h: Math.max(480, entry.contentRect.height) 
          });
        }
      }
    });
    observer.observe(containerRef.current);
    
    // Initial size
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width > 0) {
      setSize({
        w: rect.width,
        h: Math.max(480, rect.height)
      });
    }

    return () => observer.disconnect();
  }, []);

  const model = useMemo(() => {
    if (!data?.length) return null;

    const keyTotals = new Map();
    const attackTotals = new Map();
    const layerTotals = new Map();
    const keyAttack = new Map();
    const attackLayer = new Map();

    data.forEach(({ apiKey, attackType, flaggedLayer, weight }) => {
      keyTotals.set(apiKey, (keyTotals.get(apiKey) || 0) + weight);
      attackTotals.set(attackType, (attackTotals.get(attackType) || 0) + weight);
      layerTotals.set(flaggedLayer, (layerTotals.get(flaggedLayer) || 0) + weight);

      const kaKey = `${apiKey}|${attackType}`;
      keyAttack.set(kaKey, (keyAttack.get(kaKey) || 0) + weight);
      const alKey = `${attackType}|${flaggedLayer}`;
      attackLayer.set(alKey, (attackLayer.get(alKey) || 0) + weight);
    });

    const keyItems = [...keyTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, value]) => ({ id, value, type: 'key' }));

    const attackTypesOrdered = [...attackTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id], i) => ({ id, value: attackTotals.get(id), color: resolveColor(id, i), type: 'attack' }));

    const layerItems = [...layerTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, value]) => ({ id, value, type: 'layer' }));

    return { keyItems, attackTypesOrdered, layerItems, keyAttack, attackLayer, keyTotals, attackTotals, layerTotals };
  }, [data]);

  const layout = useMemo(() => {
    if (!model) return null;
    const { w, h } = size;
    const innerH = h - 80;
    const col1X = 24, col2X = w / 2 - COL_W / 2, col3X = w - COL_W - 24;

    const col1 = layoutColumn(model.keyItems, col1X, innerH).map(n => ({ ...n, cy0: n.y + 40, cy1: n.y + n.h + 40 }));
    const col2 = layoutColumn(model.attackTypesOrdered, col2X, innerH).map(n => ({ ...n, cy0: n.y + 40, cy1: n.y + n.h + 40 }));
    const col3 = layoutColumn(model.layerItems, col3X, innerH).map(n => ({ ...n, cy0: n.y + 40, cy1: n.y + n.h + 40 }));

    // Running offsets per node so ribbons stack without overlap
    const offset1 = new Map(col1.map(n => [n.id, 0]));
    const offset2In = new Map(col2.map(n => [n.id, 0]));
    const offset2Out = new Map(col2.map(n => [n.id, 0]));
    const offset3 = new Map(col3.map(n => [n.id, 0]));

    const links1 = [];
    model.keyItems.forEach(k => {
      model.attackTypesOrdered.forEach(a => {
        const w = model.keyAttack.get(`${k.id}|${a.id}`);
        if (!w) return;
        const src = col1.find(n => n.id === k.id);
        const tgt = col2.find(n => n.id === a.id);
        const srcH = (w / k.value) * src.h;
        const tgtH = (w / a.value) * tgt.h;
        const y0Top = src.cy0 + offset1.get(k.id);
        const y1Top = tgt.cy0 + offset2In.get(a.id);
        offset1.set(k.id, offset1.get(k.id) + srcH);
        offset2In.set(a.id, offset2In.get(a.id) + tgtH);
        links1.push({ key: k.id, attack: a.id, weight: w, x0: src.x + COL_W, x1: tgt.x, y0Top, y0Bot: y0Top + srcH, y1Top, y1Bot: y1Top + tgtH, color: a.color });
      });
    });

    const links2 = [];
    model.attackTypesOrdered.forEach(a => {
      model.layerItems.forEach(l => {
        const w = model.attackLayer.get(`${a.id}|${l.id}`);
        if (!w) return;
        const src = col2.find(n => n.id === a.id);
        const tgt = col3.find(n => n.id === l.id);
        const srcH = (w / a.value) * src.h;
        const tgtH = (w / l.value) * tgt.h;
        const y0Top = src.cy0 + offset2Out.get(a.id);
        const y1Top = tgt.cy0 + offset3.get(l.id);
        offset2Out.set(a.id, offset2Out.get(a.id) + srcH);
        offset3.set(l.id, offset3.get(l.id) + tgtH);
        links2.push({ attack: a.id, layer: l.id, weight: w, x0: src.x + COL_W, x1: tgt.x, y0Top, y0Bot: y0Top + srcH, y1Top, y1Bot: y1Top + tgtH, color: a.color });
      });
    });

    return { col1, col2, col3, links1, links2 };
  }, [model, size]);

  const anyActive = hoverKey || hoverAttack || hoverLayer;

  const link1Active = (l) =>
    (hoverKey && l.key === hoverKey) ||
    (hoverAttack && l.attack === hoverAttack) ||
    false;

  const link2Active = (l) =>
    (hoverAttack && l.attack === hoverAttack) ||
    (hoverLayer && l.layer === hoverLayer) ||
    (hoverKey && layout?.links1.some(x => x.key === hoverKey && x.attack === l.attack));

  const totalEvents = model ? [...model.keyTotals.values()].reduce((a, b) => a + b, 0) : 0;

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[560px] bg-[#08090b] rounded-xl overflow-hidden">
      {/* Hex grid background */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
        <defs>
          <pattern id="hexgrid" width="28" height="49" patternUnits="userSpaceOnUse">
            <path d="M14 0L28 8V24L14 32L0 24V8Z" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
            <path d="M14 17L28 25V41L14 49L0 41V25Z" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
          </pattern>
          <filter id="ribbonGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#hexgrid)" />
      </svg>

      {(!model || !layout) ? (
        <div className="absolute inset-0 flex items-center justify-center text-luma-600 font-mono text-sm uppercase tracking-widest z-10 pointer-events-none">
          No flow data available
        </div>
      ) : (
        <>
          {/* Header stats */}
          <div className="absolute top-3 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
              Attack Pipeline — Key → Attack → Detection
            </span>
            <div className="flex gap-4 font-mono text-[10px] uppercase tracking-widest text-white/40">
              <span>{model.keyItems.length} keys</span>
              <span>{model.attackTypesOrdered.length} attacks</span>
              <span>{model.layerItems.length} layers</span>
              <span className="text-white/60">{totalEvents.toLocaleString()} events</span>
            </div>
          </div>

          {/* Column headers */}
          <div className="absolute top-0 left-0 w-full z-10 pointer-events-none" style={{ paddingTop: size.h > 600 ? 24 : 18 }}>
            <div className="flex justify-between px-6">
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/20" style={{ width: COL_W, textAlign: 'center' }}>API Keys</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/20" style={{ width: COL_W, textAlign: 'center' }}>Attack Types</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/20" style={{ width: COL_W, textAlign: 'center' }}>Detection Layers</span>
            </div>
          </div>

          {/* Main SVG */}
          <svg width={size.w} height={size.h} className="relative z-[1]"
            onMouseLeave={() => { setHoverKey(null); setHoverAttack(null); setHoverLayer(null); }}
            style={{ pointerEvents: 'all' }}
          >
            {/* Stage 1 ribbons: Key -> Attack */}
            <g>
              {layout.links1.map((l, i) => (
                <path
                  key={`l1-${i}`}
                  d={ribbonPath(l.x0, l.y0Top, l.y0Bot, l.x1, l.y1Top, l.y1Bot)}
                  fill={l.color}
                  fillOpacity={anyActive ? (link1Active(l) ? 0.5 : 0.03) : 0.16}
                  filter={link1Active(l) ? 'url(#ribbonGlow)' : undefined}
                  style={{ transition: 'fill-opacity 150ms ease' }}
                />
              ))}
            </g>

            {/* Stage 2 ribbons: Attack -> Layer */}
            <g>
              {layout.links2.map((l, i) => (
                <path
                  key={`l2-${i}`}
                  d={ribbonPath(l.x0, l.y0Top, l.y0Bot, l.x1, l.y1Top, l.y1Bot)}
                  fill={l.color}
                  fillOpacity={anyActive ? (link2Active(l) ? 0.5 : 0.03) : 0.14}
                  filter={link2Active(l) ? 'url(#ribbonGlow)' : undefined}
                  style={{ transition: 'fill-opacity 150ms ease' }}
                />
              ))}
            </g>

            {/* Column 1: API Keys */}
            {layout.col1.map(n => {
              const dim = anyActive && hoverKey !== n.id && !(hoverAttack && layout.links1.some(l => l.key === n.id && l.attack === hoverAttack));
              return (
                <g key={n.id}
                  onMouseEnter={() => { setHoverKey(n.id); setHoverAttack(null); setHoverLayer(null); }}
                  className="cursor-pointer"
                >
                  <rect x={n.x} y={n.cy0} width={COL_W} height={n.h} rx={3}
                    fill="#6B7280" fillOpacity={dim ? 0.12 : 0.7}
                    stroke="rgba(255,255,255,0.08)" strokeWidth={0.5}
                  />
                  <text x={n.x + 8} y={n.cy0 + n.h / 2} dominantBaseline="middle" className="font-mono"
                    style={{ fontSize: 10, fill: dim ? 'rgba(255,255,255,0.2)' : '#E5E7EB', transition: 'fill 150ms' }}
                  >
                    {n.id.length > 16 ? n.id.substring(0, 16) + '…' : n.id}
                  </text>
                  {n.h > 24 && (
                    <text x={n.x + COL_W - 8} y={n.cy0 + n.h / 2} dominantBaseline="middle" textAnchor="end" className="font-mono"
                      style={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }}
                    >
                      {n.value}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Column 2: Attack Types */}
            {layout.col2.map(n => {
              const dim = anyActive && hoverAttack !== n.id &&
                !(hoverKey && layout.links1.some(l => l.attack === n.id && l.key === hoverKey)) &&
                !(hoverLayer && layout.links2.some(l => l.attack === n.id && l.layer === hoverLayer));
              const replay = replayCounts[n.id];
              return (
                <g key={n.id}
                  onMouseEnter={() => { setHoverAttack(n.id); setHoverKey(null); setHoverLayer(null); }}
                  className="cursor-pointer"
                >
                  <rect x={n.x} y={n.cy0} width={COL_W} height={n.h} rx={3}
                    fill={n.color} fillOpacity={dim ? 0.12 : 0.85}
                    stroke={dim ? 'transparent' : n.color} strokeWidth={0.5} strokeOpacity={0.4}
                  />
                  {n.h > 16 && (
                    <text x={n.x + 8} y={n.cy0 + n.h / 2} dominantBaseline="middle" className="font-mono uppercase"
                      style={{ fontSize: 9.5, fontWeight: 600, fill: dim ? 'rgba(255,255,255,0.15)' : '#F3F4F6', letterSpacing: '0.03em', transition: 'fill 150ms' }}
                    >
                      {formatAttackType(n.id)}
                    </text>
                  )}
                  {replay > 0 && n.h > 16 && (
                    <g>
                      <rect x={n.x + COL_W - 36} y={n.cy0 + n.h / 2 - 7} width={30} height={14} rx={7}
                        fill="rgba(0,0,0,0.6)" stroke="rgba(255,255,255,0.15)" strokeWidth={0.5}
                      />
                      <text x={n.x + COL_W - 21} y={n.cy0 + n.h / 2} textAnchor="middle" dominantBaseline="middle" className="font-mono"
                        style={{ fontSize: 8, fill: '#FBBF24' }}
                      >
                        ×{replay}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Column 3: Flagged Layers */}
            {layout.col3.map(n => {
              const dim = anyActive && hoverLayer !== n.id &&
                !(hoverAttack && layout.links2.some(l => l.layer === n.id && l.attack === hoverAttack)) &&
                !(hoverKey && layout.links1.some(l1 => l1.key === hoverKey && layout.links2.some(l2 => l2.attack === l1.attack && l2.layer === n.id)));
              const layerColor = LAYER_COLORS[n.id] || '#38BDF8';
              return (
                <g key={n.id}
                  onMouseEnter={() => { setHoverLayer(n.id); setHoverKey(null); setHoverAttack(null); }}
                  className="cursor-pointer"
                >
                  <rect x={n.x} y={n.cy0} width={COL_W} height={n.h} rx={3}
                    fill={layerColor} fillOpacity={dim ? 0.1 : 0.65}
                    stroke={dim ? 'transparent' : layerColor} strokeWidth={0.5} strokeOpacity={0.3}
                  />
                  {n.h > 16 && (
                    <text x={n.x + 8} y={n.cy0 + n.h / 2} dominantBaseline="middle" className="font-mono uppercase"
                      style={{ fontSize: 9, fill: dim ? 'rgba(255,255,255,0.15)' : '#E0F2FE', letterSpacing: '0.03em', transition: 'fill 150ms' }}
                    >
                      {formatLayerName(n.id)}
                    </text>
                  )}
                  {n.h > 24 && (
                    <text x={n.x + COL_W - 8} y={n.cy0 + n.h / 2} dominantBaseline="middle" textAnchor="end" className="font-mono"
                      style={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }}
                    >
                      {n.value}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Footer legend */}
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between pointer-events-none">
            <span className="font-mono text-[9px] uppercase tracking-widest text-white/25">
              Ribbon width = event volume · ×N = replayed payload hashes · hover to trace full chain
            </span>
          </div>
        </>
      )}
    </div>
  );
}
