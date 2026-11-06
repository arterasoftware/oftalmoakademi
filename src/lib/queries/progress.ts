import "server-only";
import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Subspecialty } from "@/db/schema";
import { percentage, resultsVisible } from "@/lib/exams/grading";

export type ProgressAttempt = {
  attemptId: string;
  examId: string;
  examTitle: string;
  examType: "WEEKLY" | "MONTHLY";
  submittedAt: Date;
  /** Sonuçlar henüz görünür değilse null */
  score: number | null;
  total: number | null;
  percentage: number | null;
  resultsPending: boolean;
};

export type SubspecialtyAccuracy = { subspecialty: Subspecialty; correct: number; total: number; percentage: number };

export type UserProgress = {
  attempts: ProgressAttempt[];
  accuracy: SubspecialtyAccuracy[];
  trend: { last: ProgressAttempt; previous: ProgressAttempt | null; delta: number | null } | null;
  commentCount: number;
  caseCount: number;
  overall: { exams: number; averagePercentage: number | null };
};

/**
 * Kullanıcının gönderilmiş denemeleri, alt branş doğruluğu, aylık sınav eğilimi ve içerik sayıları.
 * `staffView`: öğretim üyesi/yönetici görünümü — puanlanmış her deneme, sonuçlar asistana
 * henüz açıklanmamış olsa bile gösterilir. Yalnızca personel yetkisi doğrulandıktan sonra kullanılmalıdır.
 */
export async function getUserProgress(userId: string, opts: { staffView?: boolean } = {}): Promise<UserProgress> {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .select({ a: schema.examAttempts, e: schema.exams })
    .from(schema.examAttempts)
    .innerJoin(schema.exams, eq(schema.examAttempts.examId, schema.exams.id))
    .where(and(eq(schema.examAttempts.userId, userId), isNotNull(schema.examAttempts.submittedAt)))
    .orderBy(desc(schema.examAttempts.submittedAt));

  const attempts: ProgressAttempt[] = [];
  const acc = new Map<string, { correct: number; total: number }>();
  for (const { a, e } of rows) {
    const visible = opts.staffView ? a.score !== null : resultsVisible(e, now);
    attempts.push({
      attemptId: a.id,
      examId: e.id,
      examTitle: e.title,
      examType: e.type,
      submittedAt: a.submittedAt!,
      score: visible ? a.score : null,
      total: visible ? a.total : null,
      percentage: visible ? percentage(a.score, a.total) : null,
      resultsPending: !visible,
    });
    if (visible && a.breakdown) {
      for (const [k, v] of Object.entries(a.breakdown)) {
        const cur = acc.get(k) ?? { correct: 0, total: 0 };
        cur.correct += v.correct;
        cur.total += v.total;
        acc.set(k, cur);
      }
    }
  }

  const accuracy: SubspecialtyAccuracy[] = Array.from(acc.entries())
    .map(([k, v]) => ({ subspecialty: k as Subspecialty, correct: v.correct, total: v.total, percentage: percentage(v.correct, v.total) }))
    .sort((x, y) => y.total - x.total);

  const monthly = attempts.filter((x) => x.examType === "MONTHLY" && x.percentage !== null);
  const trend =
    monthly.length > 0
      ? {
          last: monthly[0],
          previous: monthly[1] ?? null,
          delta: monthly[1] ? (monthly[0].percentage ?? 0) - (monthly[1].percentage ?? 0) : null,
        }
      : null;

  const visibleAttempts = attempts.filter((x) => x.percentage !== null);
  const overall = {
    exams: attempts.length,
    averagePercentage: visibleAttempts.length ? Math.round(visibleAttempts.reduce((s, x) => s + (x.percentage ?? 0), 0) / visibleAttempts.length) : null,
  };

  const [cc] = await db
    .select({ c: count() })
    .from(schema.comments)
    .where(and(eq(schema.comments.authorId, userId), isNull(schema.comments.deletedAt)));
  const [kc] = await db.select({ c: count() }).from(schema.clinicalCases).where(eq(schema.clinicalCases.authorId, userId));

  return { attempts, accuracy, trend, commentCount: Number(cc?.c ?? 0), caseCount: Number(kc?.c ?? 0), overall };
}
