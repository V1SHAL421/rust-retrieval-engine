#!/usr/bin/env tsx
/**
 * seed.ts — embed and index all docs, then load eval cases into the engine.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... ENGINE_URL=http://localhost:3001 npx tsx seed.ts
 *   OPENAI_API_KEY=sk-... npx tsx seed.ts --eval-only   # skip re-indexing
 *
 * The script:
 *   1. Reads data/docs.json (50 AI/ML documents)
 *   2. Embeds each doc via text-embedding-3-small (batched, 20 at a time)
 *   3. POSTs them to /index on the Rust engine
 *   4. Reads data/eval_cases.json (10 eval cases with known relevant IDs)
 *   5. Embeds each eval query
 *   6. POSTs the enriched cases to /eval/cases
 *   7. Fetches /eval/results and prints a summary table
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://localhost:3001";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawDoc {
  id: string;
  title: string;
  content: string;
}

interface RawEvalCase {
  query: string;
  relevant_ids: string[];
}

interface EvalCaseWithEmbedding {
  query: string;
  query_embedding: number[];
  relevant_ids: string[];
}

interface ConfigMetrics {
  config: string;
  alpha: number;
  recall_at_k: number;
  mrr: number;
  k: number;
}

interface EvalReport {
  total_cases: number;
  k: number;
  configs: ConfigMetrics[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dataPath(name: string): string {
  return path.join(__dirname, "..", "data", name);
}

async function embedBatch(client: OpenAI, texts: string[]): Promise<number[][]> {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data.map((d) => d.embedding);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${url} failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function printTable(metrics: ConfigMetrics[]): void {
  const header = ["Config", "Alpha", "Recall@k", "MRR", "k"];
  const rows = metrics.map((m) => [
    m.config,
    m.alpha.toFixed(1),
    (m.recall_at_k * 100).toFixed(1) + "%",
    m.mrr.toFixed(4),
    String(m.k),
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length))
  );

  const fmt = (cells: string[]) =>
    "│ " + cells.map((c, i) => c.padEnd(widths[i])).join(" │ ") + " │";

  const sep = "├─" + widths.map((w) => "─".repeat(w)).join("─┼─") + "─┤";
  const top = "┌─" + widths.map((w) => "─".repeat(w)).join("─┬─") + "─┐";
  const bot = "└─" + widths.map((w) => "─".repeat(w)).join("─┴─") + "─┘";

  console.log(top);
  console.log(fmt(header));
  console.log(sep);
  for (const row of rows) {
    console.log(fmt(row));
  }
  console.log(bot);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Error: OPENAI_API_KEY environment variable is not set");
    process.exit(1);
  }

  const evalOnly = process.argv.includes("--eval-only");
  const client = new OpenAI({ apiKey });

  // ── 1. Check engine health ──────────────────────────────────────────────────
  console.log(`\n▶ Checking engine at ${ENGINE_URL}...`);
  const health = await getJson<{ status: string; doc_count: number }>(
    `${ENGINE_URL}/health`
  );
  console.log(`  Engine status: ${health.status}, docs: ${health.doc_count}`);

  // ── 2. Index documents ──────────────────────────────────────────────────────
  if (!evalOnly) {
    const docs: RawDoc[] = JSON.parse(
      fs.readFileSync(dataPath("docs.json"), "utf-8")
    );
    console.log(`\n▶ Embedding ${docs.length} documents (batch size ${BATCH_SIZE})...`);

    const embedded: Array<{ id: string; title: string; content: string; embedding: number[] }> = [];

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);
      const texts = batch.map((d) => `${d.title}\n${d.content}`);
      process.stdout.write(
        `  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(docs.length / BATCH_SIZE)}... `
      );
      const embeddings = await embedBatch(client, texts);
      for (let j = 0; j < batch.length; j++) {
        embedded.push({ ...batch[j], embedding: embeddings[j] });
      }
      console.log("done");
    }

    console.log(`\n▶ Indexing ${embedded.length} documents...`);
    const indexResp = await postJson<{ indexed: number; total_docs: number }>(
      `${ENGINE_URL}/index`,
      { documents: embedded }
    );
    console.log(`  Indexed: ${indexResp.indexed}, total: ${indexResp.total_docs}`);
  } else {
    console.log("\n▶ Skipping indexing (--eval-only)");
  }

  // ── 3. Embed eval cases ─────────────────────────────────────────────────────
  const rawCases: RawEvalCase[] = JSON.parse(
    fs.readFileSync(dataPath("eval_cases.json"), "utf-8")
  );
  console.log(`\n▶ Embedding ${rawCases.length} eval queries...`);

  const queryTexts = rawCases.map((c) => c.query);
  const queryEmbeddings = await embedBatch(client, queryTexts);

  const enrichedCases: EvalCaseWithEmbedding[] = rawCases.map((c, i) => ({
    query: c.query,
    query_embedding: queryEmbeddings[i],
    relevant_ids: c.relevant_ids,
  }));

  // ── 4. Load eval cases ──────────────────────────────────────────────────────
  console.log(`\n▶ Loading eval cases into engine...`);
  const evalResp = await postJson<{ loaded: number }>(
    `${ENGINE_URL}/eval/cases`,
    { cases: enrichedCases }
  );
  console.log(`  Loaded: ${evalResp.loaded} cases`);

  // ── 5. Run eval and print results ────────────────────────────────────────────
  console.log(`\n▶ Running evaluation (k=5)...`);
  const report = await getJson<EvalReport>(`${ENGINE_URL}/eval/results?k=5`);

  console.log(`\n  Eval Results — ${report.total_cases} queries, k=${report.k}\n`);
  printTable(report.configs);

  console.log("\n✓ Seed complete.\n");
}

main().catch((err) => {
  console.error("\n✗ Seed failed:", err.message);
  process.exit(1);
});
