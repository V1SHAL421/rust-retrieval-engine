export interface ScoreBreakdown {
  doc_id: string;
  title: string;
  content: string;
  bm25: number;
  vector: number;
  hybrid: number;
}

export interface LatencyBreakdown {
  embed_ms: number;
  retrieve_ms: number;
  llm_ms: number;
  total_ms: number;
}

export interface AskResponse {
  answer: string;
  sources: ScoreBreakdown[];
  latency: LatencyBreakdown;
  query: string;
  model: string;
}

export type Stage = "idle" | "embedding" | "retrieving" | "generating" | "done" | "error";

export interface ConfigMetrics {
  config: string;
  alpha: number;
  recall_at_k: number;
  mrr: number;
  avg_bm25: number;
  avg_vector: number;
  k: number;
}

export interface QueryResult {
  query: string;
  relevant_ids: string[];
  results_by_config: Array<{
    config: string;
    retrieved_ids: string[];
    recall: number;
    reciprocal_rank: number;
  }>;
}

export interface EvalReport {
  total_cases: number;
  k: number;
  configs: ConfigMetrics[];
  per_query: QueryResult[];
}
