import { useState, useCallback } from "react";
import type { EvalReport } from "../types";

const API_BASE = "/api";

interface UseEvalResult {
  report: EvalReport | null;
  loading: boolean;
  error: string | null;
  k: number;
  setK: (v: number) => void;
  fetchEval: () => Promise<void>;
}

export function useEval(): UseEvalResult {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [k, setK] = useState(5);

  const fetchEval = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/eval/results?k=${k}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      setReport((await res.json()) as EvalReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [k]);

  return { report, loading, error, k, setK, fetchEval };
}
