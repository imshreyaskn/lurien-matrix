import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Network, Search, ArrowRight, ShieldAlert, AlertTriangle } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import { formatAttackType } from '../utils/formatters';
import { THREAT_HEX } from '../utils/theme';
import ErrorBoundary from '../components/ErrorBoundary';

export default function ThreatGraph() {
  const { data: statsData, loading, error } = usePolling(() => api.getGraphStats(), 30000);

  const isOffline = statsData?.status === 'graph_offline';
  const data = statsData?.data || { co_occurrence: [], layer_bypass: [], top_replayed: [], provider_targeting: [] };

  const totalCampaigns = data.co_occurrence.reduce((acc, curr) => acc + curr.weight, 0);
  const replayedHashes = data.top_replayed.length;
  const bypasses = data.layer_bypass.reduce((acc, curr) => acc + curr.caught_by_ml_only, 0);
  const providersTargeted = data.provider_targeting.length;

  return (
    <div className="space-y-8 pb-32">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-4xl font-light tracking-tight text-white mb-2">
            Threat <span className="text-accent-gold font-serif italic">Intelligence</span>
          </h1>
          <p className="text-luma-400">Live Neo4j graph analysis of coordinated attacks and layer bypasses.</p>
        </div>
      </div>

      {isOffline ? (
        <div className="bg-firewall-red/10 border border-firewall-red/20 rounded-xl p-8 flex flex-col items-center justify-center text-center">
          <AlertTriangle className="w-12 h-12 text-firewall-red mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Intelligence Layer Offline</h2>
          <p className="text-luma-400 max-w-md">The Neo4j Threat Graph is currently unreachable. The core firewall pipeline is still active and logging threats to MongoDB.</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard label="Total Co-occurrences" value={totalCampaigns} />
            <StatCard label="Replayed Hashes" value={replayedHashes} />
            <StatCard label="ML-Only Bypasses" value={bypasses} />
            <StatCard label="Providers Targeted" value={providersTargeted} />
          </div>

          {/* Main Visual */}
          <div className="bg-luma-100 border border-white/5 rounded-xl p-8 shadow-2xl relative overflow-hidden">
            <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
              <Network className="w-4 h-4 text-accent-gold" />
              Attack Type Co-occurrence
            </h2>
            
            {loading && !statsData ? (
              <div className="h-[500px] flex items-center justify-center text-luma-500 font-mono text-sm uppercase tracking-widest">
                Querying Threat Graph...
              </div>
            ) : (
              <ErrorBoundary>
                <ChordDiagram data={data.co_occurrence} />
              </ErrorBoundary>
            )}
          </div>

          {/* Data Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-luma-100 border border-white/5 rounded-xl p-6">
              <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-accent-gold" />
                Layer Bypass Patterns
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-xs text-luma-500 font-mono">
                      <th className="pb-3 font-normal">ATTACK TYPE</th>
                      <th className="pb-3 font-normal text-right">CAUGHT BY ML ONLY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.layer_bypass.length === 0 ? (
                      <tr><td colSpan="2" className="py-4 text-center text-luma-600 font-mono text-sm">No bypass patterns detected.</td></tr>
                    ) : (
                      data.layer_bypass.map((item, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-3 font-mono text-sm text-luma-300">{formatAttackType(item.attack_type)}</td>
                          <td className="py-3 font-mono text-sm text-white text-right">{item.caught_by_ml_only}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-luma-100 border border-white/5 rounded-xl p-6">
              <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-6 flex items-center gap-2">
                <Search className="w-4 h-4 text-accent-gold" />
                Top Replayed Hashes
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-xs text-luma-500 font-mono">
                      <th className="pb-3 font-normal">HASH</th>
                      <th className="pb-3 font-normal">ATTACK TYPE</th>
                      <th className="pb-3 font-normal text-right">TIMES SEEN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_replayed.length === 0 ? (
                      <tr><td colSpan="3" className="py-4 text-center text-luma-600 font-mono text-sm">No replays detected.</td></tr>
                    ) : (
                      data.top_replayed.map((item, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-3 font-mono text-sm text-luma-300 truncate max-w-[150px]">{item.hash}</td>
                          <td className="py-3 font-mono text-xs text-luma-400">{formatAttackType(item.attack_type)}</td>
                          <td className="py-3 font-mono text-sm text-white text-right">{item.times_seen}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-luma-100 border border-white/5 p-6 rounded-xl hover:-translate-y-1 transition-transform duration-300">
      <div className="text-xs font-mono text-luma-500 mb-2">{label}</div>
      <div className="text-3xl font-light text-white">{value}</div>
    </div>
  );
}

function ChordDiagram({ data }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: '' });

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;

    if (!data || data.length === 0) {
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();
      const width = containerRef.current.clientWidth;
      const height = 500;
      svg.attr('width', width).attr('height', height);
      
      const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);
      g.append('circle')
        .attr('r', 100)
        .attr('fill', 'none')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.2);
        
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.3em')
        .attr('fill', '#666666')
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-size', '12px')
        .text('AWAITING THREAT DATA');
      return;
    }

    const width = containerRef.current.clientWidth;
    const height = 500;
    const outerRadius = Math.min(width, height) * 0.5 - 60;
    const innerRadius = outerRadius - 20;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [-width / 2, -height / 2, width, height]);

    svg.selectAll('*').remove();

    // Extract unique attack types
    const nodes = Array.from(new Set(data.flatMap(d => [d.source, d.target]))).sort();
    
    // Create matrix
    const matrix = Array.from({ length: nodes.length }, () => new Array(nodes.length).fill(0));
    
    data.forEach(d => {
      const i = nodes.indexOf(d.source);
      const j = nodes.indexOf(d.target);
      matrix[i][j] = d.weight;
      matrix[j][i] = d.weight;
    });

    const chord = d3.chord()
      .padAngle(0.04)
      .sortSubgroups(d3.descending)
      .sortChords(d3.descending);

    const chords = chord(matrix);

    const arc = d3.arc()
      .innerRadius(innerRadius)
      .outerRadius(outerRadius);

    const ribbon = d3.ribbon()
      .radius(innerRadius);

    const color = d3.scaleOrdinal()
      .domain(d3.range(nodes.length))
      .range(THREAT_HEX);

    const group = svg.append('g')
      .selectAll('g')
      .data(chords.groups)
      .join('g');

    group.append('path')
      .attr('fill', d => color(d.index))
      .attr('stroke', d => d3.rgb(color(d.index)).darker())
      .attr('d', arc)
      .on('mouseover', (event, d) => {
        svg.selectAll('.ribbon')
          .filter(r => r.source.index !== d.index && r.target.index !== d.index)
          .transition().duration(200).attr('opacity', 0.1);
      })
      .on('mouseout', () => {
        svg.selectAll('.ribbon').transition().duration(200).attr('opacity', 0.6);
      });

    // Add labels
    group.append('text')
      .each(d => { d.angle = (d.startAngle + d.endAngle) / 2; })
      .attr('dy', '.35em')
      .attr('transform', d => `
        rotate(${(d.angle * 180 / Math.PI - 90)})
        translate(${outerRadius + 10})
        ${d.angle > Math.PI ? 'rotate(180)' : ''}
      `)
      .attr('text-anchor', d => d.angle > Math.PI ? 'end' : 'start')
      .attr('fill', '#AAAAAA')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')
      .text(d => formatAttackType(nodes[d.index]).substring(0, 15) + (nodes[d.index].length > 15 ? '...' : ''));

    // Draw ribbons
    svg.append('g')
      .attr('fill-opacity', 0.6)
      .selectAll('path')
      .data(chords)
      .join('path')
      .attr('class', 'ribbon')
      .attr('d', ribbon)
      .attr('fill', d => color(d.target.index))
      .attr('stroke', d => d3.rgb(color(d.target.index)).darker())
      .on('mousemove', (event, d) => {
        d3.select(event.currentTarget).attr('fill-opacity', 1);
        setTooltip({
          visible: true,
          x: event.clientX,
          y: event.clientY,
          content: `${formatAttackType(nodes[d.source.index])} ↔ ${formatAttackType(nodes[d.target.index])}: ${d.source.value} events`
        });
      })
      .on('mouseout', (event) => {
        d3.select(event.currentTarget).attr('fill-opacity', 0.6);
        setTooltip({ visible: false, x: 0, y: 0, content: '' });
      });

  }, [data]);

  return (
    <div ref={containerRef} className="w-full relative h-[500px]">
      <svg ref={svgRef} className="w-full h-full" />
      {tooltip.visible && (
        <div 
          className="fixed z-50 px-3 py-2 bg-black/90 border border-white/10 rounded text-xs font-mono text-white pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-10px]"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
