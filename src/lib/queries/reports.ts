import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Subspecialty } from "@/db/schema";
import { percentage } from "@/lib/exams/grading";
import { getUserProgress, type UserProgress } from "./progress";

/**
 * Öğretim üyesi / yönetici için asistan performans raporları.
 * Bu sorgular yalnızca personel yetkisi doğrulandıktan sonra çağrılmalıdır (requireStaff).
 */

export type ResidentSummary = {
  id: string;
  name: string;
  title: string | null;
  email: string;
  residencyYear: number | null;
  lastLoginAt: Date | null;
  examsTaken: number;
  averagePercentage: number | null;
  lastMonthly: { title: string; percentage: number; at: Date } | null;
  trendDelta: number | null;
  weakest: { subspecialty: Subspecialty; percentage: number; total: number } | null;
  commentCount: number;
  caseCount: number;
};

export type CohortExamStat = {
  examId: string;
  title: string;
  type: "WEEKLY" | "MONTHLY";
  status: string;
  endsAt: Date | null;
  participants: number; // hedef katılımcı sayısı
  submitted: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
};

export type CohortReport = {
  residents: ResidentSummary[];
  exams: CohortExamStat[];
  subspecialtyAccuracy: { subspecialty: Subspecialty; correct: number; total: number; percentage: number }[];
  activeResidentCount: number;
  cohortAverage: number | null;
};

export async function getCohortReport(filter: { residencyYear?: number } = {}): Promise<CohortReport> {
  const db = await getDb();
  const residentRows = await db
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "RESIDENT"),
        eq(schema.users.status, "ACTIVE"),
        filter.residencyYear ? eq(schema.users.residencyYear, filter.residencyYear) : undefined,
      ),
    )
    .orderBy(asc(schema.users.residencyYear), asc(schema.users.name));

  const ids = residentRows.map((r) => r.id);
  const attempts = ids.length
    ? await db
        .select({ a: schema.examAttempts, e: { id: schema.exams.id, title: schema.exams.title, type: schema.exams.type } })
        .from(schema.examAttempts)
        .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
        .where(and(inArray(schema.examAttempts.userId, ids), isNotNull(schema.examAttempts.submittedAt), isNotNull(schema.examAttempts.score)))
        .orderBy(desc(schema.examAttempts.submittedAt))
    : [];

  const commentCounts = ids.length
    ? await db
        .select({ userId: schema.comments.authorId, c: count() })
        .from(schema.comments)
        .where(and(inArray(schema.comments.authorId, ids), isNull(schema.comments.deletedAt)))
        .groupBy(schema.comments.authorId)
    : [];
  const caseCounts = ids.length
    ? await db
        .select({ userId: schema.clinicalCases.authorId, c: count() })
        .from(schema.clinicalCases)
        .where(inArray(schema.clinicalCases.authorId, ids))
        .groupBy(schema.clinicalCases.authorId)
    : [];
  const commentMap = new Map(commentCounts.map((r) => [r.userId, Number(r.c)]));
  const caseMap = new Map(caseCounts.map((r) => [r.userId, Number(r.c)]));

  const byUser = new Map<string, typeof attempts>();
  for (const row of attempts) {
    const list = byUser.get(row.a.userId) ?? [];
    list.push(row);
    byUser.set(row.a.userId, list);
  }

  const cohortAcc = new Map<string, { correct: number; total: number }>();
  const residents: ResidentSummary[] = residentRows.map((u) => {
    const list = byUser.get(u.id) ?? [];
    const pcts = list.map((r) => percentage(r.a.score, r.a.total));
    const monthly = list.filter((r) => r.e.type === "MONTHLY");
    const acc = new Map<string, { correct: number; total: number }>();
    for (const r of list) {
      for (const [k, v] of Object.entries(r.a.breakdown ?? {})) {
        const cur = acc.get(k) ?? { correct: 0, total: 0 };
        cur.correct += v.correct;
        cur.total += v.total;
        acc.set(k, cur);
        const cc = cohortAcc.get(k) ?? { correct: 0, total: 0 };
        cc.correct += v.correct;
        cc.total += v.total;
        cohortAcc.set(k, cc);
      }
    }
    let weakest: ResidentSummary["weakest"] = null;
    for (const [k, v] of acc.entries()) {
      if (v.total < 3) continue;
      const p = percentage(v.correct, v.total);
      if (!weakest || p < weakest.percentage) weakest = { subspecialty: k as Subspecialty, percentage: p, total: v.total };
    }
    return {
      id: u.id,
      name: u.name,
      title: u.title,
      email: u.email,
      residencyYear: u.residencyYear,
      lastLoginAt: u.lastLoginAt,
      examsTaken: list.length,
      averagePercentage: pcts.length ? Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length) : null,
      lastMonthly: monthly[0]
        ? { title: monthly[0].e.title, percentage: percentage(monthly[0].a.score, monthly[0].a.total), at: monthly[0].a.submittedAt! }
        : null,
      trendDelta: monthly[1] ? percentage(monthly[0].a.score, monthly[0].a.total) - percentage(monthly[1].a.score, monthly[1].a.total) : null,
      weakest,
      commentCount: commentMap.get(u.id) ?? 0,
      caseCount: caseMap.get(u.id) ?? 0,
    };
  });

  // Sınav bazlı kohort istatistikleri (puanlanmış denemesi olan sınavlar)
  const examRows = await db
    .select()
    .from(schema.exams)
    .where(inArray(schema.exams.status, ["OPEN", "CLOSED", "RESULTS_PUBLISHED"]))
    .orderBy(desc(schema.exams.startsAt));
  const exams: CohortExamStat[] = examRows.map((e) => {
    const list = attempts.filter((r) => r.e.id === e.id);
    const pcts = list.map((r) => percentage(r.a.score, r.a.total));
    const targetIds = e.participantUserIds?.length ? e.participantUserIds.filter((id) => ids.includes(id)) : ids;
    return {
      examId: e.id,
      title: e.title,
      type: e.type,
      status: e.status,
      endsAt: e.endsAt,
      participants: targetIds.length,
      submitted: list.length,
      average: pcts.length ? Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length) : null,
      highest: pcts.length ? Math.max(...pcts) : null,
      lowest: pcts.length ? Math.min(...pcts) : null,
    };
  });

  const subspecialtyAccuracy = Array.from(cohortAcc.entries())
    .map(([k, v]) => ({ subspecialty: k as Subspecialty, correct: v.correct, total: v.total, percentage: percentage(v.correct, v.total) }))
    .sort((a, b) => a.percentage - b.percentage);

  const withAvg = residents.filter((r) => r.averagePercentage !== null);
  return {
    residents,
    exams,
    subspecialtyAccuracy,
    activeResidentCount: residents.length,
    cohortAverage: withAvg.length ? Math.round(withAvg.reduce((s, r) => s + (r.averagePercentage ?? 0), 0) / withAvg.length) : null,
  };
}

export type ResidentReport = {
  user: { id: string; name: string; title: string | null; email: string; residencyYear: number | null; lastLoginAt: Date | null; createdAt: Date };
  progress: UserProgress;
  /** Her sınav için kohort ortalaması (karşılaştırma) */
  examCohortAverage: Record<string, number | null>;
  cohortSubspecialty: Record<string, number>;
  recentComments: { id: string; body: string; targetType: string; targetId: string; createdAt: Date; isFacultyCorrection: boolean }[];
  cases: { id: string; title: string; status: string; createdAt: Date }[];
};

export async function getResidentReport(userId: string): Promise<ResidentReport | null> {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, userId), eq(schema.users.role, "RESIDENT"))).limit(1);
  if (!u) return null;
  const progress = await getUserProgress(userId, { staffView: true });

  const examIds = progress.attempts.map((a) => a.examId);
  const examCohortAverage: Record<string, number | null> = {};
  if (examIds.length) {
    const rows = await db
      .select({ examId: schema.examAttempts.examId, score: schema.examAttempts.score, total: schema.examAttempts.total })
      .from(schema.examAttempts)
      .where(and(inArray(schema.examAttempts.examId, examIds), isNotNull(schema.examAttempts.score)));
    const grouped = new Map<string, number[]>();
    for (const r of rows) {
      const l = grouped.get(r.examId) ?? [];
      l.push(percentage(r.score, r.total));
      grouped.set(r.examId, l);
    }
    for (const id of examIds) {
      const l = grouped.get(id) ?? [];
      examCohortAverage[id] = l.length ? Math.round(l.reduce((s, x) => s + x, 0) / l.length) : null;
    }
  }

  const cohort = await getCohortReport();
  const cohortSubspecialty = Object.fromEntries(cohort.subspecialtyAccuracy.map((s) => [s.subspecialty, s.percentage]));

  const recentComments = await db
    .select({
      id: schema.comments.id,
      body: schema.comments.body,
      targetType: schema.comments.targetType,
      targetId: schema.comments.targetId,
      createdAt: schema.comments.createdAt,
      isFacultyCorrection: schema.comments.isFacultyCorrection,
    })
    .from(schema.comments)
    .where(and(eq(schema.comments.authorId, userId), isNull(schema.comments.deletedAt)))
    .orderBy(desc(schema.comments.createdAt))
    .limit(10);
  const cases = await db
    .select({ id: schema.clinicalCases.id, title: schema.clinicalCases.title, status: schema.clinicalCases.status, createdAt: schema.clinicalCases.createdAt })
    .from(schema.clinicalCases)
    .where(eq(schema.clinicalCases.authorId, userId))
    .orderBy(desc(schema.clinicalCases.createdAt))
    .limit(10);

  return {
    user: { id: u.id, name: u.name, title: u.title, email: u.email, residencyYear: u.residencyYear, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt },
    progress,
    examCohortAverage,
    cohortSubspecialty,
    recentComments,
    cases,
  };
}

/** CSV için güvenli hücre (formül enjeksiyonu ve ayraç kaçışı). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
