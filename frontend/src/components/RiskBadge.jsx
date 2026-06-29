import { formatRiskScore, getRiskBg } from '../utils/formatters';

export default function RiskBadge({ score, isBlocked = false, size = 'md' }) {
  const label = isBlocked ? 'BLOCKED' : score === null || score === undefined ? 'UNKNOWN' : score >= 0.65 ? 'BLOCKED' : score >= 0.35 ? 'SUSPICIOUS' : 'SAFE';
  
  const sizeClasses = {
    sm: 'text-xs px-1 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-sm px-2 py-1',
  };

  const fallbackSize = sizeClasses[size] || sizeClasses.md;
  const colorClasses = getRiskBg(score, isBlocked);

  return (
    <span
      className={`
        inline-flex items-center gap-2 font-mono tracking-widest font-bold uppercase border rounded-none
        ${fallbackSize} ${colorClasses}
      `}
    >
      {isBlocked || score >= 0.65 ? 'X' : '>'}
      <span>{label}</span>
      <span className="opacity-80">[{formatRiskScore(score)}]</span>
    </span>
  );
}
