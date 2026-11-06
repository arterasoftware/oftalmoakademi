import "server-only";
import { shuffledRightItems, TRUE_FALSE_OPTIONS } from "@/lib/exams/grading";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Exam, ExamAttempt, Question, QuestionOption, User } from "@/db/schema";
import { isStaff } from "@/lib/auth/dal";
import { syncExamStatus, finalizeIfExpired } from "@/lib/exams/lifecycle";

/* -------------------------------------------------------------------------- */
/*  DTO'lar                                                                    */
/* -------------------------------------------------------------------------- */

/** Katılımcıya gönderilen soru: doğru anahtar ve açıklama ASLA yer almaz. */
export type RunnerQuestion = {
  id: string;
  type: Question["type"];
  stem: string;
  /** MC / MULTI_SELECT / TRUE_FALSE seçenekleri (doğru anahtar yok) */
  options: QuestionOption[];
  /** MATCHING: sol öğeler sırayla; sağ öğeler karıştırılmış (eşleşme verilmez) */
  matching: { left: string[]; right: string[] } | null;
  imageFileId: string | null;
  subspecialty: Question["subspecialty"];
};

export function toRunnerQuestion(q: Question): RunnerQuestion {
  const pairs = q.pairs ?? [];
  return {
    id: q.id,
    type: q.type,
    stem: q.stem,
    options: q.type === "TRUE_FALSE" ? TRUE_FALSE_OPTIONS : q.type === "MATCHING" ? [] : q.options,
    matching: q.type === "MATCHING" ? { left: pairs.map((p) => p.left), right: shuffledRightItems(q.id, pairs) } : null,
    imageFileId: q.imageFileId,
    subspecialty: q.subspecialty,
  };
}

export type ExamListItem = Exam & {
  questionCount: number;
  approvedQuestionCount: number;
  attempt: ExamAttempt | null;
  lessonTitle: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Yardımcılar                                                                */
/* -------------------------------------------------------------------------- */

/** Katılımcı kısıtı: boş liste -> tüm aktif asistanlar. Personel katılımcı değildir. */
export function canParticipate(exam: Pick<Exam, "participantUserIds">, user: Pick<User, "id" | "role" | "status">): boolean {
  if (user.role !== "RESIDENT" || user.status !== "ACTIVE") return false;
  const ids = exam.participantUserIds ?? [];
  return ids.length === 0 || ids.includes(user.id);
}

async function questionCounts(examIds: string[]) {
  const map = new Map<string, { total: number; approved: number }>();
  if (!examIds.length) return map;
  const db = await getDb();
  const rows = await db
    .select({ examId: schema.questions.examId, status: schema.questions.status, c: count() })
    .from(schema.questions)
    .where(inArray(schema.questions.examId, examIds))
    .groupBy(schema.questions.examId, schema.questions.status);
  for (const r of rows) {
    const cur = map.get(r.examId) ?? { total: 0, approved: 0 };
    cur.total += Number(r.c);
    if (r.status === "APPROVED") cur.approved += Number(r.c);
    map.set(r.examId, cur);
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/*  Listeler                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sınav listesi. Personel tüm sınavları görür; asistan yalnızca katılımcısı olduğu
 * ve en az APPROVED (zamanlanmış) durumundaki sınavları görür.
 */
export async function listExamsForUser(user: User): Promise<ExamListItem[]> {
  const db = await getDb();
  const staff = isStaff(user.role);
  const rows = await db
    .select({ exam: schema.exams, lessonTitle: schema.lessons.title })
    .from(schema.exams)
    .leftJoin(schema.lessons, eq(schema.exams.lessonId, schema.lessons.id))
    .where(staff ? undefined : inArray(schema.exams.status, ["APPROVED", "OPEN", "CLOSED", "RESULTS_PUBLISHED"]))
    .orderBy(desc(schema.exams.startsAt), desc(schema.exams.createdAt));

  const now = new Date();
  const synced: { exam: Exam; lessonTitle: string | null }[] = [];
  for (const r of rows) {
    const exam = await syncExamStatus(r.exam, now);
    if (!staff && !canParticipate(exam, user)) continue;
    synced.push({ exam, lessonTitle: r.lessonTitle });
  }

  const ids = synced.map((s) => s.exam.id);
  const counts = await questionCounts(ids);
  const attempts = ids.length
    ? await db
        .select()
        .from(schema.examAttempts)
        .where(and(eq(schema.examAttempts.userId, user.id), inArray(schema.examAttempts.examId, ids)))
    : [];
  const attemptByExam = new Map<string, ExamAttempt>();
  for (const a of attempts) attemptByExam.set(a.examId, await finalizeIfExpired(a, now));

  return synced.map(({ exam, lessonTitle }) => ({
    ...exam,
    lessonTitle,
    questionCount: counts.get(exam.id)?.total ?? 0,
    approvedQuestionCount: counts.get(exam.id)?.approved ?? 0,
    attempt: attemptByExam.get(exam.id) ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Tekil kayıtlar                                                             */
/* -------------------------------------------------------------------------- */

export async function getExamById(id: string): Promise<Exam | null> {
  const db = await getDb();
  const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
  if (!exam) return null;
  return syncExamStatus(exam);
}

/** Personel görünümü: sınav + tüm sorular (anahtar/açıklama dâhil) + deneme özeti. */
export async function getExamForStaff(id: string) {
  const exam = await getExamById(id);
  if (!exam) return null;
  const db = await getDb();
  const qs = await db.select().from(schema.questions).where(eq(schema.questions.examId, id)).orderBy(asc(schema.questions.order), asc(schema.questions.createdAt));
  const attemptRows = await db
    .select({ a: schema.examAttempts, userName: schema.users.name })
    .from(schema.examAttempts)
    .innerJoin(schema.users, eq(schema.examAttempts.userId, schema.users.id))
    .where(eq(schema.examAttempts.examId, id))
    .orderBy(desc(schema.examAttempts.startedAt));
  let lessonTitle: string | null = null;
  if (exam.lessonId) {
    const [l] = await db.select({ title: schema.lessons.title }).from(schema.lessons).where(eq(schema.lessons.id, exam.lessonId));
    lessonTitle = l?.title ?? null;
  }
  return { exam, questions: qs, attempts: attemptRows.map((r) => ({ ...r.a, userName: r.userName })), lessonTitle };
}

/** Sınavın onaylı soruları (puanlama ve deneme başlatma için). */
export async function getApprovedQuestions(examId: string): Promise<Question[]> {
  const db = await getDb();
  return db
    .select()
    .from(schema.questions)
    .where(and(eq(schema.questions.examId, examId), eq(schema.questions.status, "APPROVED")))
    .orderBy(asc(schema.questions.order), asc(schema.questions.createdAt));
}

export async function getAttempt(examId: string, userId: string): Promise<ExamAttempt | null> {
  const db = await getDb();
  const [a] = await db
    .select()
    .from(schema.examAttempts)
    .where(and(eq(schema.examAttempts.examId, examId), eq(schema.examAttempts.userId, userId)))
    .limit(1);
  if (!a) return null;
  return finalizeIfExpired(a);
}

/**
 * Katılımcı görünümü. Sorular yalnızca OPEN durumda ve deneme varsa, güvenli DTO olarak döner.
 * Sonuç incelemesi (doğru anahtar/açıklama) yalnızca `resultsVisible` ise `reviewQuestions` ile döner.
 */
export async function getExamForParticipant(id: string, user: User) {
  const exam = await getExamById(id);
  if (!exam) return null;
  const db = await getDb();
  const attempt = await getAttempt(id, user.id);
  let lessonTitle: string | null = null;
  if (exam.lessonId) {
    const [l] = await db.select({ title: schema.lessons.title }).from(schema.lessons).where(eq(schema.lessons.id, exam.lessonId));
    lessonTitle = l?.title ?? null;
  }
  return { exam, attempt, lessonTitle };
}

/** Denemenin soru sırasına göre soruları getirir (tam kayıt; çağıran DTO'ya çevirmelidir). */
export async function getQuestionsForAttempt(attempt: ExamAttempt): Promise<Question[]> {
  if (!attempt.questionOrder.length) return [];
  const db = await getDb();
  const qs = await db.select().from(schema.questions).where(inArray(schema.questions.id, attempt.questionOrder));
  const byId = new Map(qs.map((q) => [q.id, q]));
  return attempt.questionOrder.map((qid) => byId.get(qid)).filter((q): q is Question => Boolean(q));
}

/* -------------------------------------------------------------------------- */
/*  Form seçenekleri                                                           */
/* -------------------------------------------------------------------------- */

export async function getLessonOptions() {
  const db = await getDb();
  return db
    .select({ id: schema.lessons.id, title: schema.lessons.title, subspecialty: schema.lessons.subspecialty })
    .from(schema.lessons)
    .where(inArray(schema.lessons.status, ["PUBLISHED", "DRAFT"]))
    .orderBy(asc(schema.lessons.title));
}

export async function getResidentOptions() {
  const db = await getDb();
  return db
    .select({ id: schema.users.id, name: schema.users.name, residencyYear: schema.users.residencyYear })
    .from(schema.users)
    .where(and(eq(schema.users.role, "RESIDENT"), eq(schema.users.status, "ACTIVE")))
    .orderBy(asc(schema.users.name));
}
