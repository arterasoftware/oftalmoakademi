import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Exam, ExamAttempt } from "@/db/schema";
import { audit } from "@/lib/audit";
import { gradeAnswers } from "./grading";

/**
 * Sınav yaşam döngüsü: zamana bağlı geçişler okuma anında uygulanır (idempotent).
 *  - APPROVED ve şimdi >= startsAt  -> OPEN
 *  - OPEN ve şimdi > endsAt         -> CLOSED (gönderilmemiş denemeler puanlanır)
 * Güncellemeler `where status = <eski>` koşuluyla yapılır; eşzamanlı çağrılar çakışmaz.
 */
export async function syncExamStatus<T extends Exam>(exam: T, now = new Date()): Promise<T> {
  if (exam.status === "APPROVED" && exam.startsAt && exam.startsAt.getTime() <= now.getTime()) {
    const db = await getDb();
    const rows = await db
      .update(schema.exams)
      .set({ status: "OPEN", updatedAt: now })
      .where(and(eq(schema.exams.id, exam.id), eq(schema.exams.status, "APPROVED")))
      .returning({ id: schema.exams.id });
    if (rows.length) {
      await audit(null, "exam.auto_open", { type: "exam", id: exam.id });
      exam = { ...exam, status: "OPEN" };
    }
  }
  if (exam.status === "OPEN" && exam.endsAt && exam.endsAt.getTime() < now.getTime()) {
    const closed = await closeExam(exam, null, now);
    if (closed) exam = { ...exam, status: "CLOSED" };
  }
  return exam;
}

/**
 * Sınavı kapatır: gönderilmemiş denemeleri mevcut yanıtlarıyla puanlar, durumu CLOSED yapar.
 * @returns true -> bu çağrı kapattı; false -> zaten kapalıydı / durum uygun değildi.
 */
export async function closeExam(exam: Pick<Exam, "id">, actorId: string | null, now = new Date()): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(schema.exams)
    .set({ status: "CLOSED", updatedAt: now })
    .where(and(eq(schema.exams.id, exam.id), eq(schema.exams.status, "OPEN")))
    .returning({ id: schema.exams.id });
  if (!rows.length) return false;

  const pending = await db
    .select()
    .from(schema.examAttempts)
    .where(and(eq(schema.examAttempts.examId, exam.id), isNull(schema.examAttempts.submittedAt)));
  for (const attempt of pending) {
    await finalizeAttempt(attempt, now, "attempt.auto_submit");
  }
  await audit(actorId, actorId ? "exam.close" : "exam.auto_close", { type: "exam", id: exam.id }, { autoSubmitted: pending.length });
  return true;
}

/** Denemeyi mevcut yanıtlarıyla puanlar ve gönderildi olarak işaretler (idempotent). */
export async function finalizeAttempt(
  attempt: ExamAttempt,
  now = new Date(),
  auditAction: "attempt.submit" | "attempt.auto_submit" = "attempt.submit",
): Promise<ExamAttempt> {
  if (attempt.submittedAt) return attempt;
  const db = await getDb();
  const ids = attempt.questionOrder;
  const qs = ids.length
    ? await db
        .select({ id: schema.questions.id, type: schema.questions.type, correctKey: schema.questions.correctKey, pairs: schema.questions.pairs, subspecialty: schema.questions.subspecialty })
        .from(schema.questions)
        .where(inArray(schema.questions.id, ids))
    : [];
  const grade = gradeAnswers(qs, attempt.answers ?? {});
  const [updated] = await db
    .update(schema.examAttempts)
    .set({ submittedAt: now, score: grade.score, total: grade.total, breakdown: grade.breakdown })
    .where(and(eq(schema.examAttempts.id, attempt.id), isNull(schema.examAttempts.submittedAt)))
    .returning();
  if (!updated) {
    const [cur] = await db.select().from(schema.examAttempts).where(eq(schema.examAttempts.id, attempt.id));
    return cur ?? attempt;
  }
  await audit(attempt.userId, auditAction, { type: "exam_attempt", id: attempt.id }, { examId: attempt.examId, score: grade.score, total: grade.total });
  return updated;
}

/** Süresi dolmuş ama gönderilmemiş denemeyi okuma anında kapatır. */
export async function finalizeIfExpired(attempt: ExamAttempt, now = new Date()): Promise<ExamAttempt> {
  if (attempt.submittedAt) return attempt;
  if (attempt.deadlineAt.getTime() <= now.getTime()) return finalizeAttempt(attempt, now, "attempt.auto_submit");
  return attempt;
}
