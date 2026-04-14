interface ScoreBarProps {
  label: string;
  value: number;
  color: string;
  max?: number;
}

export function ScoreBar({ label, value, color, max = 1 }: ScoreBarProps) {
  const pct = Math.min((value / max) * 100, 100);
  const display =
    max === 1 ? (value * 100).toFixed(1) + "%" : value.toFixed(3);

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className="w-14 text-zinc-500 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 text-right text-zinc-400">{display}</span>
    </div>
  );
}
