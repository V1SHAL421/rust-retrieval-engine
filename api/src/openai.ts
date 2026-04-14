import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const CHAT_MODEL = "gpt-4o-mini";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const client = getClient();
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  // OpenAI returns embeddings in the same order as input
  return response.data.map((d) => d.embedding);
}

export interface ChatSource {
  title: string;
  content: string;
}

export async function generateAnswer(
  query: string,
  sources: ChatSource[]
): Promise<string> {
  const client = getClient();

  const context = sources
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.content}`)
    .join("\n\n");

  const systemPrompt = `You are a precise technical assistant for an AI/ML knowledge base.
Answer the user's question using only the provided context documents.
Be concise and accurate. If relevant, cite the source by number [1], [2], etc.
If the context doesn't contain enough information, say so clearly.`;

  const userPrompt = `Context:\n${context}\n\nQuestion: ${query}`;

  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 512,
  });

  return response.choices[0].message.content ?? "";
}

export { CHAT_MODEL, EMBEDDING_MODEL };
