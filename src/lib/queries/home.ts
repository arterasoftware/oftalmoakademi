import "server-only";
import { and, count, desc, eq, gte, isNotNull, lte, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Subspecialty, User } from "@/db/schema";
import { isStaff } from "@/lib/auth/dal";
import { unreadCount } from "@/lib/notifications";

export type HomeLesson = { id: string; title: string; subspecialty: Subspecialty; publishedAt: Date | null; authorName: string };
export type HomeArticle = { id: string; title: string; journal: string | null; weekOf: Date | null; hasSummary: boolean };
export type HomeExam = { id: string; title: string; type: "WEEKLY" | "MONTHLY"; status: "OPEN" | "APPROVED"; startsAt: Date | null; endsAt: Date | null; durationMinutes: number };
/** Olgu DTO'su: yalnızca herkese açık alanlar (tanı/yönetim gibi gizli alanlar asla seçilmez). */
export type HomeCase = { id: string; title: string; subspecialty: Subspecialty; publishedAt: Date | null; authorName: string | null };
export type PendingCounts = { exams: number; articles: number };

export type HomeData = {
  latestLesson: HomeLesson | null;
  weekArticle: HomeArticle | null;
  exams: HomeExam[];
  recentCases: HomeCase[];
  unread: number;
  pending: PendingCounts | null;
};

export async function getHomeData(user: User): Promise<HomeData> {
  const db = await getDb();
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 86400_000);

  const [lessonRows, articleRows, examRows, caseRows, unread] = await Promise.all([
    db
      .select({
        id: schema.lessons.id,
        title: schema.lessons.title,
        subspecialty: schema.lessons.subspecialty,
        publishedAt: schema.lessons.publishedAt,
        authorName: schema.users.name,
      })
      .from(schema.lessons)
      .innerJoin(schema.users, eq(schema.lessons.authorId, schema.users.id))
      .where(eq(schema.lessons.status, "PUBLISHED"))
      .orderBy(desc(schema.lessons.publishedAt))
      .limit(1),
    db
      .select({ id: schema.articles.id, title: schema.articles.title, journal: schema.articles.journal, weekOf: schema.articles.weekOf, summary: schema.articles.summary })
      .from(schema.articles)
      .where(eq(schema.articles.status, "PUBLISHED"))
      .orderBy(desc(schema.articles.publishedAt))
      .limit(1),
    db
      .select({
        id: schema.exams.id,
        title: schema.exams.title,
        type: schema.exams.type,
        status: schema.exams.status,
        startsAt: schema.exams.startsAt,
        endsAt: schema.exams.endsAt,
        durationMinutes: schema.exams.durationMinutes,
        participantUserIds: schema.exams.participantUserIds,
      })
      .from(schema.exams)
      .where(
        or(
          eq(schema.exams.status, "OPEN"),
          and(eq(schema.exams.status, "APPROVED"), isNotNull(schema.exams.startsAt), gte(schema.exams.startsAt, now), lte(schema.exams.startsAt, in14)),
        ),
      )
      .orderBy(schema.exams.startsAt)
      .limit(6),
    db
      .select({
        id: schema.clinicalCases.id,
        title: schema.clinicalCases.title,
        subspecialty: schema.clinicalCases.subspecialty,
        publishedAt: schema.clinicalCases.publishedAt,
        authorName: schema.users.name,
      })
      .from(schema.clinicalCases)
      .leftJoin(schema.users, eq(schema.clinicalCases.authorId, schema.users.id))
      .where(eq(schema.clinicalCases.status, "PUBLISHED"))
      .orderBy(desc(schema.clinicalCases.publishedAt))
      .limit(3),
    unreadCount(user.id),
  ]);

  const staff = isStaff(user.role);
  const exams: HomeExam[] = examRows
    // Katılımcı kısıtı olan sınavlar yalnızca listede olan asistanlara gösterilir; personel hepsini görür.
    .filter((e) => staff || !e.participantUserIds?.length || e.participantUserIds.includes(user.id))
    .map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      status: e.status as "OPEN" | "APPROVED",
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      durationMinutes: e.durationMinutes,
    }));

  let pending: PendingCounts | null = null;
  if (staff) {
    const [[e], [a]] = await Promise.all([
      db.select({ c: count() }).from(schema.exams).where(eq(schema.exams.status, "IN_REVIEW")),
      db.select({ c: count() }).from(schema.articles).where(eq(schema.articles.status, "SUGGESTED")),
    ]);
    pending = { exams: Number(e?.c ?? 0), articles: Number(a?.c ?? 0) };
  }

  const a = articleRows[0];
  return {
    latestLesson: lessonRows[0] ?? null,
    weekArticle: a ? { id: a.id, title: a.title, journal: a.journal, weekOf: a.weekOf, hasSummary: Boolean(a.summary) } : null,
    exams,
    recentCases: caseRows,
    unread,
    pending,
  };
}
