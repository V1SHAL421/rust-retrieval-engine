export interface ScoreBreakdown {
  doc_id: string;
  title: string;
  content: string;
  bm25: number;
  vector: number;
  hybrid: number;
}

export interface RustQueryResponse {
  results: ScoreBreakdown[];
  query: string;
  alpha: number;
  top_k: number;
}

export interface AskRequest {
  query: string;
  alpha?: number;
  top_k?: number;
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
