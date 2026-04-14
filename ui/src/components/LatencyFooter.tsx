import type { LatencyBreakdown } from "../types";

interface Props {
  latency: LatencyBreakdown;
}

interface StatProps {
  label: string;
  value: number;
  color: string;
}

function Stat({ label, value, color }: StatProps) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-base font-mono font-medium ${color}`}>
        {value}
        <span className="text-xs text-zinc-500 ml-0.5">ms</span>
      </span>
      <span className="text-xs text-zinc-600">{label}</span>
    </div>
  );
}

export function LatencyFooter({ latency }: Props) {
  return (
    <div className="border-t border-zinc-800 pt-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-zinc-600 uppercase tracking-wider">
          Latency
        </span>
        <div className="flex items-center gap-6">
          <Stat
            label="Embed"
            value={latency.embed_ms}
            color="text-violet-400"
          />
          <div className="w-px h-6 bg-zinc-800" />
          <Stat
            label="Retrieve"
            value={latency.retrieve_ms}
            color="text-sky-400"
          />
          <div className="w-px h-6 bg-zinc-800" />
          <Stat label="LLM" value={latency.llm_ms} color="text-amber-400" />
          <div className="w-px h-6 bg-zinc-800" />
          <Stat
            label="Total"
            value={latency.total_ms}
            color="text-emerald-400"
          />
        </div>
      </div>
    </div>
  );
}
