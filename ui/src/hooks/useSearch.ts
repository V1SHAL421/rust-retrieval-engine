import { useState, useCallback } from "react";
import type { AskResponse, Stage } from "../types";

const API_BASE = "/api";

interface UseSearchResult {
  stage: Stage;
  result: AskResponse | null;
  error: string | null;
  alpha: number;
  setAlpha: (v: number) => void;
  search: (query: string) => Promise<void>;
  reset: () => void;
}

export function useSearch(): UseSearchResult {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alpha, setAlpha] = useState<number>(0.5);

  const reset = useCallback(() => {
    setStage("idle");
    setResult(null);
    setError(null);
  }, []);

  const search = useCallback(
    async (query: string) => {
      if (!query.trim()) return;

      setResult(null);
      setError(null);
      setStage("embedding");

      try {
        // Stage transitions simulate the three server-side phases.
        // Real per-stage timing comes from the API's latency breakdown in the response.
        await new Promise((r) => setTimeout(r, 50));
        setStage("retrieving");
        await new Promise((r) => setTimeout(r, 80));
        setStage("generating");

        const res = await fetch(`${API_BASE}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, alpha, top_k: 10 }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error((body as { error?: string }).error ?? res.statusText);
        }

        const data = (await res.json()) as AskResponse;

        // Override the stage simulation with real timing data to show the
        // correct stage while displaying results.
        setResult(data);
        setStage("done");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : String(err));
        setStage("error");
      }
    },
    [alpha]
  );

  return { stage, result, error, alpha, setAlpha, search, reset };
}
