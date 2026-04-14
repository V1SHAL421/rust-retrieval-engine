import { useState } from "react";
import { useSearch } from "./hooks/useSearch";
import { StageIndicator } from "./components/StageIndicator";
import { AnswerPanel } from "./components/AnswerPanel";
import { LatencyFooter } from "./components/LatencyFooter";
import { EvalTab } from "./components/EvalTab";

type Tab = "search" | "eval";

export default function App() {
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const { stage, result, error, alpha, setAlpha, search, reset } = useSearch();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      search(query.trim());
    }
  }

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    if (result || error) reset();
  }

  const isSearching =
    stage === "embedding" || stage === "retrieving" || stage === "generating";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-sky-400" />
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <div className="w-2 h-2 rounded-full bg-amber-400" />
            </div>
            <span className="font-mono text-sm font-medium text-zinc-300">
              retrieval-engine
            </span>
            <span className="text-zinc-700 text-xs font-mono">v0.1.0</span>
          </div>
          <div className="flex items-center gap-1 text-xs font-mono text-zinc-600">
            <span>BM25</span>
            <span className="text-zinc-700">+</span>
            <span>vectors</span>
            <span className="text-zinc-700">+</span>
            <span>gpt-4o-mini</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-zinc-800 px-6">
        <div className="max-w-5xl mx-auto flex gap-0">
          {(["search", "eval"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-mono border-b-2 transition-colors ${
                tab === t
                  ? "border-sky-500 text-sky-300"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {tab === "search" && (
          <div className="space-y-6">
            {/* Search form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={query}
                  onChange={handleQueryChange}
                  placeholder="Ask a question about AI/ML…"
                  disabled={isSearching}
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-sky-500 transition-colors disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={isSearching || !query.trim()}
                  className="px-5 py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-mono rounded-lg transition-colors"
                >
                  {isSearching ? "…" : "Ask"}
                </button>
              </div>

              {/* Alpha slider */}
              <div className="flex items-center gap-4 text-xs font-mono">
                <span className="text-zinc-600 w-32">
                  BM25 weight (α ={" "}
                  <span className="text-zinc-400">{alpha.toFixed(2)}</span>)
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={alpha}
                  onChange={(e) => setAlpha(parseFloat(e.target.value))}
                  className="flex-1 accent-sky-500"
                />
                <div className="flex justify-between w-24 text-zinc-700">
                  <span>vector</span>
                  <span>bm25</span>
                </div>
              </div>
            </form>

            {/* Stage indicator */}
            {isSearching && (
              <div className="flex justify-center py-2">
                <StageIndicator stage={stage} />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="border border-red-800 bg-red-950/50 rounded-lg px-4 py-3 text-sm text-red-400 font-mono">
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-6">
                <AnswerPanel result={result} />
                <LatencyFooter latency={result.latency} />
              </div>
            )}

            {/* Empty state */}
            {stage === "idle" && !result && !error && (
              <div className="text-center py-20 space-y-2">
                <p className="text-zinc-600 text-sm font-mono">
                  Hybrid BM25 + vector retrieval over 50 AI/ML documents
                </p>
                <p className="text-zinc-700 text-xs font-mono">
                  Try: "How does Flash Attention work?" or "What is LoRA?"
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "eval" && <EvalTab />}
      </main>
    </div>
  );
}
