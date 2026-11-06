import "server-only";
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Subspecialty, UserRole } from "@/db/schema";
import { isStaff } from "@/lib/auth/dal";
import { RESIDENT_VISIBLE_STATUSES, type CaseStatus } from "@/lib/status-labels-cases";

export type CaseViewer = { id: string; role: UserRole };

/* -------------------------------------------------------------------------- */
/*  Liste                                                                      */
/* -------------------------------------------------------------------------- */

export type CaseListItem = {
  id: string;
  title: string;
  subspecialty: Subspecialty;
  status: CaseStatus;
  excerpt: string;
  authorId: string;
  authorName: string | null;
  publishedAt: Date;
  updatedAt: Date;
  commentCount: number;
  imageCount: number;
  hasAudio: boolean;
  coverFileId: string | null;
};

export type CaseListFilters = { subspecialty?: Subspecialty; status?: CaseStatus };

const commentCountSql = sql<number>`(
  select count(*) from ${schema.comments}
  where ${schema.comments.targetType} = 'CASE'
    and ${schema.comments.targetId} = ${schema.clinicalCases.id}
    and ${schema.comments.deletedAt} is null
)`;
const imageCountSql = sql<number>`(select count(*) from ${schema.caseImages} where ${schema.caseImages.caseId} = ${schema.clinicalCases.id})`;
const coverSql = sql<string | null>`(select ${schema.caseImages.fileId} from ${schema.caseImages} where ${schema.caseImages.caseId} = ${schema.clinicalCases.id} order by ${schema.caseImages.order}, ${schema.caseImages.id} limit 1)`;

async function selectCases(where: SQL | undefined): Promise<CaseListItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.clinicalCases.id,
      title: schema.clinicalCases.title,
      subspecialty: schema.clinicalCases.subspecialty,
      status: schema.clinicalCases.status,
      body: schema.clinicalCases.body,
      audioFileId: schema.clinicalCases.audioFileId,
      authorId: schema.clinicalCases.authorId,
      authorName: schema.users.name,
      publishedAt: schema.clinicalCases.publishedAt,
      updatedAt: schema.clinicalCases.updatedAt,
      commentCount: commentCountSql,
      imageCount: imageCountSql,
      coverFileId: coverSql,
    })
    .from(schema.clinicalCases)
    .leftJoin(schema.users, eq(schema.clinicalCases.authorId, schema.users.id))
    .where(where)
    .orderBy(desc(schema.clinicalCases.publishedAt), desc(schema.clinicalCases.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    subspecialty: r.subspecialty,
    status: r.status,
    excerpt: r.body.replace(/\s+/g, " ").trim().slice(0, 180),
    authorId: r.authorId,
    authorName: r.authorName,
    publishedAt: r.publishedAt,
    updatedAt: r.updatedAt,
    commentCount: Number(r.commentCount ?? 0),
    imageCount: Number(r.imageCount ?? 0),
    hasAudio: Boolean(r.audioFileId),
    coverFileId: r.coverFileId ?? null,
  }));
}

/**
 * Görüntüleyiciye göre olgu listesi.
 *  - Asistan: tartışmaya açık olgular + kendi (gizlenmiş olsa da) olguları.
 *  - Personel: tüm olgular.
 */
export async function listCasesForViewer(viewer: CaseViewer, filters: CaseListFilters = {}) {
  const extra: SQL[] = [];
  if (filters.subspecialty) extra.push(eq(schema.clinicalCases.subspecialty, filters.subspecialty));
  if (filters.status) extra.push(eq(schema.clinicalCases.status, filters.status));

  let where: SQL | undefined;
  if (isStaff(viewer.role)) {
    where = extra.length ? and(...extra) : undefined;
  } else {
    const visibility = or(inArray(schema.clinicalCases.status, RESIDENT_VISIBLE_STATUSES), eq(schema.clinicalCases.authorId, viewer.id))!;
    where = and(visibility, ...extra);
  }
  const rows = await selectCases(where);
  const open = rows.filter((r) => r.status === "PUBLISHED");
  const hidden = rows.filter((r) => r.status === "HIDDEN");
  return { all: rows, open, hidden };
}

/* -------------------------------------------------------------------------- */
/*  Detay (DTO)                                                                */
/* -------------------------------------------------------------------------- */

export type CaseImageDto = {
  id: string;
  fileId: string;
  caption: string | null;
  order: number;
  width: number | null;
  height: number | null;
};

export type CaseDto = {
  id: string;
  title: string;
  subspecialty: Subspecialty;
  status: CaseStatus;
  body: string;
  audio: { fileId: string; durationSec: number | null } | null;
  images: CaseImageDto[];
  authorId: string;
  author: { name: string; title: string | null; role: UserRole } | null;
  publishedAt: Date;
  updatedAt: Date;
  discussionLocked: boolean;
  aiSummary: string | null;
  /** Görüntüleyici bağlamı */
  isAuthor: boolean;
  isStaff: boolean;
  canEdit: boolean;
};

/** Düzenleme izni: yazar veya personel. */
export function canEditCase(c: { authorId: string }, viewer: CaseViewer): boolean {
  return isStaff(viewer.role) || c.authorId === viewer.id;
}

async function loadImages(caseId: string): Promise<CaseImageDto[]> {
  const db = await getDb();
  return db
    .select({
      id: schema.caseImages.id,
      fileId: schema.caseImages.fileId,
      caption: schema.caseImages.caption,
      order: schema.caseImages.order,
      width: schema.files.width,
      height: schema.files.height,
    })
    .from(schema.caseImages)
    .innerJoin(schema.files, eq(schema.caseImages.fileId, schema.files.id))
    .where(eq(schema.caseImages.caseId, caseId))
    .orderBy(asc(schema.caseImages.order), asc(schema.caseImages.id));
}

/** Olgu detayı. Asistan, başkasının gizlenmiş olgusunu açamaz (null). */
export async function getCaseForViewer(id: string, viewer: CaseViewer): Promise<CaseDto | null> {
  const db = await getDb();
  const [row] = await db
    .select({ c: schema.clinicalCases, u: { name: schema.users.name, title: schema.users.title, role: schema.users.role } })
    .from(schema.clinicalCases)
    .leftJoin(schema.users, eq(schema.clinicalCases.authorId, schema.users.id))
    .where(eq(schema.clinicalCases.id, id))
    .limit(1);
  if (!row) return null;
  const c = row.c;
  const staff = isStaff(viewer.role);
  const isAuthor = c.authorId === viewer.id;
  if (!staff && !isAuthor && !RESIDENT_VISIBLE_STATUSES.includes(c.status)) return null;

  const images = await loadImages(c.id);
  return {
    id: c.id,
    title: c.title,
    subspecialty: c.subspecialty,
    status: c.status,
    body: c.body,
    audio: c.audioFileId ? { fileId: c.audioFileId, durationSec: c.audioDurationSec } : null,
    images,
    authorId: c.authorId,
    author: row.u?.name ? { name: row.u.name, title: row.u.title, role: row.u.role } : null,
    publishedAt: c.publishedAt,
    updatedAt: c.updatedAt,
    discussionLocked: c.discussionLocked,
    aiSummary: c.aiSummary,
    isAuthor,
    isStaff: staff,
    canEdit: canEditCase(c, viewer),
  };
}

/* -------------------------------------------------------------------------- */
/*  Düzenleme                                                                  */
/* -------------------------------------------------------------------------- */

export type CaseForEdit = {
  record: typeof schema.clinicalCases.$inferSelect;
  images: CaseImageDto[];
};

/** Düzenleme sayfası verisi: yalnızca yazar veya personel; diğerleri null (notFound). */
export async function getCaseForEdit(id: string, viewer: CaseViewer): Promise<CaseForEdit | null> {
  const db = await getDb();
  const [record] = await db.select().from(schema.clinicalCases).where(eq(schema.clinicalCases.id, id)).limit(1);
  if (!record) return null;
  if (!canEditCase(record, viewer)) return null;
  return { record, images: await loadImages(id) };
}

/** Yapay zekâ ipucu için olgu metni ve görsel açıklamaları. */
export async function getCaseTextForAi(id: string) {
  const db = await getDb();
  const [c] = await db
    .select({ id: schema.clinicalCases.id, title: schema.clinicalCases.title, subspecialty: schema.clinicalCases.subspecialty, status: schema.clinicalCases.status, body: schema.clinicalCases.body })
    .from(schema.clinicalCases)
    .where(eq(schema.clinicalCases.id, id))
    .limit(1);
  if (!c) return null;
  const captions = await db.select({ caption: schema.caseImages.caption }).from(schema.caseImages).where(eq(schema.caseImages.caseId, id));
  return { ...c, imageCaptions: captions.map((x) => x.caption).filter((x): x is string => Boolean(x)) };
}
