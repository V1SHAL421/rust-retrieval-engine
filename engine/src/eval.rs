/// Retrieval evaluation engine.
///
/// Accepts JSONL eval cases where each line has:
///   { "query": "...", "query_embedding": [...], "relevant_ids": ["id1", "id2"] }
///
/// Computes:
///   Recall@k  = |retrieved_ids ∩ relevant_ids| / |relevant_ids|
///   MRR       = mean of (1 / rank_of_first_relevant_result), 0 if none in top-k
///
/// Runs four configurations:
///   bm25_only   – alpha = 1.0
///   vector_only – alpha = 0.0
///   hybrid_50   – alpha = 0.5
///   hybrid_80   – alpha = 0.8
use serde::{Deserialize, Serialize};

use crate::index::IndexStore;

/// One eval case loaded from JSONL.
#[derive(Debug, Clone, Deserialize)]
pub struct EvalCase {
    pub query: String,
    pub query_embedding: Vec<f32>,
    pub relevant_ids: Vec<String>,
}

/// Metrics for a single retrieval configuration.
#[derive(Debug, Clone, Serialize)]
pub struct ConfigMetrics {
    pub config: String,
    pub alpha: f64,
    pub recall_at_k: f64,
    pub mrr: f64,
    pub avg_bm25: f64,
    pub avg_vector: f64,
    pub k: usize,
}

/// Full eval report returned by GET /eval/results.
#[derive(Debug, Clone, Serialize)]
pub struct EvalReport {
    pub total_cases: usize,
    pub k: usize,
    pub configs: Vec<ConfigMetrics>,
    pub per_query: Vec<QueryResult>,
}

#[derive(Debug, Clone, Serialize)]
pub struct QueryResult {
    pub query: String,
    pub relevant_ids: Vec<String>,
    pub results_by_config: Vec<ConfigQueryResult>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ConfigQueryResult {
    pub config: String,
    pub retrieved_ids: Vec<String>,
    pub recall: f64,
    pub reciprocal_rank: f64,
}

fn recall_at_k(retrieved: &[String], relevant: &[String]) -> f64 {
    if relevant.is_empty() {
        return 1.0;
    }
    let hits = retrieved.iter().filter(|id| relevant.contains(id)).count();
    hits as f64 / relevant.len() as f64
}

fn reciprocal_rank(retrieved: &[String], relevant: &[String]) -> f64 {
    for (i, id) in retrieved.iter().enumerate() {
        if relevant.contains(id) {
            return 1.0 / (i + 1) as f64;
        }
    }
    0.0
}

/// Run the full eval suite over the provided cases and index.
pub fn run_eval(cases: &[EvalCase], store: &IndexStore, k: usize) -> EvalReport {
    let configs: &[(&str, f64)] = &[
        ("bm25_only", 1.0),
        ("vector_only", 0.0),
        ("hybrid_50", 0.5),
        ("hybrid_80", 0.8),
    ];

    let mut per_query: Vec<QueryResult> = Vec::new();

    // Aggregate accumulators: [recall_sum, mrr_sum, bm25_sum, vec_sum]
    let mut accum: Vec<[f64; 4]> = vec![[0.0; 4]; configs.len()];

    for case in cases {
        let mut results_by_config: Vec<ConfigQueryResult> = Vec::new();

        for (ci, (name, alpha)) in configs.iter().enumerate() {
            let hits = store.query(&case.query, &case.query_embedding, *alpha, k);
            let retrieved_ids: Vec<String> = hits.iter().map(|h| h.doc_id.clone()).collect::<Vec<String>>();

            let recall = recall_at_k(&retrieved_ids, &case.relevant_ids);
            let rr = reciprocal_rank(&retrieved_ids, &case.relevant_ids);
            let avg_bm25 = if hits.is_empty() {
                0.0
            } else {
                hits.iter().map(|h| h.bm25).sum::<f64>() / hits.len() as f64
            };
            let avg_vec = if hits.is_empty() {
                0.0
            } else {
                hits.iter().map(|h| h.vector).sum::<f64>() / hits.len() as f64
            };

            accum[ci][0] += recall;
            accum[ci][1] += rr;
            accum[ci][2] += avg_bm25;
            accum[ci][3] += avg_vec;

            results_by_config.push(ConfigQueryResult {
                config: name.to_string(),
                retrieved_ids,
                recall,
                reciprocal_rank: rr,
            });
        }

        per_query.push(QueryResult {
            query: case.query.clone(),
            relevant_ids: case.relevant_ids.clone(),
            results_by_config,
        });
    }

    let n = cases.len() as f64;
    let config_metrics: Vec<ConfigMetrics> = configs
        .iter()
        .enumerate()
        .map(|(ci, (name, alpha))| ConfigMetrics {
            config: name.to_string(),
            alpha: *alpha,
            recall_at_k: if n > 0.0 { accum[ci][0] / n } else { 0.0 },
            mrr: if n > 0.0 { accum[ci][1] / n } else { 0.0 },
            avg_bm25: if n > 0.0 { accum[ci][2] / n } else { 0.0 },
            avg_vector: if n > 0.0 { accum[ci][3] / n } else { 0.0 },
            k,
        })
        .collect::<Vec<ConfigMetrics>>();

    EvalReport {
        total_cases: cases.len(),
        k,
        configs: config_metrics,
        per_query,
    }
}
