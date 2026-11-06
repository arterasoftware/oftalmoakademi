import "server-only";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Lesson, Subspecialty, UserRole } from "@/db/schema";
import { isStaff } from "@/lib/auth/dal";

export type LessonListItem = {
  id: string;
  title: string;
  subspecialty: Subspecialty;
  status: Lesson["status"];
  description: string | null;
  hasNotes: boolean;
  materialCount: number;
  publishedAt: Date | null;
  scheduledFor: Date | null;
  updatedAt: Date;
  viewCount: number;
  authorName: string;
  authorId: string;
};

export type LessonFilter = { subspecialty?: Subspecialty; q?: string };

const materialCountSql = sql<number>`(select count(*) from ${schema.lessonMaterials} where ${schema.lessonMaterials.lessonId} = ${schema.lessons.id})`;

const listSelect = {
  id: schema.lessons.id,
  title: schema.lessons.title,
  subspecialty: schema.lessons.subspecialty,
  status: schema.lessons.status,
  description: schema.lessons.description,
  notes: schema.lessons.notes,
  materialCount: materialCountSql,
  publishedAt: schema.lessons.publishedAt,
  scheduledFor: schema.lessons.scheduledFor,
  updatedAt: schema.lessons.updatedAt,
  viewCount: schema.lessons.viewCount,
  authorName: schema.users.name,
  authorId: schema.lessons.authorId,
};

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function filterConds(filter: LessonFilter) {
  const conds = [];
  if (filter.subspecialty) conds.push(eq(schema.lessons.subspecialty, filter.subspecialty));
  if (filter.q) conds.push(ilike(schema.lessons.title, `%${escapeLike(filter.q)}%`));
  return conds;
}

type Row = { notes: string | null; materialCount: number } & Omit<LessonListItem, "hasNotes" | "materialCount">;
const toItem = (r: Row): LessonListItem => {
  const { notes, materialCount, ...rest } = r;
  return { ...rest, hasNotes: Boolean(notes && notes.trim()), materialCount: Number(materialCount ?? 0) };
};

/** Asistanlara gösterilen liste: yalnızca PUBLISHED. */
export async function listPublishedLessons(filter: LessonFilter = {}): Promise<LessonListItem[]> {
  const db = await getDb();
  const rows = await db
    .select(listSelect)
    .from(schema.lessons)
    .innerJoin(schema.users, eq(schema.lessons.authorId, schema.users.id))
    .where(and(eq(schema.lessons.status, "PUBLISHED"), ...filterConds(filter)))
    .orderBy(desc(schema.lessons.publishedAt), desc(schema.lessons.updatedAt));
  return rows.map(toItem);
}

/** Personel için: taslaklar ve arşiv (yayımlananlar ayrı listelenir). */
export async function listStaffLessons(filter: LessonFilter = {}): Promise<LessonListItem[]> {
  const db = await getDb();
  const rows = await db
    .select(listSelect)
    .from(schema.lessons)
    .innerJoin(schema.users, eq(schema.lessons.authorId, schema.users.id))
    .where(and(inArray(schema.lessons.status, ["DRAFT", "ARCHIVED"]), ...filterConds(filter)))
    .orderBy(sql`case ${schema.lessons.status} when 'DRAFT' then 0 else 1 end`, desc(schema.lessons.updatedAt));
  return rows.map(toItem);
}

export type LessonDetail = Lesson & { authorName: string };

/** Ders detayı. Asistanlar için yalnızca PUBLISHED dersler döner; aksi hâlde null. Personel tüm durumları görür. */
export async function getLessonDetail(id: string, viewer: { id: string; role: UserRole }): Promise<LessonDetail | null> {
  const db = await getDb();
  const [row] = await db
    .select({ lesson: schema.lessons, authorName: schema.users.name })
    .from(schema.lessons)
    .innerJoin(schema.users, eq(schema.lessons.authorId, schema.users.id))
    .where(eq(schema.lessons.id, id))
    .limit(1);
  if (!row) return null;
  if (!isStaff(viewer.role) && row.lesson.status !== "PUBLISHED") return null;
  return { ...row.lesson, authorName: row.authorName };
}

/** Server action'lar için ham ders kaydı (yetki kontrolü çağıran tarafta). */
export async function getLessonRaw(id: string): Promise<Lesson | null> {
  const db = await getDb();
  const [l] = await db.select().from(schema.lessons).where(eq(schema.lessons.id, id)).limit(1);
  return l ?? null;
}

export async function getLessonSourceIds(id: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ sourceId: schema.lessonSources.sourceId }).from(schema.lessonSources).where(eq(schema.lessonSources.lessonId, id));
  return rows.map((r) => r.sourceId);
}

/** Not üretiminde kullanılabilecek, metni çıkarılmış materyaller (PDF). */
export async function listLessonTextMaterials(lessonId: string): Promise<{ id: string; title: string; chars: number }[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.lessonMaterials.id, title: schema.lessonMaterials.title, chars: sql<number>`coalesce(length(${schema.lessonMaterials.extractedText}), 0)` })
    .from(schema.lessonMaterials)
    .where(eq(schema.lessonMaterials.lessonId, lessonId))
    .orderBy(asc(schema.lessonMaterials.order));
  return rows.map((r) => ({ ...r, chars: Number(r.chars ?? 0) })).filter((r) => r.chars > 200);
}

export async function incrementLessonViews(id: string) {
  const db = await getDb();
  await db
    .update(schema.lessons)
    .set({ viewCount: sql`${schema.lessons.viewCount} + 1` })
    .where(eq(schema.lessons.id, id));
}
