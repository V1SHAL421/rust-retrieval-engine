import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { embedText, generateAnswer } from "./openai.js";
import type {
  AskRequest,
  AskResponse,
  RustQueryResponse,
  ScoreBreakdown,
} from "./types.js";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:3001";
const TOP_SOURCES = 3;

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

// ─── GET /health ──────────────────────────────────────────────────────────────

app.get("/health", async (c) => {
  const engineHealth = await fetch(`${ENGINE_URL}/health`)
    .then((r) => r.json())
    .catch(() => ({ status: "unreachable" }));

  return c.json({
    status: "ok",
    engine: engineHealth,
    version: "0.1.0",
  });
});

// ─── POST /ask ────────────────────────────────────────────────────────────────

app.post("/ask", async (c) => {
  let body: AskRequest;
  try {
    body = await c.req.json<AskRequest>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const { query, alpha = 0.5, top_k = 10 } = body;

  if (!query || query.trim().length === 0) {
    return c.json({ error: "query must not be empty" }, 400);
  }

  const totalStart = Date.now();

  // Stage 1: Embed the query.
  const embedStart = Date.now();
  let embedding: number[];
  try {
    embedding = await embedText(query);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `embedding failed: ${msg}` }, 502);
  }
  const embedMs = Date.now() - embedStart;

  // Stage 2: Retrieve from Rust engine.
  const retrieveStart = Date.now();
  let rustResponse: RustQueryResponse;
  try {
    const res = await fetch(`${ENGINE_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, embedding, alpha, top_k }),
    });
    if (!res.ok) {
      const text = await res.text();
      return c.json({ error: `engine error: ${text}` }, 502);
    }
    rustResponse = (await res.json()) as RustQueryResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `retrieval failed: ${msg}` }, 502);
  }
  const retrieveMs = Date.now() - retrieveStart;

  const topSources: ScoreBreakdown[] = rustResponse.results.slice(0, TOP_SOURCES);

  // Stage 3: Generate answer with LLM.
  const llmStart = Date.now();
  let answer: string;
  try {
    answer = await generateAnswer(
      query,
      topSources.map((s) => ({ title: s.title, content: s.content }))
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `generation failed: ${msg}` }, 502);
  }
  const llmMs = Date.now() - llmStart;
  const totalMs = Date.now() - totalStart;

  const response: AskResponse = {
    answer,
    sources: topSources,
    latency: {
      embed_ms: embedMs,
      retrieve_ms: retrieveMs,
      llm_ms: llmMs,
      total_ms: totalMs,
    },
    query,
    model: "gpt-4o-mini",
  };

  return c.json(response);
});

// ─── GET /benchmark (proxy to engine) ────────────────────────────────────────

app.get("/benchmark", async (c) => {
  try {
    const res = await fetch(`${ENGINE_URL}/benchmark`);
    return c.json(await res.json());
  } catch {
    return c.json({ error: "engine unreachable" }, 502);
  }
});

// ─── GET /eval/results (proxy to engine) ─────────────────────────────────────

app.get("/eval/results", async (c) => {
  const k = c.req.query("k") ?? "5";
  try {
    const res = await fetch(`${ENGINE_URL}/eval/results?k=${k}`);
    const data: unknown = await res.json();
    return res.ok ? c.json(data) : c.json(data, 422);
  } catch {
    return c.json({ error: "engine unreachable" }, 502);
  }
});

const port = parseInt(process.env.PORT ?? "3000", 10);
console.log(`API server starting on port ${port}`);

serve({ fetch: app.fetch, port });
