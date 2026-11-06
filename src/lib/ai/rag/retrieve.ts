import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema, ftsConfig } from "@/db";
import { embedTexts } from "./embed";

export type RetrievedChunk = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  citation: string | null;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  section: string | null;
  score: number;
};

/**
 * Hibrit getirme: tam metin arama (ts_rank) + varsa vektör benzerliği, RRF ile birleştirilir.
 * Yalnızca uzman onaylı (approved=true) ve READY durumundaki kaynaklar aranır.
 * `sourceIds` verilirse arama o kaynaklarla sınırlanır (ör. dersin kaynakları).
 */
export async function retrieve(query: string, opts: { limit?: number; sourceIds?: string[] } = {}): Promise<RetrievedChunk[]> {
  const limit = opts.limit ?? 8;
  const db = await getDb();
  const cfg = ftsConfig();
  const q = query.trim().slice(0, 500);
  if (!q) return [];
  // Soru cümlelerinde AND semantiği çok katı kalır; terimler "or" ile bağlanır,
  // ts_rank_cd eşleşen terim yoğunluğuna göre sıralar.
  const orQuery = toOrQuery(q);
  if (!orQuery) return [];

  const scopeCond = opts.sourceIds?.length ? inArray(schema.sourceChunks.sourceId, opts.sourceIds) : undefined;
  const baseCond = and(eq(schema.sources.approved, true), eq(schema.sources.status, "READY"), scopeCond);

  const ftsRows = await db
    .select({
      chunkId: schema.sourceChunks.id,
      sourceId: schema.sourceChunks.sourceId,
      sourceTitle: schema.sources.title,
      citation: schema.sources.citation,
      content: schema.sourceChunks.content,
      pageStart: schema.sourceChunks.pageStart,
      pageEnd: schema.sourceChunks.pageEnd,
      section: schema.sourceChunks.section,
      rank: sql<number>`ts_rank_cd(${schema.sourceChunks.tsv}, websearch_to_tsquery(${cfg}::regconfig, ${orQuery}))`,
    })
    .from(schema.sourceChunks)
    .innerJoin(schema.sources, eq(schema.sourceChunks.sourceId, schema.sources.id))
    .where(and(baseCond, sql`${schema.sourceChunks.tsv} @@ websearch_to_tsquery(${cfg}::regconfig, ${orQuery})`))
    .orderBy(sql`ts_rank_cd(${schema.sourceChunks.tsv}, websearch_to_tsquery(${cfg}::regconfig, ${orQuery})) desc`)
    .limit(limit * 3);

  let vecRows: typeof ftsRows = [];
  const emb = await embedTexts([q], "query").catch(() => null);
  if (emb?.[0]) {
    const vec = `[${emb[0].join(",")}]`;
    vecRows = await db
      .select({
        chunkId: schema.sourceChunks.id,
        sourceId: schema.sourceChunks.sourceId,
        sourceTitle: schema.sources.title,
        citation: schema.sources.citation,
        content: schema.sourceChunks.content,
        pageStart: schema.sourceChunks.pageStart,
        pageEnd: schema.sourceChunks.pageEnd,
        section: schema.sourceChunks.section,
        rank: sql<number>`1 - (${schema.sourceChunks.embedding} <=> ${vec}::vector)`,
      })
      .from(schema.sourceChunks)
      .innerJoin(schema.sources, eq(schema.sourceChunks.sourceId, schema.sources.id))
      .where(and(baseCond, sql`${schema.sourceChunks.embedding} is not null`))
      .orderBy(sql`${schema.sourceChunks.embedding} <=> ${vec}::vector`)
      .limit(limit * 3);
  }

  // Reciprocal Rank Fusion
  const K = 60;
  const scores = new Map<string, { row: (typeof ftsRows)[number]; score: number }>();
  const add = (rows: typeof ftsRows, weight: number) =>
    rows.forEach((row, i) => {
      const cur = scores.get(row.chunkId) ?? { row, score: 0 };
      cur.score += weight / (K + i + 1);
      scores.set(row.chunkId, cur);
    });
  add(ftsRows, 1);
  add(vecRows, 1);

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, score }) => ({
      chunkId: row.chunkId,
      sourceId: row.sourceId,
      sourceTitle: row.sourceTitle,
      citation: row.citation,
      content: row.content,
      pageStart: row.pageStart,
      pageEnd: row.pageEnd,
      section: row.section,
      score,
    }));
}

/** Serbest metni "a or b or c" biçimine çevirir; çok kısa kelimeleri ve noktalamayı atar. */
export function toOrQuery(text: string): string {
  const words = text
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w !== "or" && w !== "and" && w !== "not");
  return Array.from(new Set(words)).slice(0, 24).join(" or ");
}

/** Getirilen parçaları modele verilecek numaralı <kaynak> bloklarına dönüştürür. */
export function formatContext(chunks: RetrievedChunk[]): { context: string; index: { n: number; chunk: RetrievedChunk }[] } {
  const index = chunks.map((chunk, i) => ({ n: i + 1, chunk }));
  const context = index
    .map(({ n, chunk }) => {
      const loc = chunk.pageStart ? ` sayfa ${chunk.pageStart}${chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `-${chunk.pageEnd}` : ""}` : "";
      const safe = chunk.content.replace(/<\/?(kaynak|kullanici|belge|sistem)[^>]*>/gi, "");
      return `<kaynak n="${n}" baslik="${chunk.sourceTitle.replace(/"/g, "'")}"${loc ? ` konum="${loc.trim()}"` : ""}>\n${safe}\n</kaynak>`;
    })
    .join("\n\n");
  return { context, index };
}

/** Tüm onaylı kaynakların tam metnini (bir ders için) bağlam olarak derler; üst sınırla kırpar. */
export async function sourceFullTexts(sourceIds: string[], maxChars = 180_000) {
  if (!sourceIds.length) return { context: "", titles: [] as string[] };
  const db = await getDb();
  const rows = await db
    .select({
      sourceId: schema.sourceChunks.sourceId,
      idx: schema.sourceChunks.idx,
      content: schema.sourceChunks.content,
      title: schema.sources.title,
      citation: schema.sources.citation,
      page: schema.sourceChunks.pageStart,
    })
    .from(schema.sourceChunks)
    .innerJoin(schema.sources, eq(schema.sourceChunks.sourceId, schema.sources.id))
    .where(and(inArray(schema.sourceChunks.sourceId, sourceIds), eq(schema.sources.approved, true)))
    .orderBy(schema.sourceChunks.sourceId, schema.sourceChunks.idx);

  const bySource = new Map<string, { title: string; citation: string | null; parts: string[] }>();
  for (const r of rows) {
    const s = bySource.get(r.sourceId) ?? { title: r.title, citation: r.citation, parts: [] };
    s.parts.push(r.content);
    bySource.set(r.sourceId, s);
  }
  let budget = maxChars;
  const blocks: string[] = [];
  const titles: string[] = [];
  let n = 0;
  for (const s of bySource.values()) {
    n++;
    titles.push(s.citation ?? s.title);
    let text = s.parts.join("\n\n");
    if (text.length > budget) text = text.slice(0, Math.max(0, budget)) + "\n[... kırpıldı ...]";
    budget -= text.length;
    blocks.push(`<kaynak n="${n}" baslik="${s.title.replace(/"/g, "'")}" atif="${(s.citation ?? "").replace(/"/g, "'")}">\n${text}\n</kaynak>`);
    if (budget <= 0) break;
  }
  return { context: blocks.join("\n\n"), titles };
}
