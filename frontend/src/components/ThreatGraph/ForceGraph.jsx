import { useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { formatAttackType, getAttackColor } from '../../utils/formatters';

export default function ThreatForceGraph({ data }) {
  const containerRef = useRef(null);
  const fgRef = useRef(null);

  useEffect(() => {
    if (fgRef.current) {
      // Increase repulsion to spread nodes out
      fgRef.current.d3Force('charge').strength(-300);
      fgRef.current.d3Force('link').distance(70);
    }
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <div className="h-[400px] flex items-center justify-center text-luma-600 font-mono text-sm uppercase tracking-widest border border-white/5 rounded-xl bg-luma-100">
        No coordination data available
      </div>
    );
  }

  // Transform matrix rows (source, target, weight) into nodes and links
  const nodes = [];
  const links = [];
  const nodeMap = new Set();

  data.forEach(d => {
    // API Key node
    if (!nodeMap.has(d.source)) {
      nodes.push({ id: d.source, group: 'api_key', val: 1 });
      nodeMap.add(d.source);
    } else {
      nodes.find(n => n.id === d.source).val += d.weight;
    }

    // Attack Type node
    if (!nodeMap.has(d.target)) {
      nodes.push({ id: d.target, group: 'attack_type', val: 1 });
      nodeMap.add(d.target);
    } else {
      nodes.find(n => n.id === d.target).val += d.weight;
    }

    links.push({
      source: d.source,
      target: d.target,
      value: d.weight
    });
  });

  return (
    <div ref={containerRef} className="h-[400px] w-full bg-luma-100 border border-white/5 rounded-xl overflow-hidden cursor-crosshair">
      <ForceGraph2D
        ref={fgRef}
        width={containerRef.current?.clientWidth || 600}
        height={400}
        graphData={{ nodes, links }}
        nodeAutoColorBy="group"
        nodeRelSize={6}
        linkColor={() => 'rgba(255,255,255,0.1)'}
        linkWidth={link => Math.min(link.value, 10)}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const label = node.group === 'api_key' ? node.id.substring(0, 8) : formatAttackType(node.id);
          const fontSize = 12/globalScale;
          
          if (node.group === 'attack_type') {
            ctx.fillStyle = getAttackColor(node.id);
          } else {
            ctx.fillStyle = '#6B7280'; // API keys are gray
          }
          
          const radius = Math.sqrt(node.val) * 2 + 6;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
          ctx.fill();
          
          // Draw a subtle border around nodes
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Text pill background
          ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
          const textWidth = ctx.measureText(label).width;
          const bgWidth = textWidth + 8;
          const bgHeight = fontSize + 4;
          
          ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
          ctx.fillRect(node.x - bgWidth/2, node.y + radius + 4, bgWidth, bgHeight);

          // Text label
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = node.group === 'api_key' ? '#9CA3AF' : '#E5E7EB';
          ctx.fillText(label, node.x, node.y + radius + 4 + (bgHeight/2));
        }}
      />
    </div>
  );
}
