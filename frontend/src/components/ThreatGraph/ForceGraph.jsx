import { useRef, useEffect, useMemo, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { formatAttackType, getAttackColor } from '../../utils/formatters';

export default function ThreatForceGraph({ data }) {
  const containerRef = useRef(null);
  const fgRef = useRef(null);

  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [selectedHub, setSelectedHub] = useState(null);

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

  const { nodes, links, hubNeighbors } = useMemo(() => {
    if (!data || data.length === 0) return { nodes: [], links: [], hubNeighbors: new Map() };

    const nodeMap = new Map();
    const linkList = [];
    const neighbors = new Map();

    const attackTypes = [...new Set(data.map(d => d.target))];
    const radius = Math.max(260, attackTypes.length * 45); // scale radius with hub count

    attackTypes.forEach((type, i) => {
      const angle = (i / attackTypes.length) * 2 * Math.PI - Math.PI / 2;
      nodeMap.set(type, {
        id: type,
        group: 'attack_type',
        val: 0,
        fx: radius * Math.cos(angle),
        fy: radius * Math.sin(angle),
        angle,
      });
      neighbors.set(type, new Set());
    });

    data.forEach(d => {
      if (!nodeMap.has(d.source)) {
        nodeMap.set(d.source, { id: d.source, group: 'api_key', val: d.weight, hubCount: 0 });
      } else {
        nodeMap.get(d.source).val += d.weight;
      }
      
      nodeMap.get(d.source).hubCount = (nodeMap.get(d.source).hubCount || 0) + 1;
      nodeMap.get(d.target).val += d.weight;
      linkList.push({ source: d.source, target: d.target, value: d.weight });
      
      neighbors.get(d.target).add(d.source);
    });

    return { nodes: [...nodeMap.values()], links: linkList, hubNeighbors: neighbors };
  }, [data]);

  useEffect(() => {
    if (!fgRef.current) return;
    fgRef.current.d3Force('charge').strength(node => (node.group === 'attack_type' ? -200 : -350));
    fgRef.current.d3Force('link').distance(120).strength(0.5);
    fgRef.current.d3Force('center', null);
    
    // Zoom to fit on mount/data change
    setTimeout(() => {
      if (fgRef.current) fgRef.current.zoomToFit(400, 60);
    }, 100);
  }, [nodes]);

  const getLinkId = (nodeOrString) => typeof nodeOrString === 'object' ? nodeOrString.id : nodeOrString;

  const handleNodeHover = node => {
    if (selectedHub) return; // Disable hover tracing when a hub is isolated
    
    const newNodes = new Set();
    const newLinks = new Set();
    
    if (node) {
      newNodes.add(node.id);
      links.forEach(l => {
        const sourceId = getLinkId(l.source);
        const targetId = getLinkId(l.target);
        if (sourceId === node.id || targetId === node.id) {
          newLinks.add(`${sourceId}-${targetId}`);
          newNodes.add(sourceId);
          newNodes.add(targetId);
        }
      });
    }
    
    setHighlightNodes(newNodes);
    setHighlightLinks(newLinks);
  };

  const handleLinkHover = link => {
    if (selectedHub) return; // Disable hover tracing when a hub is isolated
    
    const newNodes = new Set();
    const newLinks = new Set();
    
    if (link) {
      const sourceId = getLinkId(link.source);
      const targetId = getLinkId(link.target);
      newLinks.add(`${sourceId}-${targetId}`);
      newNodes.add(sourceId);
      newNodes.add(targetId);
    }
    
    setHighlightNodes(newNodes);
    setHighlightLinks(newLinks);
  };

  const handleNodeClick = node => {
    if (node.group === 'attack_type') {
      setSelectedHub(prev => prev === node.id ? null : node.id);
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
    } else {
      setSelectedHub(null);
    }
  };

  const handleBackgroundClick = () => {
    setSelectedHub(null);
  };

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full bg-transparent overflow-hidden cursor-crosshair">
      {(!data || data.length === 0) ? (
        <div className="w-full h-full flex items-center justify-center text-luma-600 font-mono text-sm uppercase tracking-widest border border-white/5 rounded-xl bg-luma-100">
          No coordination data available
        </div>
      ) : (
        <>
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={{ nodes, links }}
            cooldownTicks={100}
            onNodeHover={handleNodeHover}
            onLinkHover={handleLinkHover}
            onNodeClick={handleNodeClick}
            onBackgroundClick={handleBackgroundClick}
            linkColor={link => {
              const sourceId = getLinkId(link.source);
              const targetId = getLinkId(link.target);
              
              if (selectedHub) {
                if (targetId === selectedHub) return 'rgba(255,255,255,0.6)';
                return 'rgba(255,255,255,0.02)'; // Fade others hard
              }
              
              if (highlightLinks.has(`${sourceId}-${targetId}`)) {
                return 'rgba(255,255,255,0.6)';
              }
              
              // Recede high-fan-out noisy edges
              const sourceNode = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
              if (sourceNode && sourceNode.hubCount > 2) {
                return highlightNodes.size > 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)';
              }
              
              return highlightNodes.size > 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.15)';
            }}
            linkWidth={link => {
              const sourceNode = typeof link.source === 'object' ? link.source : nodes.find(n => n.id === link.source);
              if (!selectedHub && sourceNode && sourceNode.hubCount > 2) return 0.5; // Thinner
              return Math.min(link.value, 8);
            }}
            linkDirectionalArrowLength={3.5}
            linkDirectionalArrowRelPos={1}
            linkCurvature={0.15}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const isHub = node.group === 'attack_type';
              const label = isHub ? formatAttackType(node.id) : (node.id.length > 12 ? node.id.substring(0, 12) + '...' : node.id);
              const fontSize = (isHub ? 13 : 11) / globalScale;
              
              let dimOpacity = 1;
              if (selectedHub) {
                const isSelected = node.id === selectedHub;
                const isNeighbor = !isHub && hubNeighbors.get(selectedHub)?.has(node.id);
                dimOpacity = (isSelected || isNeighbor) ? 1 : 0.05;
              } else if (highlightNodes.size > 0) {
                dimOpacity = highlightNodes.has(node.id) ? 1 : 0.2;
              }

              ctx.globalAlpha = dimOpacity;

              // Give hubs stark distinct categorical colors instead of theme lookup for now
              const fallbackColors = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6', '#38BDF8', '#4ADE80', '#FB923C'];
              let hubColor = '#6B7280';
              if (isHub) {
                const attackTypes = [...hubNeighbors.keys()];
                hubColor = fallbackColors[attackTypes.indexOf(node.id) % fallbackColors.length];
              }

              ctx.fillStyle = isHub ? hubColor : '#6B7280';
              const radius = isHub ? 14 : Math.sqrt(node.val) * 1.5 + 4;

              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
              ctx.fill();

              ctx.strokeStyle = isHub ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)';
              ctx.lineWidth = isHub ? 2 : 1;
              ctx.stroke();

              ctx.font = `${isHub ? 'bold ' : ''}${fontSize}px "JetBrains Mono", monospace`;
              const textWidth = ctx.measureText(label).width;
              const bgWidth = textWidth + 8;
              const bgHeight = fontSize + 4;
              
              // Directional label placement to avoid collisions
              const labelBelow = node.fy !== undefined ? node.fy > 0 : true;
              const labelY = labelBelow ? node.y + radius + 4 : node.y - radius - 4 - bgHeight;

              ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
              ctx.fillRect(node.x - bgWidth / 2, labelY, bgWidth, bgHeight);

              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = isHub ? '#E5E7EB' : '#9CA3AF';
              ctx.fillText(label, node.x, labelY + bgHeight / 2);
              
              ctx.globalAlpha = 1;
            }}
          />
          
          {/* Legends */}
          <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
            <div className="text-[10px] font-mono text-luma-400 uppercase tracking-widest bg-black/60 px-2 py-1 rounded border border-white/5">
              <span className="inline-block w-2 h-2 rounded-full bg-[#6B7280] mr-2"></span>
              API Keys (Size = Traffic)
            </div>
            <div className="text-[10px] font-mono text-luma-400 uppercase tracking-widest bg-black/60 px-2 py-1 rounded border border-white/5">
              <span className="inline-block w-2 h-2 rounded-full bg-white mr-2"></span>
              Hubs = Attack Types
            </div>
          </div>
          
          <div className="absolute bottom-4 left-4 pointer-events-none">
            <div className="text-[10px] font-mono text-luma-500 uppercase tracking-widest bg-black/60 px-2 py-1 rounded border border-white/5">
              Edge thickness = Event frequency • Click Hub to isolate
            </div>
          </div>
        </>
      )}
    </div>
  );
}
