import type { ScoreBreakdown } from "../types";
import { ScoreBar } from "./ScoreBar";

interface Props {
  source: ScoreBreakdown;
  index: number;
  bm25Max: number;
}

export function SourceCard({ source, index, bm25Max }: Props) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
            [{index + 1}]
          </span>
          <h3 className="text-sm font-medium text-zinc-200 leading-snug">
            {source.title}
          </h3>
        </div>
        <span className="text-xs font-mono text-emerald-400 shrink-0">
          {(source.hybrid * 100).toFixed(1)}%
        </span>
      </div>

      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
        {source.content}
      </p>

      <div className="space-y-1.5 pt-1 border-t border-zinc-800">
        <ScoreBar
          label="BM25"
          value={source.bm25}
          color="bg-amber-500"
          max={bm25Max > 0 ? bm25Max : 1}
        />
        <ScoreBar
          label="Vector"
          value={source.vector}
          color="bg-sky-500"
          max={1}
        />
        <ScoreBar
          label="Hybrid"
          value={source.hybrid}
          color="bg-emerald-500"
          max={1}
        />
      </div>
    </div>
  );
}
