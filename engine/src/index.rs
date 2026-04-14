/// In-memory document index.
///
/// Stores tokenized text for BM25 and unit-normalized embeddings for cosine
/// similarity. All mutations go through `IndexStore` which holds a write lock;
/// reads are concurrent via `DashMap`.
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

use crate::bm25::{self, tokenize};
use crate::vector;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub embedding: Vec<f32>,
    /// Pre-computed tokens (lowercase, split on non-alphanumeric).
    #[serde(skip)]
    pub tokens: Vec<String>,
}

/// Per-document score breakdown returned to callers.
#[derive(Debug, Clone, Serialize)]
pub struct ScoreBreakdown {
    pub doc_id: String,
    pub title: String,
    pub content: String,
    pub bm25: f64,
    pub vector: f64,
    pub hybrid: f64,
}

/// Index statistics used by BM25.
struct CorpusStats {
    /// term → number of documents containing that term
    doc_freqs: HashMap<String, usize>,
    /// sum of all document lengths (in tokens)
    total_len: usize,
    /// number of documents
    doc_count: usize,
}

impl CorpusStats {
    fn avg_doc_len(&self) -> f64 {
        if self.doc_count == 0 {
            0.0
        } else {
            self.total_len as f64 / self.doc_count as f64
        }
    }
}

pub struct IndexStore {
    /// doc_id → Document (with pre-computed tokens + normalized embedding)
    docs: Arc<DashMap<String, Document>>,
    /// corpus-level BM25 statistics, rebuilt on each index call
    stats: Arc<RwLock<CorpusStats>>,
    /// query latencies recorded for /benchmark
    latencies: Arc<RwLock<Vec<Duration>>>,
}

impl Default for IndexStore {
    fn default() -> Self {
        Self::new()
    }
}

impl IndexStore {
    pub fn new() -> Self {
        Self {
            docs: Arc::new(DashMap::new()),
            stats: Arc::new(RwLock::new(CorpusStats {
                doc_freqs: HashMap::new(),
                total_len: 0,
                doc_count: 0,
            })),
            latencies: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Index a batch of documents, rebuilding corpus statistics.
    pub fn index_documents(&self, mut documents: Vec<Document>) {
        // Tokenize + normalize each document.
        for doc in &mut documents {
            doc.tokens = tokenize(&format!("{} {}", doc.title, doc.content));
            vector::normalize(&mut doc.embedding);
        }

        // Rebuild corpus-level stats from scratch (simple, correct).
        let mut doc_freqs: HashMap<String, usize> = HashMap::new();
        let mut total_len = 0usize;

        // Merge with existing documents.
        for entry in self.docs.iter() {
            let d = entry.value();
            total_len += d.tokens.len();
            let unique: std::collections::HashSet<_> = d.tokens.iter().collect::<std::collections::HashSet<_>>();
            for term in unique {
                *doc_freqs.entry(term.clone()).or_insert(0) += 1;
            }
        }

        for doc in &documents {
            total_len += doc.tokens.len();
            let unique: std::collections::HashSet<_> = doc.tokens.iter().collect::<std::collections::HashSet<_>>();
            for term in unique {
                *doc_freqs.entry(term.clone()).or_insert(0) += 1;
            }
        }

        // Insert documents.
        for doc in documents {
            self.docs.insert(doc.id.clone(), doc);
        }

        let doc_count = self.docs.len();
        let mut stats = self.stats.write();
        *stats = CorpusStats { doc_freqs, total_len, doc_count };
    }

    /// Query the index with hybrid BM25 + vector scoring.
    ///
    /// Returns top-k documents ranked by `alpha * bm25 + (1-alpha) * vector`.
    /// Both BM25 and vector scores are min-max normalized before combining so
    /// they live on the same [0, 1] scale.
    pub fn query(
        &self,
        query_text: &str,
        query_embedding: &[f32],
        alpha: f64,
        top_k: usize,
    ) -> Vec<ScoreBreakdown> {
        let start = Instant::now();

        let query_terms = tokenize(query_text);
        let stats = self.stats.read();

        if stats.doc_count == 0 {
            return vec![];
        }

        let avg_dl = stats.avg_doc_len();

        // Normalize the query embedding once.
        let mut qe = query_embedding.to_vec();
        vector::normalize(&mut qe);

        // Collect raw scores for every document.
        let mut raw: Vec<(String, f64, f64)> = self
            .docs
            .iter()
            .map(|entry| {
                let doc = entry.value();
                let bm25 = bm25::score_document(
                    &query_terms,
                    &doc.tokens,
                    doc.tokens.len(),
                    avg_dl,
                    &stats.doc_freqs,
                    stats.doc_count,
                );
                let vec_score = if !doc.embedding.is_empty() && !qe.is_empty() {
                    vector::cosine_similarity(&qe, &doc.embedding) as f64
                } else {
                    0.0
                };
                (doc.id.clone(), bm25, vec_score.max(0.0))
            })
            .collect::<Vec<(String, f64, f64)>>();

        // Min-max normalize each dimension across the result set.
        let bm25_max = raw.iter().map(|(_, b, _)| *b).fold(f64::NEG_INFINITY, f64::max);
        let bm25_min = raw.iter().map(|(_, b, _)| *b).fold(f64::INFINITY, f64::min);
        let vec_max = raw.iter().map(|(_, _, v)| *v).fold(f64::NEG_INFINITY, f64::max);
        let vec_min = raw.iter().map(|(_, _, v)| *v).fold(f64::INFINITY, f64::min);

        let norm = |x: f64, lo: f64, hi: f64| -> f64 {
            if (hi - lo).abs() < 1e-10 { 0.0 } else { (x - lo) / (hi - lo) }
        };

        let mut scored: Vec<(String, f64, f64, f64)> = raw
            .iter()
            .map(|(id, b, v)| {
                let nb = norm(*b, bm25_min, bm25_max);
                let nv = norm(*v, vec_min, vec_max);
                let hybrid = alpha * nb + (1.0 - alpha) * nv;
                (id.clone(), *b, *v, hybrid)
            })
            .collect::<Vec<(String, f64, f64, f64)>>();

        scored.sort_by(|a, b| b.3.partial_cmp(&a.3).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(top_k);

        let result: Vec<ScoreBreakdown> = scored
            .into_iter()
            .filter_map(|(id, bm25_raw, vec_raw, hybrid)| {
                self.docs.get(&id).map(|doc| ScoreBreakdown {
                    doc_id: id.clone(),
                    title: doc.title.clone(),
                    content: doc.content.clone(),
                    bm25: bm25_raw,
                    vector: vec_raw,
                    hybrid,
                })
            })
            .collect::<Vec<ScoreBreakdown>>();

        let elapsed = start.elapsed();
        self.latencies.write().push(elapsed);

        result
    }

    /// Compute p50 and p95 query latencies in milliseconds, plus sample count.
    pub fn percentile_latencies(&self) -> (f64, f64, usize) {
        let mut lats: Vec<f64> = self
            .latencies
            .read()
            .iter()
            .map(|d: &Duration| d.as_secs_f64() * 1000.0)
            .collect::<Vec<f64>>();

        let n = lats.len();
        if lats.is_empty() {
            return (0.0, 0.0, 0);
        }

        lats.sort_by(|a, b| a.partial_cmp(b).unwrap());

        let p50_idx = (n as f64 * 0.50) as usize;
        let p95_idx = (n as f64 * 0.95) as usize;

        let p50 = lats[p50_idx.min(n - 1)];
        let p95 = lats[p95_idx.min(n - 1)];

        (p50, p95, n)
    }

    pub fn doc_count(&self) -> usize {
        self.docs.len()
    }

}
