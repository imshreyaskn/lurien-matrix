import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';
import { THREAT_HEX } from '../../utils/theme';

export default function VelocityChart({ data }) {
  // We need to pivot data from {time, api_key, count} to {time, [apiKey1]: count, [apiKey2]: count}
  const pivoted = {};
  const apiKeys = new Set();
  
  (data || []).forEach(d => {
    if (!pivoted[d.time]) pivoted[d.time] = { time: d.time };
    pivoted[d.time][d.api_key] = d.count;
    apiKeys.add(d.api_key);
  });
  
  const chartData = Object.values(pivoted).sort((a, b) => a.time.localeCompare(b.time));
  const keysArray = Array.from(apiKeys);
  const colors = [THREAT_HEX[0], THREAT_HEX[1], THREAT_HEX[2], THREAT_HEX[3], THREAT_HEX[4]];

  return (
    <div className="bg-luma-100 border border-white/5 rounded-xl p-6 h-[300px] flex flex-col">
      <h2 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-4 flex items-center gap-2">
        <Activity className="w-4 h-4 text-accent-gold" />
        Threat Velocity (Last 24 Hours)
      </h2>
      
      {chartData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-luma-600 font-mono text-sm uppercase">
          No attacks detected in the last 24 hours
        </div>
      ) : (
        <div className="flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <XAxis dataKey="time" stroke="#444" tick={{fill: '#888', fontSize: 10, fontFamily: 'monospace'}} />
              <YAxis stroke="#444" tick={{fill: '#888', fontSize: 10, fontFamily: 'monospace'}} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}
                itemStyle={{ fontFamily: 'monospace', fontSize: '12px' }}
                labelStyle={{ fontFamily: 'monospace', fontSize: '12px', color: '#888' }}
              />
              {keysArray.map((key, i) => (
                <Line 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  stroke={colors[i % colors.length]} 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: colors[i % colors.length] }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
