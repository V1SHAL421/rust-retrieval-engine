import { useEval } from "../hooks/useEval";
import type { ConfigMetrics, QueryResult } from "../types";

function MetricsTable({ configs }: { configs: ConfigMetrics[] }) {
  const best = {
    recall: Math.max(...configs.map((c) => c.recall_at_k)),
    mrr: Math.max(...configs.map((c) => c.mrr)),
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="text-left py-2 pr-4 text-zinc-500 font-medium">Config</th>
            <th className="text-right py-2 px-4 text-zinc-500 font-medium">Alpha</th>
            <th className="text-right py-2 px-4 text-zinc-500 font-medium">
              Recall@{configs[0]?.k ?? "k"}
            </th>
            <th className="text-right py-2 px-4 text-zinc-500 font-medium">MRR</th>
            <th className="text-right py-2 pl-4 text-zinc-500 font-medium">Avg BM25</th>
          </tr>
        </thead>
        <tbody>
          {configs.map((c) => (
            <tr
              key={c.config}
              className="border-b border-zinc-900 hover:bg-zinc-900/40 transition-colors"
            >
              <td className="py-2.5 pr-4">
                <span className="text-zinc-300">{c.config}</span>
              </td>
              <td className="text-right py-2.5 px-4 text-zinc-500">
                {c.alpha.toFixed(1)}
              </td>
              <td className="text-right py-2.5 px-4">
                <span
                  className={
                    c.recall_at_k === best.recall
                      ? "text-emerald-400 font-medium"
                      : "text-zinc-300"
                  }
                >
                  {(c.recall_at_k * 100).toFixed(1)}%
                </span>
              </td>
              <td className="text-right py-2.5 px-4">
                <span
                  className={
                    c.mrr === best.mrr
                      ? "text-emerald-400 font-medium"
                      : "text-zinc-300"
                  }
                >
                  {c.mrr.toFixed(4)}
                </span>
              </td>
              <td className="text-right py-2.5 pl-4 text-zinc-500">
                {c.avg_bm25.toFixed(3)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueryResultRow({ qr }: { qr: QueryResult }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
      <p className="text-sm text-zinc-300 font-medium">{qr.query}</p>
      <p className="text-xs text-zinc-600">
        Relevant: {qr.relevant_ids.join(", ")}
      </p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {qr.results_by_config.map((r) => (
          <div
            key={r.config}
            className="bg-zinc-900 rounded p-2.5 space-y-1"
          >
            <div className="text-xs font-mono text-zinc-500">{r.config}</div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-zinc-400">recall</span>
              <span
                className={
                  r.recall === 1.0 ? "text-emerald-400" : "text-zinc-300"
                }
              >
                {(r.recall * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-zinc-400">RR</span>
              <span className="text-zinc-300">
                {r.reciprocal_rank.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EvalTab() {
  const { report, loading, error, k, setK, fetchEval } = useEval();

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs font-mono text-zinc-500">k =</label>
          <select
            value={k}
            onChange={(e) => setK(parseInt(e.target.value, 10))}
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-300 focus:outline-none focus:border-sky-500"
          >
            {[1, 3, 5, 10].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={fetchEval}
          disabled={loading}
          className="px-4 py-1.5 text-sm font-mono bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          {loading ? "Running…" : "Run Eval"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="border border-red-800 bg-red-950/50 rounded-lg px-4 py-3 text-sm text-red-400 font-mono">
          {error}
        </div>
      )}

      {/* Results */}
      {report && (
        <div className="space-y-6">
          <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-900/50">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                Aggregate Metrics · {report.total_cases} queries · k={report.k}
              </span>
            </div>
            <MetricsTable configs={report.configs} />
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
              Per-Query Breakdown
            </h3>
            {report.per_query.map((qr, i) => (
              <QueryResultRow key={i} qr={qr} />
            ))}
          </div>
        </div>
      )}

      {!report && !loading && !error && (
        <div className="text-center py-16 text-zinc-600 font-mono text-sm">
          Click "Run Eval" to evaluate retrieval configurations
        </div>
      )}
    </div>
  );
}
