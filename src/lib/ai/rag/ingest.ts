import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema, ftsConfig } from "@/db";
import { readFileBuffer } from "@/lib/storage/files";
import { chunkPages, chunkText, estimateTokens, type PageText } from "./chunk";
import { embedTexts } from "./embed";

/**
 * Kaynağı indeksler: PDF -> sayfa metinleri -> parçalar -> tsvector (+ embedding).
 * İdempotent: önceki parçalar silinir.
 */
export async function ingestSource(sourceId: string): Promise<{ chunks: number }> {
  const db = await getDb();
  const [src] = await db.select().from(schema.sources).where(eq(schema.sources.id, sourceId)).limit(1);
  if (!src) throw new Error("Kaynak bulunamadı");

  await db.update(schema.sources).set({ status: "PROCESSING", errorMessage: null, updatedAt: new Date() }).where(eq(schema.sources.id, sourceId));

  try {
    let chunks;
    if (src.type === "PDF") {
      if (!src.fileId) throw new Error("PDF dosyası eksik");
      const file = await readFileBuffer(src.fileId);
      if (!file) throw new Error("PDF dosyası bulunamadı");
      const pages = await extractPdfPages(file.data);
      const totalText = pages.reduce((n, p) => n + p.text.trim().length, 0);
      if (totalText < 200) throw new Error("PDF'den metin çıkarılamadı (taranmış görüntü olabilir). OCR'lı bir PDF yükleyin.");
      chunks = chunkPages(pages);
    } else {
      const text = src.rawText ?? "";
      if (text.trim().length < 50) throw new Error("Kaynak metni çok kısa");
      chunks = chunkText(text);
    }

    const embeddings = await embedTexts(chunks.map((c) => c.content), "document").catch((e) => {
      console.warn("[rag] embedding atlandı:", e instanceof Error ? e.message : e);
      return null;
    });

    await db.delete(schema.sourceChunks).where(eq(schema.sourceChunks.sourceId, sourceId));
    const cfg = ftsConfig();
    // Parça parça ekle (büyük PDF'lerde tek sorgu sınırını aşmamak için)
    for (let i = 0; i < chunks.length; i += 50) {
      const slice = chunks.slice(i, i + 50);
      await db.insert(schema.sourceChunks).values(
        slice.map((c, j) => ({
          sourceId,
          idx: c.idx,
          content: c.content,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          section: c.section,
          tokenCount: estimateTokens(c.content),
          tsv: sql`to_tsvector(${cfg}::regconfig, ${c.content})` as unknown as string,
          embedding: embeddings ? embeddings[i + j] : null,
        })),
      );
    }

    await db
      .update(schema.sources)
      .set({ status: "READY", chunkCount: chunks.length, updatedAt: new Date() })
      .where(eq(schema.sources.id, sourceId));
    return { chunks: chunks.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bilinmeyen hata";
    await db.update(schema.sources).set({ status: "FAILED", errorMessage: msg.slice(0, 500), updatedAt: new Date() }).where(eq(schema.sources.id, sourceId));
    throw e;
  }
}

export async function extractPdfPages(data: Buffer): Promise<PageText[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text)];
  return pages.map((t, i) => ({ page: i + 1, text: t }));
}
