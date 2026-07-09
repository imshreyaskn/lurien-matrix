import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export default function LiveGraph({ events = [] }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const prevEventsLen = useRef(0);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 400;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    svg.selectAll('*').remove();

    // ── Defs ──────────────────────────────────────────────
    const defs = svg.append('defs');
    
    // Distorted glitch glow for blocked explosions
    const glitchGlow = defs.append('filter').attr('id', 'glitch-glow');
    glitchGlow.append('feGaussianBlur').attr('stdDeviation', '2').attr('result', 'blur');
    const feMerge = glitchGlow.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // ── Layout ────────────────────────────────────────────
    const nodes = [
      { id: 'app', label: 'SOURCE_NODE', x: width * 0.15, y: height * 0.5, color: '#FFFFFF', text: '01' },
      { id: 'firewall', label: 'LURIEN_CORE', x: width * 0.5, y: height * 0.5, color: '#AAAAAA', text: 'FW' },
      { id: 'llm', label: 'TARGET_LLM', x: width * 0.85, y: height * 0.5, color: '#666666', text: '02' },
    ];

    const edges = [
      { source: nodes[0], target: nodes[1] },
      { source: nodes[1], target: nodes[2] },
    ];

    // ── Background grid ──────────────────────────────────
    const gridGroup = svg.append('g').attr('class', 'grid');
    for (let x = 0; x < width; x += 30) {
      gridGroup.append('line')
        .attr('x1', x).attr('y1', 0)
        .attr('x2', x).attr('y2', height)
        .attr('stroke', '#333333').attr('stroke-width', 0.5);
    }
    for (let y = 0; y < height; y += 30) {
      gridGroup.append('line')
        .attr('x1', 0).attr('y1', y)
        .attr('x2', width).attr('y2', y)
        .attr('stroke', '#333333').attr('stroke-width', 0.5);
    }

    // ── Draw edges ───────────────────────────────────────
    const edgeGroup = svg.append('g').attr('class', 'edges');
    edges.forEach(({ source, target }) => {
      edgeGroup.append('line')
        .attr('x1', source.x).attr('y1', source.y)
        .attr('x2', target.x).attr('y2', target.y)
        .attr('stroke', '#666666')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4');
    });

    // ── Draw nodes ───────────────────────────────────────
    const nodeGroup = svg.append('g').attr('class', 'nodes');

    nodes.forEach(node => {
      const g = nodeGroup.append('g').attr('transform', `translate(${node.x}, ${node.y})`);

      // Outer Box
      g.append('rect')
        .attr('x', -40).attr('y', -40)
        .attr('width', 80).attr('height', 80)
        .attr('fill', 'transparent')
        .attr('stroke', node.color)
        .attr('stroke-width', 1)
        .attr('opacity', 0.5)
        .attr('stroke-dasharray', '2,2');

      // Inner Solid Box
      g.append('rect')
        .attr('x', -30).attr('y', -30)
        .attr('width', 60).attr('height', 60)
        .attr('fill', '#0A0A0A')
        .attr('stroke', node.color)
        .attr('stroke-width', 1)
        .attr('class', `node-${node.id}`);

      // Text ID
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.3em')
        .attr('fill', node.color)
        .attr('font-size', '16')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-weight', 'bold')
        .attr('letter-spacing', '2px')
        .text(node.text);

      // Label
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '65')
        .attr('fill', node.color)
        .attr('font-size', '10')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('letter-spacing', '2px')
        .text(node.label);
    });

    // ── Animate new events ───────────────────────────────
    const newEvents = events.slice(prevEventsLen.current);
    prevEventsLen.current = events.length;

    newEvents.forEach((event, i) => {
      const delay = i * 800;
      if (event.safe) {
        animateSafePulse(svg, nodes, delay);
      } else {
        animateBlockedPulse(svg, nodes, event, delay);
      }
    });

    // ── Idle animation ───────────────────────────────────
    if (events.length === 0) {
      const firewallPulse = () => {
        svg.select('.node-firewall')
          .transition().duration(2000).attr('stroke', '#FFFFFF')
          .transition().duration(2000).attr('stroke', '#AAAAAA')
          .on('end', firewallPulse);
      };
      firewallPulse();
    }

  }, [events]);

  return (
    <div ref={containerRef} className="w-full h-[400px] relative">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
}

function animateSafePulse(svg, nodes, delay) {
  const g = svg.append('g');

  // Particle App → Firewall
  const particle1 = g.append('rect')
    .attr('width', 6).attr('height', 6)
    .attr('fill', '#FFFFFF')
    .attr('x', nodes[0].x - 3).attr('y', nodes[0].y - 3)
    .attr('opacity', 0);

  particle1
    .transition().delay(delay).duration(100).attr('opacity', 1)
    .transition().duration(600).ease(d3.easeLinear)
    .attr('x', nodes[1].x - 3).attr('y', nodes[1].y - 3)
    .transition().duration(100).attr('opacity', 0);

  // Particle Firewall → LLM
  const particle2 = g.append('rect')
    .attr('width', 6).attr('height', 6)
    .attr('fill', '#AAAAAA')
    .attr('x', nodes[1].x - 3).attr('y', nodes[1].y - 3)
    .attr('opacity', 0);

  particle2
    .transition().delay(delay + 700).duration(100).attr('opacity', 1)
    .transition().duration(600).ease(d3.easeLinear)
    .attr('x', nodes[2].x - 3).attr('y', nodes[2].y - 3)
    .transition().duration(100).attr('opacity', 0);

  // Firewall node flash
  svg.select('.node-firewall')
    .transition().delay(delay + 600).duration(100)
    .attr('stroke', '#FFFFFF')
    .transition().duration(500)
    .attr('stroke', '#AAAAAA');

  setTimeout(() => g.remove(), delay + 2000);
}

function animateBlockedPulse(svg, nodes, event, delay) {
  const g = svg.append('g');

  // Particle App → Firewall
  const particle = g.append('rect')
    .attr('width', 6).attr('height', 6)
    .attr('fill', '#FFFFFF')
    .attr('x', nodes[0].x - 3).attr('y', nodes[0].y - 3)
    .attr('opacity', 0);

  particle
    .transition().delay(delay).duration(100).attr('opacity', 1)
    .transition().duration(600).ease(d3.easeLinear)
    .attr('x', nodes[1].x - 3).attr('y', nodes[1].y - 3)
    .transition().duration(50).attr('opacity', 0);

  // EXPLOSION at Firewall
  const explosionDelay = delay + 700;

  for (let i = 0; i < 3; i++) {
    g.append('rect')
      .attr('x', nodes[1].x - 30).attr('y', nodes[1].y - 30)
      .attr('width', 60).attr('height', 60)
      .attr('fill', 'none')
      .attr('stroke', '#D4B89E') // Accent Gold
      .attr('stroke-width', 1)
      .attr('opacity', 0)
      .transition().delay(explosionDelay + i * 100)
      .duration(50).attr('opacity', 1)
      .transition().duration(400)
      .attr('x', nodes[1].x - (50 + i * 20)).attr('y', nodes[1].y - (50 + i * 20))
      .attr('width', 100 + i * 40).attr('height', 100 + i * 40)
      .attr('opacity', 0);
  }

  // Flash
  g.append('rect')
    .attr('x', nodes[1].x - 30).attr('y', nodes[1].y - 30)
    .attr('width', 60).attr('height', 60)
    .attr('fill', '#D4B89E')
    .attr('opacity', 0)
    .transition().delay(explosionDelay)
    .duration(50).attr('opacity', 0.8)
    .transition().duration(200).attr('opacity', 0);

  // Firewall node shakes and flashes
  svg.select('.node-firewall')
    .transition().delay(explosionDelay).duration(50)
    .attr('stroke', '#D4B89E').attr('stroke-width', 2).attr('filter', 'url(#glitch-glow)')
    .transition().duration(500)
    .attr('stroke', '#AAAAAA').attr('stroke-width', 1).attr('filter', 'none');

  // Text
  let labelText = 'BLOCKED_PAYLOAD';
  if (event.attack_type === 'prompt_extraction' || event.flagged_layer === 'canary') {
    labelText = 'SYS_CANARY_LEAK';
  } else if (event.attack_type === 'out_of_scope' || event.flagged_layer === 'context_policy') {
    labelText = 'OOS_INTENT_DETECTED';
  }

  const labelWidth = labelText.length * 9;
  
  const bgRect = g.append('rect')
    .attr('x', nodes[1].x - labelWidth / 2 - 10)
    .attr('y', nodes[1].y - 85)
    .attr('width', labelWidth + 20)
    .attr('height', 24)
    .attr('rx', 4)
    .attr('ry', 4)
    .attr('fill', 'rgba(0, 0, 0, 0.6)')
    .attr('stroke', 'rgba(255, 255, 255, 0.1)')
    .attr('stroke-width', 1)
    .attr('opacity', 0);

  const blockedText = g.append('text')
    .attr('x', nodes[1].x)
    .attr('y', nodes[1].y - 68)
    .attr('text-anchor', 'middle')
    .attr('fill', '#D4B89E')
    .attr('font-size', '14')
    .attr('font-family', 'JetBrains Mono, monospace')
    .attr('font-weight', 'bold')
    .attr('letter-spacing', '2px')
    .attr('filter', 'url(#glitch-glow)')
    .attr('opacity', 0)
    .text(labelText);

  bgRect
    .transition().delay(explosionDelay).duration(100)
    .attr('opacity', 1)
    .attr('y', nodes[1].y - 95)
    .transition().delay(1500).duration(300)
    .attr('opacity', 0);

  blockedText
    .transition().delay(explosionDelay).duration(100)
    .attr('opacity', 1)
    .attr('y', nodes[1].y - 78)
    .transition().delay(1500).duration(300)
    .attr('opacity', 0);

  if (event.attack_type) {
    const typeText = g.append('text')
      .attr('x', nodes[1].x)
      .attr('y', nodes[1].y - 55)
      .attr('text-anchor', 'middle')
      .attr('fill', '#FFFFFF')
      .attr('font-size', '10')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('letter-spacing', '1px')
      .attr('opacity', 0)
      .text(event.attack_type.replace(/_/g, ' ').toUpperCase());

    typeText
      .transition().delay(explosionDelay + 200).duration(100)
      .attr('opacity', 0.8)
      .transition().delay(1300).duration(300)
      .attr('opacity', 0);
  }

  setTimeout(() => g.remove(), delay + 3000);
}
