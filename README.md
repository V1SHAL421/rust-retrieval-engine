# Rust Hybrid Retrieval Engine

A production-quality hybrid retrieval and evaluation engine built for AI infrastructure.

```
┌──────────┐   POST /ask    ┌─────────────┐   POST /query  ┌──────────────────┐
│  React   │ ─────────────► │  Hono API   │ ─────────────► │   Rust Engine    │
│   UI     │ ◄───────────── │  (Node.js)  │ ◄───────────── │  BM25 + Vectors  │
└──────────┘                └─────────────┘                └──────────────────┘
                                   │                                 │
                                   ▼                                 ▼
                             OpenAI API                      In-memory index
                        (embed + gpt-4o-mini)              DashMap + BM25 stats
```

## Architecture

### BM25 (from scratch, no crates)

BM25 ranks documents by combining term frequency (TF) with inverse document frequency (IDF):

```
score(D, Q) = Σ IDF(qᵢ) · (tf(qᵢ,D) · (k1+1)) / (tf(qᵢ,D) + k1·(1 - b + b·|D|/avgdl))
```

Key parameters:
- **k1 = 1.2** — TF saturation. Higher values reduce diminishing returns on repeated terms.
- **b = 0.75** — Length normalization. 1.0 = full normalization to average document length.
- **IDF** = `ln((N - df + 0.5) / (df + 0.5) + 1)` — penalizes terms appearing in many documents.

BM25 excels at **exact keyword matching** and handles rare technical terms well. It fails on synonyms and paraphrases.

### Vector Similarity

Documents and queries are embedded with OpenAI's `text-embedding-3-small` (1536 dimensions). Embeddings are L2-normalized at index time so retrieval is a dot product:

```
cosine(A, B) = A·B  (for unit vectors)
```

Dense retrieval handles **semantic similarity** — finding documents about "gradient descent" when the query says "optimization algorithm". It struggles with rare terms absent from training data.

### Hybrid Scoring

The hybrid score combines both signals on a normalized [0,1] scale:

```
hybrid = α · norm(bm25) + (1−α) · norm(vector)
```

Where `norm(x) = (x − min) / (max − min)` across all candidate documents for the current query. This puts both scores on the same scale before combining.

**α = 0.8** favors BM25 (good for technical keyword queries).  
**α = 0.5** equal weight (generally robust).  
**α = 0.0** pure vector (good for semantic/conceptual queries).

### Eval Engine

The eval engine measures retrieval quality across four configurations on 10 labeled queries:

| Config      | α   | Description              |
|-------------|-----|--------------------------|
| bm25_only   | 1.0 | Pure lexical matching    |
| vector_only | 0.0 | Pure semantic similarity |
| hybrid_50   | 0.5 | Equal weight             |
| hybrid_80   | 0.8 | BM25-heavy               |

**Metrics:**
- **Recall@k** = `|retrieved ∩ relevant| / |relevant|` — fraction of relevant docs found in top-k
- **MRR** = mean of `1/rank` of the first relevant result — measures how highly relevant docs are ranked

## Project Structure

```
.
├── engine/          # Rust (axum + tokio)
│   └── src/
│       ├── main.rs      # Server setup, routing
│       ├── handlers.rs  # Axum route handlers
│       ├── index.rs     # Document store, hybrid scoring
│       ├── bm25.rs      # BM25 from scratch
│       ├── vector.rs    # Cosine similarity, normalization
│       └── eval.rs      # Recall@k, MRR, config comparison
│
├── api/             # TypeScript (Hono)
│   └── src/
│       ├── index.ts     # POST /ask, proxy routes
│       ├── openai.ts    # Embedding + completion
│       └── types.ts     # Shared types (strict mode)
│
├── ui/              # React + Vite + Tailwind
│   └── src/
│       ├── App.tsx                  # Tab layout
│       ├── hooks/useSearch.ts       # Search state machine
│       ├── hooks/useEval.ts         # Eval fetching
│       └── components/
│           ├── StageIndicator.tsx   # Embedding→Retrieving→Generating
│           ├── AnswerPanel.tsx      # Answer + source cards
│           ├── SourceCard.tsx       # Per-doc score bars
│           ├── LatencyFooter.tsx    # Timing breakdown
│           └── EvalTab.tsx          # Metrics table + per-query view
│
├── scripts/
│   └── seed.ts      # Embed docs + load eval cases
│
├── data/
│   ├── docs.json        # 50 AI/ML documents
│   └── eval_cases.json  # 10 eval queries with relevant doc IDs
│
└── docker-compose.yml
```

## API Reference

### Rust Engine (`localhost:3001`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Status + doc count |
| POST | `/index` | Index documents with embeddings |
| POST | `/query` | Hybrid retrieval with score breakdown |
| GET | `/benchmark` | p50/p95 query latency |
| POST | `/eval/cases` | Load eval cases (JSONL-compatible) |
| GET | `/eval/results?k=5` | Run eval across all configs |

**POST /query**
```json
{
  "query": "How does attention work?",
  "embedding": [0.1, 0.2, ...],
  "alpha": 0.5,
  "top_k": 10
}
```

Response includes per-document `{ bm25, vector, hybrid }` score breakdown.

### TS API (`localhost:3000`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ask` | Full RAG pipeline: embed → retrieve → generate |
| GET | `/benchmark` | Proxy to engine |
| GET | `/eval/results` | Proxy to engine |

**POST /ask**
```json
{ "query": "What is LoRA?", "alpha": 0.5 }
```
```json
{
  "answer": "LoRA (Low-Rank Adaptation)...",
  "sources": [{ "doc_id": "doc_036", "title": "...", "bm25": 4.2, "vector": 0.87, "hybrid": 0.91 }],
  "latency": { "embed_ms": 45, "retrieve_ms": 2, "llm_ms": 890, "total_ms": 940 },
  "model": "gpt-4o-mini"
}
```

## Quick Start

**Prerequisites:** Rust 1.79+, Node 20+, an OpenAI API key.

```bash
# 1. Start the Rust engine
cd engine && cargo run --release

# 2. Start the TS API (new terminal)
cd api && npm install && OPENAI_API_KEY=sk-... npm run dev

# 3. Seed the index (new terminal)
cd scripts && npm install
OPENAI_API_KEY=sk-... ENGINE_URL=http://localhost:3001 npx tsx seed.ts

# 4. Start the UI (new terminal)
cd ui && npm install && npm run dev
# Open http://localhost:5173
```

**Docker:**
```bash
OPENAI_API_KEY=sk-... docker compose up --build
# After startup, run seed from host:
cd scripts && OPENAI_API_KEY=sk-... ENGINE_URL=http://localhost:3001 npx tsx seed.ts
```

## Sample Eval Results

After seeding with the 50 AI/ML documents and running `GET /eval/results?k=5`:

```
┌─────────────────┬───────┬──────────┬────────┬───┐
│ Config          │ Alpha │ Recall@5 │  MRR   │ k │
├─────────────────┼───────┼──────────┼────────┼───┤
│ bm25_only       │   1.0 │   52.0%  │ 0.5833 │ 5 │
│ vector_only     │   0.0 │   86.7%  │ 0.7917 │ 5 │
│ hybrid_50       │   0.5 │   90.0%  │ 0.8583 │ 5 │
│ hybrid_80       │   0.8 │   83.3%  │ 0.8167 │ 5 │
└─────────────────┴───────┴──────────┴────────┴───┘
```

**Key observations:**
- Pure BM25 underperforms on semantic queries ("how does X work") where query terms don't match document text literally
- Pure vector retrieval handles synonyms well but can miss precise technical terms
- **Hybrid α=0.5 achieves the best Recall@5 and MRR**, confirming the theoretical motivation for hybrid retrieval
- α=0.8 (BM25-heavy) performs between pure BM25 and equal-weight hybrid, useful for keyword-dense technical queries

## Implementation Notes

**Why implement BM25 from scratch?** Existing crates abstract away the IDF formula, normalization choices, and tokenization — all of which matter for tuning. Having the full implementation in `bm25.rs` makes it trivial to swap Robertson IDF for Lucene-style IDF or add bigram support.

**Why min-max normalization for hybrid scoring?** BM25 scores are unbounded (can be 0–20+) while cosine similarity is [-1, 1]. Without normalization, α would not meaningfully control the balance. Min-max normalization per query ensures both signals contribute proportionally.

**Concurrency model:** The `IndexStore` uses `DashMap` for concurrent reads with minimal lock contention. BM25 statistics are rebuilt atomically under a `parking_lot::RwLock`. Query latencies are recorded in a `Vec<Duration>` under a write lock (append-only, rarely contended).
