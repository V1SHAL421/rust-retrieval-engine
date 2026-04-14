/// BM25 implementation from scratch.
///
/// BM25 (Best Match 25) is a probabilistic ranking function. Given a query Q
/// with terms q1..qn and a document D, the score is:
///
///   score(D, Q) = Σ IDF(qi) * (tf(qi,D) * (k1+1)) / (tf(qi,D) + k1*(1 - b + b*|D|/avgdl))
///
/// Parameters:
///   k1 = 1.2  — term frequency saturation (higher = less saturation)
///   b  = 0.75 — document length normalization (1.0 = full normalization)
use std::collections::HashMap;

pub const K1: f64 = 1.2;
pub const B: f64 = 0.75;

/// Tokenize text into lowercase terms, splitting on whitespace and punctuation.
pub fn tokenize(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() > 1)
        .map(|s| s.to_lowercase())
        .collect::<Vec<String>>()
}

/// Term frequency: count of term t in document tokens.
pub fn term_frequency(term: &str, tokens: &[String]) -> f64 {
    tokens.iter().filter(|t| t.as_str() == term).count() as f64
}

/// Inverse document frequency (smoothed):
///   IDF(t) = ln((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
/// where N = total docs, df(t) = docs containing term t.
pub fn inverse_document_frequency(doc_count: usize, df: usize) -> f64 {
    let n = doc_count as f64;
    let df = df as f64;
    ((n - df + 0.5) / (df + 0.5) + 1.0).ln()
}

/// Score a single document against query terms.
///
/// # Arguments
/// * `query_terms`  – tokenized query
/// * `doc_tokens`   – tokenized document
/// * `doc_len`      – number of tokens in this document
/// * `avg_doc_len`  – average document length across corpus
/// * `doc_freqs`    – map from term → number of documents containing that term
/// * `doc_count`    – total number of documents in corpus
pub fn score_document(
    query_terms: &[String],
    doc_tokens: &[String],
    doc_len: usize,
    avg_doc_len: f64,
    doc_freqs: &HashMap<String, usize>,
    doc_count: usize,
) -> f64 {
    let mut score = 0.0;

    for term in query_terms {
        let tf = term_frequency(term, doc_tokens);
        if tf == 0.0 {
            continue;
        }

        let df = doc_freqs.get(term).copied().unwrap_or(0);
        let idf = inverse_document_frequency(doc_count, df);

        let numerator = tf * (K1 + 1.0);
        let denominator = tf + K1 * (1.0 - B + B * doc_len as f64 / avg_doc_len);

        score += idf * (numerator / denominator);
    }

    score
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenize_splits_on_punct() {
        let tokens = tokenize("Hello, world! This is BM25.");
        assert!(tokens.contains(&"hello".to_string()));
        assert!(tokens.contains(&"world".to_string()));
        assert!(tokens.contains(&"bm25".to_string()));
    }

    #[test]
    fn idf_decreases_with_higher_df() {
        let idf_rare = inverse_document_frequency(1000, 1);
        let idf_common = inverse_document_frequency(1000, 500);
        assert!(idf_rare > idf_common);
    }

    #[test]
    fn score_zero_for_no_overlap() {
        let query = tokenize("transformer attention heads");
        let doc = tokenize("the cat sat on the mat");
        let df: HashMap<String, usize> = HashMap::new();
        let s = score_document(&query, &doc, doc.len(), doc.len() as f64, &df, 10);
        assert_eq!(s, 0.0);
    }

    #[test]
    fn score_positive_for_overlap() {
        let query = tokenize("transformer attention");
        let doc = tokenize("transformer models use attention mechanisms");
        let mut df = HashMap::new();
        df.insert("transformer".to_string(), 3);
        df.insert("attention".to_string(), 2);
        let s = score_document(&query, &doc, doc.len(), doc.len() as f64, &df, 50);
        assert!(s > 0.0);
    }
}
