import "server-only";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema, ftsConfig } from "@/db";
import { toOrQuery } from "@/lib/ai/rag/retrieve";

export type FaqListItem = {
  id: string;
  question: string;
  answer: string;
  subspecialty: schema.Subspecialty | null;
  published: boolean;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceNote: string | null;
  authorName: string | null;
  updatedAt: Date;
};

export type FaqFilter = { q?: string; subspecialty?: schema.Subspecialty; includeUnpublished?: boolean; limit?: number };

const selectCols = {
  id: schema.faqEntries.id,
  question: schema.faqEntries.question,
  answer: schema.faqEntries.answer,
  subspecialty: schema.faqEntries.subspecialty,
  published: schema.faqEntries.published,
  sourceId: schema.faqEntries.sourceId,
  sourceTitle: schema.sources.title,
  sourceNote: schema.faqEntries.sourceNote,
  authorName: schema.users.name,
  updatedAt: schema.faqEntries.updatedAt,
};

/**
 * SSS listesi. Asistanlar yalnızca yayımlanmış girdileri görür (includeUnpublished=false).
 * `q` verilirse Türkçe tam metin arama ile sıralanır; yoksa en yeni üstte.
 */
export async function listFaq(filter: FaqFilter = {}): Promise<FaqListItem[]> {
  const db = await getDb();
  const conds: SQL[] = [];
  if (!filter.includeUnpublished) conds.push(eq(schema.faqEntries.published, true));
  if (filter.subspecialty) conds.push(eq(schema.faqEntries.subspecialty, filter.subspecialty));
  const orQuery = filter.q ? toOrQuery(filter.q) : "";
  const cfg = ftsConfig();
  const tsq = orQuery ? sql`websearch_to_tsquery(${cfg}::regconfig, ${orQuery})` : null;
  if (tsq) conds.push(sql`${schema.faqEntries.tsv} @@ ${tsq}`);

  const base = db
    .select(selectCols)
    .from(schema.faqEntries)
    .leftJoin(schema.sources, eq(schema.faqEntries.sourceId, schema.sources.id))
    .leftJoin(schema.users, eq(schema.faqEntries.createdBy, schema.users.id))
    .where(conds.length ? and(...conds) : undefined);
  const rows = tsq ? await base.orderBy(sql`ts_rank_cd(${schema.faqEntries.tsv}, ${tsq}) desc`).limit(filter.limit ?? 100) : await base.orderBy(desc(schema.faqEntries.updatedAt)).limit(filter.limit ?? 200);
  return rows;
}

/** Asistan için: soruya en yakın yayımlanmış SSS girdileri (en fazla `limit`). */
export async function searchFaq(query: string, limit = 3): Promise<FaqListItem[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  return listFaq({ q, limit });
}

export async function getFaq(id: string, opts: { includeUnpublished?: boolean } = {}): Promise<FaqListItem | null> {
  const db = await getDb();
  const conds: SQL[] = [eq(schema.faqEntries.id, id)];
  if (!opts.includeUnpublished) conds.push(eq(schema.faqEntries.published, true));
  const [row] = await db
    .select(selectCols)
    .from(schema.faqEntries)
    .leftJoin(schema.sources, eq(schema.faqEntries.sourceId, schema.sources.id))
    .leftJoin(schema.users, eq(schema.faqEntries.createdBy, schema.users.id))
    .where(and(...conds))
    .limit(1);
  return row ?? null;
}

export async function publishedFaqCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select({ id: schema.faqEntries.id }).from(schema.faqEntries).where(eq(schema.faqEntries.published, true));
  return rows.length;
}
