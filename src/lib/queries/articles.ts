import "server-only";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Article, UserRole } from "@/db/schema";
import { isStaff } from "@/lib/auth/dal";

export type ArticleListItem = Pick<Article, "id" | "title" | "authors" | "journal" | "publishedOn" | "subspecialty" | "status" | "weekOf" | "publishedAt"> & {
  hasSummary: boolean;
};

const listSelect = {
  id: schema.articles.id,
  title: schema.articles.title,
  authors: schema.articles.authors,
  journal: schema.articles.journal,
  publishedOn: schema.articles.publishedOn,
  subspecialty: schema.articles.subspecialty,
  status: schema.articles.status,
  weekOf: schema.articles.weekOf,
  publishedAt: schema.articles.publishedAt,
};

/** Asistanlara gösterilen liste: yalnızca PUBLISHED, en yeni önce. */
export async function listPublishedArticles(): Promise<ArticleListItem[]> {
  const db = await getDb();
  const rows = await db
    .select({ ...listSelect, summary: schema.articles.summary })
    .from(schema.articles)
    .where(eq(schema.articles.status, "PUBLISHED"))
    .orderBy(desc(schema.articles.publishedAt));
  return rows.map(({ summary, ...r }) => ({ ...r, hasSummary: Boolean(summary) }));
}

export type ArticleCandidate = Article & { suggestedByName: string | null };

/**
 * Personel kuyruğu: SUGGESTED + SELECTED adaylar. Sıralama: seçilenler, sonra yapay zekâ puanı,
 * yoksa yapay zekâsız tarama puanı. `origin` ile taramadan / elle eklenenler süzülebilir.
 */
export async function listArticleCandidates(filter: { origin?: "manual" | "pubmed_scan" } = {}): Promise<ArticleCandidate[]> {
  const db = await getDb();
  const rows = await db
    .select({ a: schema.articles, suggestedByName: schema.users.name })
    .from(schema.articles)
    .leftJoin(schema.users, eq(schema.articles.suggestedBy, schema.users.id))
    .where(and(inArray(schema.articles.status, ["SUGGESTED", "SELECTED"]), filter.origin ? eq(schema.articles.origin, filter.origin) : undefined))
    .orderBy(desc(schema.articles.createdAt));
  const items = rows.map((r) => ({ ...r.a, suggestedByName: r.suggestedByName }));
  const score = (a: Article) => (a.status === "SELECTED" ? 1000 : 0) + (a.aiQualityNotes?.score ?? a.scanScore ?? -1);
  return items.sort((x, y) => score(y) - score(x) || y.createdAt.getTime() - x.createdAt.getTime());
}

/** Değerlendirme bekleyen adaylar: SUGGESTED ve aiQualityNotes boş. */
export async function listUnscoredCandidates(limit = 15): Promise<Article[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.articles)
    .where(and(eq(schema.articles.status, "SUGGESTED"), isNull(schema.articles.aiQualityNotes)))
    .orderBy(desc(schema.articles.createdAt))
    .limit(limit);
}

export async function countCandidates(): Promise<{ suggested: number; selected: number }> {
  const db = await getDb();
  const rows = await db
    .select({ status: schema.articles.status, c: count() })
    .from(schema.articles)
    .where(inArray(schema.articles.status, ["SUGGESTED", "SELECTED"]))
    .groupBy(schema.articles.status);
  const get = (s: Article["status"]) => Number(rows.find((r) => r.status === s)?.c ?? 0);
  return { suggested: get("SUGGESTED"), selected: get("SELECTED") };
}

export type ArticleDetail = Article & { selectedByName: string | null };

/** Makale detayı. Asistanlar için yalnızca PUBLISHED; aksi hâlde null. */
export async function getArticleDetail(id: string, viewer: { id: string; role: UserRole }): Promise<ArticleDetail | null> {
  const db = await getDb();
  const [row] = await db
    .select({ a: schema.articles, selectedByName: schema.users.name })
    .from(schema.articles)
    .leftJoin(schema.users, eq(schema.articles.selectedBy, schema.users.id))
    .where(eq(schema.articles.id, id))
    .limit(1);
  if (!row) return null;
  if (!isStaff(viewer.role) && row.a.status !== "PUBLISHED") return null;
  return { ...row.a, selectedByName: row.selectedByName };
}

export async function getArticleRaw(id: string): Promise<Article | null> {
  const db = await getDb();
  const [a] = await db.select().from(schema.articles).where(eq(schema.articles.id, id)).limit(1);
  return a ?? null;
}

/** Kaynağa göre bekleyen aday sayıları (filtre sekmeleri için). */
export async function countCandidatesByOrigin(): Promise<{ all: number; scan: number; manual: number }> {
  const db = await getDb();
  const rows = await db
    .select({ origin: schema.articles.origin, c: count() })
    .from(schema.articles)
    .where(inArray(schema.articles.status, ["SUGGESTED", "SELECTED"]))
    .groupBy(schema.articles.origin);
  const scan = Number(rows.find((r) => r.origin === "pubmed_scan")?.c ?? 0);
  const manual = Number(rows.find((r) => r.origin === "manual")?.c ?? 0);
  return { all: scan + manual, scan, manual };
}
