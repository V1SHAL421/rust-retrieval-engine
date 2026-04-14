/// Axum route handlers.
use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{
    eval::{run_eval, EvalCase, EvalReport},
    index::{Document, IndexStore, ScoreBreakdown},
};

pub type AppState = Arc<AppStateInner>;

pub struct AppStateInner {
    pub store: IndexStore,
    pub eval_cases: parking_lot::RwLock<Vec<EvalCase>>,
    pub eval_cache: parking_lot::RwLock<Option<EvalReport>>,
}

impl AppStateInner {
    pub fn new() -> Self {
        Self {
            store: IndexStore::new(),
            eval_cases: parking_lot::RwLock::new(Vec::new()),
            eval_cache: parking_lot::RwLock::new(None),
        }
    }
}

// ─── POST /index ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct IndexRequest {
    pub documents: Vec<IndexDoc>,
}

#[derive(Deserialize)]
pub struct IndexDoc {
    pub id: String,
    pub title: String,
    pub content: String,
    pub embedding: Vec<f32>,
}

#[derive(Serialize)]
pub struct IndexResponse {
    pub indexed: usize,
    pub total_docs: usize,
}

pub async fn index_handler(
    State(state): State<AppState>,
    Json(req): Json<IndexRequest>,
) -> Result<Json<IndexResponse>, (StatusCode, String)> {
    let count = req.documents.len();
    if count == 0 {
        return Err((StatusCode::BAD_REQUEST, "documents array is empty".into()));
    }

    let docs: Vec<Document> = req
        .documents
        .into_iter()
        .map(|d| Document {
            id: d.id,
            title: d.title,
            content: d.content,
            embedding: d.embedding,
            tokens: vec![],
        })
        .collect::<Vec<Document>>();

    state.store.index_documents(docs);

    // Invalidate eval cache.
    *state.eval_cache.write() = None;

    Ok(Json(IndexResponse {
        indexed: count,
        total_docs: state.store.doc_count(),
    }))
}

// ─── POST /query ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct QueryRequest {
    pub query: String,
    pub embedding: Vec<f32>,
    #[serde(default = "default_alpha")]
    pub alpha: f64,
    #[serde(default = "default_k")]
    pub top_k: usize,
}

fn default_alpha() -> f64 { 0.5 }
fn default_k() -> usize { 10 }

#[derive(Serialize)]
pub struct QueryResponse {
    pub results: Vec<ScoreBreakdown>,
    pub query: String,
    pub alpha: f64,
    pub top_k: usize,
}

pub async fn query_handler(
    State(state): State<AppState>,
    Json(req): Json<QueryRequest>,
) -> Result<Json<QueryResponse>, (StatusCode, String)> {
    if req.embedding.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "embedding must not be empty".into()));
    }
    if !(0.0..=1.0).contains(&req.alpha) {
        return Err((StatusCode::BAD_REQUEST, "alpha must be in [0, 1]".into()));
    }

    let results = state.store.query(&req.query, &req.embedding, req.alpha, req.top_k);

    Ok(Json(QueryResponse {
        results,
        query: req.query,
        alpha: req.alpha,
        top_k: req.top_k,
    }))
}

// ─── GET /benchmark ──────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct BenchmarkResponse {
    pub p50_ms: f64,
    pub p95_ms: f64,
    pub sample_count: usize,
    pub doc_count: usize,
}

pub async fn benchmark_handler(
    State(state): State<AppState>,
) -> Json<BenchmarkResponse> {
    let (p50, p95, samples) = state.store.percentile_latencies();
    Json(BenchmarkResponse {
        p50_ms: (p50 * 100.0).round() / 100.0,
        p95_ms: (p95 * 100.0).round() / 100.0,
        sample_count: samples,
        doc_count: state.store.doc_count(),
    })
}

// ─── POST /eval/cases ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct EvalCasesRequest {
    pub cases: Vec<EvalCase>,
}

#[derive(Serialize)]
pub struct EvalCasesResponse {
    pub loaded: usize,
}

pub async fn load_eval_cases_handler(
    State(state): State<AppState>,
    Json(req): Json<EvalCasesRequest>,
) -> Json<EvalCasesResponse> {
    let n = req.cases.len();
    *state.eval_cases.write() = req.cases;
    *state.eval_cache.write() = None;
    Json(EvalCasesResponse { loaded: n })
}

// ─── GET /eval/results ───────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct EvalQueryParams {
    #[serde(default = "default_eval_k")]
    pub k: usize,
}

fn default_eval_k() -> usize { 5 }

pub async fn eval_results_handler(
    State(state): State<AppState>,
    Query(params): Query<EvalQueryParams>,
) -> Result<Json<EvalReport>, (StatusCode, String)> {
    // Check cache (k must match).
    {
        let cache = state.eval_cache.read();
        if let Some(ref report) = *cache {
            if report.k == params.k {
                return Ok(Json(report.clone()));
            }
        }
    }

    let cases = state.eval_cases.read();
    if cases.is_empty() {
        return Err((StatusCode::UNPROCESSABLE_ENTITY, "no eval cases loaded; POST /eval/cases first".into()));
    }

    let report = run_eval(&cases, &state.store, params.k);
    drop(cases);

    *state.eval_cache.write() = Some(report.clone());

    Ok(Json(report))
}

// ─── GET /health ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub doc_count: usize,
    pub version: &'static str,
}

pub async fn health_handler(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        doc_count: state.store.doc_count(),
        version: env!("CARGO_PKG_VERSION"),
    })
}
