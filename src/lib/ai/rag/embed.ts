import "server-only";
import { env } from "@/lib/env";

/**
 * Embedding sağlayıcısı (isteğe bağlı). Öncelik: Voyage AI (VOYAGE_API_KEY) > Google Gemini (GEMINI_API_KEY).
 * Anahtar yoksa null döner ve sistem yalnızca tam metin aramayla (FTS) çalışır.
 * Not: Sağlayıcı değişirse kaynaklar yeniden indekslenmelidir (`npm run db:ingest -- all`),
 * çünkü farklı modellerin vektörleri birbiriyle karşılaştırılamaz.
 */
export const EMBEDDING_DIM = 1024;

export type EmbeddingProvider = "voyage" | "gemini" | null;

export function embeddingProvider(): EmbeddingProvider {
  const e = env();
  if (e.VOYAGE_API_KEY) return "voyage";
  if (e.GEMINI_API_KEY) return "gemini";
  return null;
}

export function embeddingsAvailable() {
  return embeddingProvider() !== null;
}

export async function embedTexts(texts: string[], inputType: "document" | "query"): Promise<number[][] | null> {
  const provider = embeddingProvider();
  if (!provider || texts.length === 0) return null;

  if (provider === "gemini") {
    const { geminiEmbed } = await import("../provider");
    return geminiEmbed(texts, inputType === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY", EMBEDDING_DIM);
  }

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64);
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env().VOYAGE_API_KEY}` },
      body: JSON.stringify({ input: batch, model: env().VOYAGE_MODEL, input_type: inputType, output_dimension: EMBEDDING_DIM }),
    });
    if (!res.ok) throw new Error(`Embedding hatası: ${res.status} ${await res.text().catch(() => "")}`);
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    json.data.sort((a, b) => a.index - b.index).forEach((d) => out.push(d.embedding));
  }
  return out;
}
