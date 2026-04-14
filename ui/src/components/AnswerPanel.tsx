import type { AskResponse } from "../types";
import { SourceCard } from "./SourceCard";

interface Props {
  result: AskResponse;
}

export function AnswerPanel({ result }: Props) {
  const bm25Max = Math.max(...result.sources.map((s) => s.bm25), 1);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Answer */}
      <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/70">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
            Answer · {result.model}
          </span>
        </div>
        <p className="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">
          {result.answer}
        </p>
      </div>

      {/* Sources */}
      <div>
        <h2 className="text-xs font-mono text-zinc-500 uppercase tracking-wider mb-3">
          Sources ({result.sources.length})
        </h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {result.sources.map((source, i) => (
            <SourceCard
              key={source.doc_id}
              source={source}
              index={i}
              bm25Max={bm25Max}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
