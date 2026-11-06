import "server-only";
import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type SourceStatus = (typeof schema.sourceStatusEnum.enumValues)[number];

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  PENDING: "Bekliyor",
  PROCESSING: "İşleniyor",
  READY: "Hazır",
  FAILED: "Başarısız",
};

export type SourceListItem = {
  id: string;
  title: string;
  type: (typeof schema.sourceTypeEnum.enumValues)[number];
  status: SourceStatus;
  errorMessage: string | null;
  chunkCount: number;
  approved: boolean;
  subspecialty: schema.Subspecialty | null;
  year: number | null;
  uploaderName: string | null;
  /** Bu kaynağa bağlı ders sayısı (silme öncesi uyarı için). */
  lessonCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SourceListFilter = { status?: SourceStatus; approved?: boolean };

/** Personel için kaynak listesi (en yeni üstte). */
export async function listSources(filter: SourceListFilter = {}): Promise<SourceListItem[]> {
  const db = await getDb();
  const conds: SQL[] = [];
  if (filter.status) conds.push(eq(schema.sources.status, filter.status));
  if (typeof filter.approved === "boolean") conds.push(eq(schema.sources.approved, filter.approved));
  const rows = await db
    .select({
      id: schema.sources.id,
      title: schema.sources.title,
      type: schema.sources.type,
      status: schema.sources.status,
      errorMessage: schema.sources.errorMessage,
      chunkCount: schema.sources.chunkCount,
      approved: schema.sources.approved,
      subspecialty: schema.sources.subspecialty,
      year: schema.sources.year,
      uploaderName: schema.users.name,
      lessonCount: sql<number>`(select count(*) from ${schema.lessonSources} where ${schema.lessonSources.sourceId} = ${schema.sources.id})`.mapWith(Number),
      createdAt: schema.sources.createdAt,
      updatedAt: schema.sources.updatedAt,
    })
    .from(schema.sources)
    .leftJoin(schema.users, eq(schema.sources.uploadedBy, schema.users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.sources.createdAt));
  return rows;
}

export async function getSourceDetail(id: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      source: schema.sources,
      uploaderName: schema.users.name,
      file: { id: schema.files.id, originalName: schema.files.originalName, size: schema.files.size, mime: schema.files.mime },
    })
    .from(schema.sources)
    .leftJoin(schema.users, eq(schema.sources.uploadedBy, schema.users.id))
    .leftJoin(schema.files, eq(schema.sources.fileId, schema.files.id))
    .where(eq(schema.sources.id, id))
    .limit(1);
  if (!row) return null;
  let approverName: string | null = null;
  if (row.source.approvedBy) {
    const [a] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, row.source.approvedBy)).limit(1);
    approverName = a?.name ?? null;
  }
  return { ...row.source, uploaderName: row.uploaderName, approverName, file: row.file?.id ? row.file : null };
}

/** İlk N parçanın önizlemesi (içerik + sayfa). */
export async function getSourceChunksPreview(sourceId: string, limit = 20) {
  const db = await getDb();
  return db
    .select({
      id: schema.sourceChunks.id,
      idx: schema.sourceChunks.idx,
      content: schema.sourceChunks.content,
      pageStart: schema.sourceChunks.pageStart,
      pageEnd: schema.sourceChunks.pageEnd,
      section: schema.sourceChunks.section,
      tokenCount: schema.sourceChunks.tokenCount,
    })
    .from(schema.sourceChunks)
    .where(eq(schema.sourceChunks.sourceId, sourceId))
    .orderBy(asc(schema.sourceChunks.idx))
    .limit(limit);
}

/** Bir kaynağa bağlı ders sayısı. */
export async function getSourceLessonCount(sourceId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ c: count() }).from(schema.lessonSources).where(eq(schema.lessonSources.sourceId, sourceId));
  return Number(row?.c ?? 0);
}

/** Bir dersin bağlı kaynak kimlikleri (YZ asistanında kapsam daraltma için). */
export async function lessonSourceIds(lessonId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ sourceId: schema.lessonSources.sourceId })
    .from(schema.lessonSources)
    .where(eq(schema.lessonSources.lessonId, lessonId));
  return rows.map((r) => r.sourceId);
}

/** Yapay zekâ bağlamına verilecek kaynak sayısı özeti. */
export async function approvedReadySourceCount(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.sources.id })
    .from(schema.sources)
    .where(and(eq(schema.sources.approved, true), eq(schema.sources.status, "READY")));
  return rows.length;
}
