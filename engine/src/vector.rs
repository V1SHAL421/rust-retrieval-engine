/// Vector similarity utilities.
///
/// We use cosine similarity: cos(θ) = (A·B) / (‖A‖ * ‖B‖)
///
/// Documents are stored as pre-normalized unit vectors so that retrieval
/// reduces to a dot product, which is O(d) per document.

/// Compute the L2 norm of a vector.
pub fn l2_norm(v: &[f32]) -> f32 {
    v.iter().map(|x| x * x).sum::<f32>().sqrt()
}

/// Normalize a vector in-place to unit length.
/// Returns false if the vector is zero (cannot be normalized).
pub fn normalize(v: &mut Vec<f32>) -> bool {
    let norm = l2_norm(v);
    if norm < 1e-10 {
        return false;
    }
    for x in v.iter_mut() {
        *x /= norm;
    }
    true
}

/// Cosine similarity between two vectors.
/// Assumes both vectors are already L2-normalized (dot product suffices).
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len(), "vector dimension mismatch");
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum::<f32>()
}

/// Cosine similarity for non-normalized vectors (computes norms internally).
pub fn cosine_similarity_unnormalized(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len(), "vector dimension mismatch");
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a = l2_norm(a);
    let norm_b = l2_norm(b);
    if norm_a < 1e-10 || norm_b < 1e-10 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identical_vectors_similarity_one() {
        let v = vec![1.0f32, 0.0, 0.0];
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn orthogonal_vectors_similarity_zero() {
        let a = vec![1.0f32, 0.0, 0.0];
        let b = vec![0.0f32, 1.0, 0.0];
        assert!(cosine_similarity(&a, &b).abs() < 1e-6);
    }

    #[test]
    fn normalize_produces_unit_vector() {
        let mut v = vec![3.0f32, 4.0, 0.0];
        normalize(&mut v);
        let norm = l2_norm(&v);
        assert!((norm - 1.0).abs() < 1e-6);
    }

    #[test]
    fn unnormalized_matches_normalized() {
        let a = vec![2.0f32, 3.0, 1.0];
        let b = vec![1.0f32, 2.0, 4.0];
        let mut na = a.clone();
        let mut nb = b.clone();
        normalize(&mut na);
        normalize(&mut nb);
        let s1 = cosine_similarity(&na, &nb);
        let s2 = cosine_similarity_unnormalized(&a, &b);
        assert!((s1 - s2).abs() < 1e-5);
    }
}
