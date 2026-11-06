"use server";

import { normalizeMultiKey, TRUE_FALSE_OPTIONS } from "@/lib/exams/grading";

import { randomInt } from "node:crypto";
import { and, eq, isNull, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { subspecialtyEnum, type Exam, type QuestionOption } from "@/db/schema";
import { assertStaff, assertUser, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { uuidSchema, longText, shortText } from "@/lib/validation";
import { aiAvailable, AiUnavailableError } from "@/lib/ai/client";
import { generateQuizQuestions } from "@/lib/ai/quiz-gen";
import { closeExam, finalizeAttempt, syncExamStatus } from "@/lib/exams/lifecycle";
import { canParticipate, getApprovedQuestions, getResidentOptions } from "@/lib/queries/exams";
import { formatDateTime } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Yardımcılar                                                                */
/* -------------------------------------------------------------------------- */

const optionalDate = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "GEÇERSİZ" : d;
}, z.union([z.date(), z.literal("GEÇERSİZ")]).optional());

const examFormSchema = z
  .object({
    title: shortText(200).min(3, "Başlık en az 3 karakter olmalıdır."),
    type: z.enum(["WEEKLY", "MONTHLY"]),
    description: longText(5000).optional(),
    lessonId: z.union([uuidSchema, z.literal("")]).optional(),
    durationMinutes: z.coerce.number().int().min(1, "En az 1 dakika.").max(600, "En fazla 600 dakika."),
    startsAt: optionalDate,
    endsAt: optionalDate,
    resultsAt: optionalDate,
    shuffleQuestions: z.enum(["on"]).optional(),
    participants: z.array(uuidSchema).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.startsAt === "GEÇERSİZ") ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Geçerli bir tarih girin." });
    if (d.endsAt === "GEÇERSİZ") ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Geçerli bir tarih girin." });
    if (d.resultsAt === "GEÇERSİZ") ctx.addIssue({ code: "custom", path: ["resultsAt"], message: "Geçerli bir tarih girin." });
    if (d.startsAt instanceof Date && d.endsAt instanceof Date && d.endsAt.getTime() <= d.startsAt.getTime()) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Bitiş, başlangıçtan sonra olmalıdır." });
    }
    if (d.endsAt instanceof Date && d.resultsAt instanceof Date && d.resultsAt.getTime() < d.endsAt.getTime()) {
      ctx.addIssue({ code: "custom", path: ["resultsAt"], message: "Sonuç zamanı bitişten önce olamaz." });
    }
  });

function readExamForm(formData: FormData) {
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  raw.participants = formData.getAll("participants").filter((v) => typeof v === "string" && v !== "");
  return examFormSchema.safeParse(raw);
}

async function loadExam(id: string): Promise<Exam | null> {
  const db = await getDb();
  const [exam] = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).limit(1);
  return exam ? syncExamStatus(exam) : null;
}

const EDITABLE: Exam["status"][] = ["DRAFT", "IN_REVIEW", "APPROVED"];

function revalidateExam(id: string) {
  revalidatePath("/sinavlar");
  revalidatePath(`/sinavlar/${id}`);
  revalidatePath(`/sinavlar/${id}/duzenle`);
  revalidatePath("/takvim");
  revalidatePath("/panel");
}

function handleError(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof AuthError) return fail(e.message);
  if (e instanceof AiUnavailableError) return fail(e.message);
  console.error(e);
  return fail(fallback);
}

/** Katılımcı kullanıcı kimlikleri: kısıt boşsa tüm aktif asistanlar. */
async function participantIds(exam: Exam): Promise<string[]> {
  if (exam.participantUserIds?.length) return exam.participantUserIds;
  return (await getResidentOptions()).map((r) => r.id);
}

/** Kriptografik rastgelelikle Fisher-Yates karıştırma. */
function secureShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* -------------------------------------------------------------------------- */
/*  Sınav oluşturma / ayarlar                                                  */
/* -------------------------------------------------------------------------- */

export async function createExamAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let newId: string;
  try {
    const user = await assertStaff();
    const parsed = readExamForm(formData);
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const db = await getDb();
    const [row] = await db
      .insert(schema.exams)
      .values({
        title: d.title,
        type: d.type,
        description: d.description || null,
        lessonId: d.lessonId || null,
        durationMinutes: d.durationMinutes,
        startsAt: d.startsAt instanceof Date ? d.startsAt : null,
        endsAt: d.endsAt instanceof Date ? d.endsAt : null,
        resultsAt: d.resultsAt instanceof Date ? d.resultsAt : null,
        shuffleQuestions: d.shuffleQuestions === "on",
        participantUserIds: d.participants?.length ? d.participants : null,
        createdBy: user.id,
      })
      .returning({ id: schema.exams.id });
    newId = row.id;
    await audit(user.id, "exam.create", { type: "exam", id: row.id }, { type: d.type, title: d.title });
    revalidatePath("/sinavlar");
  } catch (e) {
    return handleError(e, "Sınav oluşturulamadı.");
  }
  redirect(`/sinavlar/${newId}/duzenle`);
}

export async function updateExamSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertStaff();
    const idParsed = uuidSchema.safeParse(formData.get("examId"));
    if (!idParsed.success) return fail("Geçersiz sınav.");
    const exam = await loadExam(idParsed.data);
    if (!exam) return fail("Sınav bulunamadı.");
    if (!EDITABLE.includes(exam.status)) return fail("Açılmış veya kapanmış sınavın ayarları değiştirilemez.");
    const parsed = readExamForm(formData);
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const db = await getDb();
    await db
      .update(schema.exams)
      .set({
        title: d.title,
        type: d.type,
        description: d.description || null,
        lessonId: d.lessonId || null,
        durationMinutes: d.durationMinutes,
        startsAt: d.startsAt instanceof Date ? d.startsAt : null,
        endsAt: d.endsAt instanceof Date ? d.endsAt : null,
        resultsAt: d.resultsAt instanceof Date ? d.resultsAt : null,
        shuffleQuestions: d.shuffleQuestions === "on",
        participantUserIds: d.participants?.length ? d.participants : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.exams.id, exam.id));
    // Zamanlanmış sınavın takvim kaydını güncel tut
    if (exam.status === "APPROVED") {
      if (d.startsAt instanceof Date) {
        await db
          .update(schema.calendarEvents)
          .set({ title: `Sınav: ${d.title}`, startsAt: d.startsAt, endsAt: d.endsAt instanceof Date ? d.endsAt : null })
          .where(and(eq(schema.calendarEvents.kind, "EXAM"), eq(schema.calendarEvents.refId, exam.id)));
      }
    }
    await audit(user.id, "exam.update", { type: "exam", id: exam.id });
    revalidateExam(exam.id);
    return success(undefined, "Sınav ayarları kaydedildi.");
  } catch (e) {
    return handleError(e, "Ayarlar kaydedilemedi.");
  }
}

export async function deleteExamAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const id = uuidSchema.parse(formData.get("examId"));
  const exam = await loadExam(id);
  if (!exam) return;
  if (!["DRAFT", "IN_REVIEW"].includes(exam.status)) throw new Error("Yalnızca taslak veya incelemedeki sınav silinebilir.");
  const db = await getDb();
  await db.delete(schema.exams).where(eq(schema.exams.id, id));
  await audit(user.id, "exam.delete", { type: "exam", id }, { title: exam.title });
  revalidatePath("/sinavlar");
  redirect("/sinavlar");
}

/* -------------------------------------------------------------------------- */
/*  Sorular                                                                    */
/* -------------------------------------------------------------------------- */

const optionKey = z.enum(["A", "B", "C", "D", "E"]);
const QUESTION_TYPES = ["MULTIPLE_CHOICE", "MULTI_SELECT", "TRUE_FALSE", "MATCHING"] as const;

const questionSchema = z.object({
  examId: uuidSchema,
  questionId: z.union([uuidSchema, z.literal("")]).optional(),
  type: z.enum(QUESTION_TYPES).default("MULTIPLE_CHOICE"),
  stem: longText(5000).min(10, "Soru kökü en az 10 karakter olmalıdır."),
  optionA: shortText(1000).optional().or(z.literal("")),
  optionB: shortText(1000).optional().or(z.literal("")),
  optionC: shortText(1000).optional().or(z.literal("")),
  optionD: shortText(1000).optional().or(z.literal("")),
  optionE: shortText(1000).optional().or(z.literal("")),
  /** MC/TF: tek anahtar; MULTI_SELECT: form birden çok 'correctKeys' gönderir */
  correctKey: z.string().trim().max(20).optional().or(z.literal("")),
  /** MATCHING: her satır "sol | sağ" */
  pairsText: longText(8000).optional().or(z.literal("")),
  explanation: longText(5000).min(5, "Açıklama girin."),
  subspecialty: z.enum(subspecialtyEnum.enumValues),
  difficulty: z.coerce.number().int().min(1).max(3),
  sourceRef: shortText(500).optional(),
});

type QuestionPayload = { type: (typeof QUESTION_TYPES)[number]; options: QuestionOption[]; correctKey: string; pairs: { left: string; right: string }[] | null };

/** Tür bazlı doğrulama: seçenekler, doğru anahtar(lar) veya eşleştirme çiftleri. */
function buildQuestionPayload(d: z.infer<typeof questionSchema>, multiKeys: string[]): QuestionPayload | { error: string; fieldErrors?: Record<string, string[]> } {
  const opts = (["A", "B", "C", "D", "E"] as const).map((k) => ({ key: k, text: (d[`option${k}`] ?? "").trim() }));
  if (d.type === "MULTIPLE_CHOICE") {
    const filled = opts.filter((o) => o.text);
    if (filled.length < 3) return { error: "Çoktan seçmeli soruda en az 3 seçenek doldurun." };
    if (opts.some((o, i) => !o.text && opts.slice(i + 1).some((x) => x.text))) return { error: "Seçenekleri A'dan başlayarak boşluk bırakmadan doldurun." };
    const ck = optionKey.safeParse(d.correctKey);
    if (!ck.success || !filled.some((o) => o.key === ck.data)) return { error: "Doğru seçeneği seçin.", fieldErrors: { correctKey: ["Doğru seçenek dolu bir seçenek olmalı."] } };
    return { type: d.type, options: filled, correctKey: ck.data, pairs: null };
  }
  if (d.type === "MULTI_SELECT") {
    const filled = opts.filter((o) => o.text);
    if (filled.length < 3) return { error: "Çoklu seçim sorusunda en az 3 seçenek doldurun." };
    if (opts.some((o, i) => !o.text && opts.slice(i + 1).some((x) => x.text))) return { error: "Seçenekleri A'dan başlayarak boşluk bırakmadan doldurun." };
    const keys = multiKeys.map((k) => k.toUpperCase()).filter((k) => filled.some((o) => o.key === k));
    if (keys.length < 1) return { error: "En az bir doğru seçenek işaretleyin.", fieldErrors: { correctKeys: ["En az bir doğru seçenek."] } };
    if (keys.length === filled.length) return { error: "Tüm seçenekler doğru olamaz." };
    return { type: d.type, options: filled, correctKey: normalizeMultiKey(keys), pairs: null };
  }
  if (d.type === "TRUE_FALSE") {
    if (d.correctKey !== "A" && d.correctKey !== "B") return { error: "Doğru yanıtı (Doğru/Yanlış) seçin.", fieldErrors: { correctKey: ["Seçim gerekli."] } };
    return { type: d.type, options: TRUE_FALSE_OPTIONS, correctKey: d.correctKey, pairs: null };
  }
  // MATCHING
  const pairs = (d.pairsText ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [left, ...rest] = l.split("|");
      return { left: (left ?? "").trim(), right: rest.join("|").trim() };
    });
  if (pairs.length < 3 || pairs.length > 8) return { error: "Eşleştirme için 3-8 çift girin (her satır: sol | sağ).", fieldErrors: { pairsText: ["3-8 satır, her satırda 'sol | sağ'."] } };
  if (pairs.some((p) => !p.left || !p.right)) return { error: "Her satırda hem sol hem sağ öğe olmalı (ayraç: |).", fieldErrors: { pairsText: ["Eksik öğe var."] } };
  if (new Set(pairs.map((p) => p.right)).size !== pairs.length) return { error: "Sağ öğeler birbirinden farklı olmalı.", fieldErrors: { pairsText: ["Sağ öğeler tekrar ediyor."] } };
  return { type: d.type, options: [], correctKey: "MATCH", pairs };
}

/** Soru ekle veya güncelle. Güncellenen soru yeniden onay bekler (DRAFT). */
export async function saveQuestionAction(_prev: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await assertStaff();
    const parsed = questionSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const exam = await loadExam(d.examId);
    if (!exam) return fail("Sınav bulunamadı.");
    if (!EDITABLE.includes(exam.status)) return fail("Açılmış veya kapanmış sınavın soruları değiştirilemez.");
    const payload = buildQuestionPayload(d, formData.getAll("correctKeys").map(String));
    if ("error" in payload) return fail(payload.error, payload.fieldErrors);
    const { options, correctKey, pairs, type } = payload;
    const db = await getDb();
    let id: string;
    if (d.questionId) {
      const [existing] = await db.select({ id: schema.questions.id, examId: schema.questions.examId }).from(schema.questions).where(eq(schema.questions.id, d.questionId));
      if (!existing || existing.examId !== exam.id) return fail("Soru bulunamadı.");
      await db
        .update(schema.questions)
        .set({
          type,
          pairs,
          stem: d.stem,
          options,
          correctKey,
          explanation: d.explanation,
          subspecialty: d.subspecialty,
          difficulty: d.difficulty,
          sourceRef: d.sourceRef || null,
          status: "DRAFT",
          approvedBy: null,
        })
        .where(eq(schema.questions.id, existing.id));
      id = existing.id;
      await audit(user.id, "question.update", { type: "question", id }, { examId: exam.id });
    } else {
      const [m] = await db.select({ m: max(schema.questions.order) }).from(schema.questions).where(eq(schema.questions.examId, exam.id));
      const [row] = await db
        .insert(schema.questions)
        .values({
          examId: exam.id,
          order: (m?.m ?? 0) + 1,
          type,
          pairs,
          stem: d.stem,
          options,
          correctKey,
          explanation: d.explanation,
          subspecialty: d.subspecialty,
          difficulty: d.difficulty,
          sourceRef: d.sourceRef || null,
          lessonId: exam.lessonId,
          aiGenerated: false,
          status: "DRAFT",
        })
        .returning({ id: schema.questions.id });
      id = row.id;
      await audit(user.id, "question.create", { type: "question", id }, { examId: exam.id });
    }
    // Onaylı sınavda soru değişti -> yeniden inceleme
    if (exam.status === "APPROVED") {
      await db.update(schema.exams).set({ status: "IN_REVIEW", updatedAt: new Date() }).where(eq(schema.exams.id, exam.id));
      await audit(user.id, "exam.revert_to_review", { type: "exam", id: exam.id }, { reason: "question_changed" });
    }
    revalidateExam(exam.id);
    return success({ id }, "Soru kaydedildi.");
  } catch (e) {
    return handleError(e, "Soru kaydedilemedi.");
  }
}

const examQuestionSchema = z.object({ examId: uuidSchema, questionId: uuidSchema });

export async function deleteQuestionAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const d = examQuestionSchema.parse(Object.fromEntries(formData.entries()));
  const exam = await loadExam(d.examId);
  if (!exam || !EDITABLE.includes(exam.status)) throw new Error("Bu sınavın soruları değiştirilemez.");
  const db = await getDb();
  await db.delete(schema.questions).where(and(eq(schema.questions.id, d.questionId), eq(schema.questions.examId, exam.id)));
  await audit(user.id, "question.delete", { type: "question", id: d.questionId }, { examId: exam.id });
  if (exam.status === "APPROVED") {
    await db.update(schema.exams).set({ status: "IN_REVIEW", updatedAt: new Date() }).where(eq(schema.exams.id, exam.id));
  }
  revalidateExam(exam.id);
}

const reviewSchema = examQuestionSchema.extend({ decision: z.enum(["APPROVED", "REJECTED"]) });

/** Tek soruyu onayla / reddet (approvedBy kaydedilir). */
export async function reviewQuestionAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const d = reviewSchema.parse(Object.fromEntries(formData.entries()));
  const exam = await loadExam(d.examId);
  if (!exam || !EDITABLE.includes(exam.status)) throw new Error("Bu sınavın soruları değiştirilemez.");
  const db = await getDb();
  await db
    .update(schema.questions)
    .set({ status: d.decision, approvedBy: d.decision === "APPROVED" ? user.id : null })
    .where(and(eq(schema.questions.id, d.questionId), eq(schema.questions.examId, exam.id)));
  await audit(user.id, d.decision === "APPROVED" ? "question.approve" : "question.reject", { type: "question", id: d.questionId }, { examId: exam.id });
  revalidateExam(exam.id);
}

export async function approveAllQuestionsAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const examId = uuidSchema.parse(formData.get("examId"));
  const exam = await loadExam(examId);
  if (!exam || !EDITABLE.includes(exam.status)) throw new Error("Bu sınavın soruları değiştirilemez.");
  const db = await getDb();
  const rows = await db
    .update(schema.questions)
    .set({ status: "APPROVED", approvedBy: user.id })
    .where(and(eq(schema.questions.examId, exam.id), eq(schema.questions.status, "DRAFT")))
    .returning({ id: schema.questions.id });
  await audit(user.id, "question.approve_all", { type: "exam", id: exam.id }, { count: rows.length });
  revalidateExam(exam.id);
}

/* -------------------------------------------------------------------------- */
/*  Yapay zekâ ile soru üretimi                                                */
/* -------------------------------------------------------------------------- */

const genSchema = z.object({
  examId: uuidSchema,
  count: z.coerce.number().int().min(1, "En az 1 soru.").max(10, "En fazla 10 soru."),
  subspecialty: z.enum(subspecialtyEnum.enumValues),
  lessonId: z.union([uuidSchema, z.literal("")]).optional(),
  topic: shortText(300).optional(),
  mix: z.enum(["BALANCED", "EASY", "MEDIUM", "HARD"]),
});

export async function generateQuestionsAction(
  _prev: ActionResult<{ added: number; dropped: number; titles: string[] }> | null,
  formData: FormData,
): Promise<ActionResult<{ added: number; dropped: number; titles: string[] }>> {
  try {
    const user = await assertStaff();
    if (!aiAvailable()) return fail("Yapay zekâ yapılandırılmamış (ANTHROPIC_API_KEY eksik).");
    const parsed = genSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const exam = await loadExam(d.examId);
    if (!exam) return fail("Sınav bulunamadı.");
    if (!EDITABLE.includes(exam.status)) return fail("Açılmış veya kapanmış sınava soru eklenemez.");
    if (!(await consumeRateLimit(`ai:${user.id}`, RATE_LIMITS.aiPerUser.limit, RATE_LIMITS.aiPerUser.window)))
      return fail("Yapay zekâ kullanım sınırına ulaştınız. Lütfen daha sonra tekrar deneyin.");

    const lessonId = d.lessonId || exam.lessonId || null;
    const result = await generateQuizQuestions({
      userId: user.id,
      count: d.count,
      subspecialty: d.subspecialty,
      lessonId,
      topic: d.topic || null,
      mix: d.mix,
    });
    if (!result.questions.length) return fail("Kullanılabilir soru üretilemedi. Kapsamı daraltıp tekrar deneyin.");

    const db = await getDb();
    const [m] = await db.select({ m: max(schema.questions.order) }).from(schema.questions).where(eq(schema.questions.examId, exam.id));
    let order = m?.m ?? 0;
    const inserted = await db
      .insert(schema.questions)
      .values(
        result.questions.map((q) => ({
          examId: exam.id,
          order: ++order,
          stem: q.stem,
          options: q.options,
          correctKey: q.correctKey,
          explanation: q.explanation,
          subspecialty: q.subspecialty,
          difficulty: q.difficulty,
          sourceRef: q.sourceRef || null,
          lessonId,
          aiGenerated: true,
          status: "DRAFT" as const,
        })),
      )
      .returning({ id: schema.questions.id });
    if (exam.status === "APPROVED") {
      await db.update(schema.exams).set({ status: "IN_REVIEW", updatedAt: new Date() }).where(eq(schema.exams.id, exam.id));
    }
    await audit(user.id, "question.ai_generate", { type: "exam", id: exam.id }, { count: inserted.length, dropped: result.dropped, model: result.model, lessonId });
    revalidateExam(exam.id);
    return success(
      { added: inserted.length, dropped: result.dropped, titles: result.contextTitles },
      `${inserted.length} taslak soru eklendi. Her soru yayımlanmadan önce onaylanmalıdır.`,
    );
  } catch (e) {
    return handleError(e, "Soru üretilemedi.");
  }
}

/* -------------------------------------------------------------------------- */
/*  Sınav iş akışı                                                             */
/* -------------------------------------------------------------------------- */

const transitionSchema = z.object({
  examId: uuidSchema,
  action: z.enum(["SUBMIT_REVIEW", "APPROVE", "OPEN_NOW", "CLOSE", "PUBLISH_RESULTS", "BACK_TO_DRAFT"]),
});

async function assertReadyForApproval(exam: Exam): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select({ status: schema.questions.status }).from(schema.questions).where(eq(schema.questions.examId, exam.id));
  if (rows.length === 0) return "Sınavda en az bir soru olmalıdır.";
  const notApproved = rows.filter((r) => r.status !== "APPROVED").length;
  if (notApproved > 0) return `${notApproved} soru henüz onaylanmamış veya reddedilmiş. Reddedilen soruları silin, taslakları onaylayın.`;
  return null;
}

export async function transitionExamAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertStaff();
    const parsed = transitionSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Geçersiz istek.");
    const { examId, action } = parsed.data;
    const exam = await loadExam(examId);
    if (!exam) return fail("Sınav bulunamadı.");
    const db = await getDb();
    const now = new Date();

    switch (action) {
      case "SUBMIT_REVIEW": {
        if (exam.status !== "DRAFT") return fail("Yalnızca taslak sınav incelemeye gönderilebilir.");
        await db.update(schema.exams).set({ status: "IN_REVIEW", updatedAt: now }).where(eq(schema.exams.id, exam.id));
        await audit(user.id, "exam.submit_review", { type: "exam", id: exam.id });
        revalidateExam(exam.id);
        return success(undefined, "Sınav incelemeye gönderildi.");
      }
      case "BACK_TO_DRAFT": {
        if (exam.status !== "IN_REVIEW") return fail("Yalnızca incelemedeki sınav taslağa döndürülebilir.");
        await db.update(schema.exams).set({ status: "DRAFT", updatedAt: now }).where(eq(schema.exams.id, exam.id));
        await audit(user.id, "exam.back_to_draft", { type: "exam", id: exam.id });
        revalidateExam(exam.id);
        return success(undefined, "Sınav taslağa döndürüldü.");
      }
      case "APPROVE": {
        if (exam.status !== "IN_REVIEW") return fail("Yalnızca incelemedeki sınav onaylanabilir.");
        const problem = await assertReadyForApproval(exam);
        if (problem) return fail(problem);
        if (!exam.startsAt || !exam.endsAt) return fail("Onaylamak için başlangıç ve bitiş zamanı girilmelidir.");
        if (exam.endsAt.getTime() <= exam.startsAt.getTime()) return fail("Bitiş, başlangıçtan sonra olmalıdır.");
        if (exam.endsAt.getTime() <= now.getTime()) return fail("Bitiş zamanı geçmişte; tarihleri güncelleyin.");
        await db
          .update(schema.exams)
          .set({ status: "APPROVED", approvedBy: user.id, approvedAt: now, updatedAt: now })
          .where(eq(schema.exams.id, exam.id));
        // Takvim kaydı (tekrar onayda eskiyi temizle)
        await db.delete(schema.calendarEvents).where(and(eq(schema.calendarEvents.kind, "EXAM"), eq(schema.calendarEvents.refId, exam.id)));
        await db.insert(schema.calendarEvents).values({
          title: `Sınav: ${exam.title}`,
          kind: "EXAM",
          refId: exam.id,
          startsAt: exam.startsAt,
          endsAt: exam.endsAt,
          description: exam.description ?? null,
          createdBy: user.id,
        });
        const ids = await participantIds(exam);
        await notifyUsers(ids, {
          type: "EXAM_SCHEDULED",
          title: `Sınav zamanlandı: ${exam.title}`,
          body: `${formatDateTime(exam.startsAt)} – ${formatDateTime(exam.endsAt)} arasında, süre ${exam.durationMinutes} dakika.`,
          link: `/sinavlar/${exam.id}`,
        });
        await audit(user.id, "exam.approve", { type: "exam", id: exam.id }, { participants: ids.length });
        // Başlangıç geçmişse hemen aç
        await syncExamStatus({ ...exam, status: "APPROVED" }, now);
        revalidateExam(exam.id);
        return success(undefined, "Sınav onaylandı ve zamanlandı; katılımcılar bilgilendirildi.");
      }
      case "OPEN_NOW": {
        if (!["IN_REVIEW", "APPROVED"].includes(exam.status)) return fail("Sınav incelemede veya onaylı durumda olmalıdır.");
        const problem = await assertReadyForApproval(exam);
        if (problem) return fail(problem);
        const endsAt = exam.endsAt && exam.endsAt.getTime() > now.getTime() ? exam.endsAt : new Date(now.getTime() + 24 * 60 * 60 * 1000);
        await db
          .update(schema.exams)
          .set({
            status: "OPEN",
            startsAt: now,
            endsAt,
            approvedBy: exam.approvedBy ?? user.id,
            approvedAt: exam.approvedAt ?? now,
            updatedAt: now,
          })
          .where(eq(schema.exams.id, exam.id));
        const existing = await db
          .select({ id: schema.calendarEvents.id })
          .from(schema.calendarEvents)
          .where(and(eq(schema.calendarEvents.kind, "EXAM"), eq(schema.calendarEvents.refId, exam.id)));
        if (existing.length) {
          await db.update(schema.calendarEvents).set({ startsAt: now, endsAt }).where(and(eq(schema.calendarEvents.kind, "EXAM"), eq(schema.calendarEvents.refId, exam.id)));
        } else {
          await db.insert(schema.calendarEvents).values({ title: `Sınav: ${exam.title}`, kind: "EXAM", refId: exam.id, startsAt: now, endsAt, createdBy: user.id });
        }
        const ids = await participantIds(exam);
        await notifyUsers(ids, {
          type: "EXAM_SCHEDULED",
          title: `Sınav açıldı: ${exam.title}`,
          body: `Sınav şimdi açık; ${formatDateTime(endsAt)} tarihine kadar katılabilirsiniz. Süre ${exam.durationMinutes} dakika.`,
          link: `/sinavlar/${exam.id}`,
        });
        await audit(user.id, "exam.open", { type: "exam", id: exam.id }, { endsAt: endsAt.toISOString() });
        revalidateExam(exam.id);
        return success(undefined, "Sınav açıldı.");
      }
      case "CLOSE": {
        if (exam.status !== "OPEN") return fail("Yalnızca açık sınav kapatılabilir.");
        await closeExam(exam, user.id, now);
        revalidateExam(exam.id);
        return success(undefined, "Sınav kapatıldı; gönderilmemiş denemeler puanlandı.");
      }
      case "PUBLISH_RESULTS": {
        if (exam.status !== "CLOSED") return fail("Sonuçları yayımlamak için sınav kapanmış olmalıdır.");
        await db.update(schema.exams).set({ status: "RESULTS_PUBLISHED", resultsAt: exam.resultsAt ?? now, updatedAt: now }).where(eq(schema.exams.id, exam.id));
        const attempts = await db.select({ userId: schema.examAttempts.userId }).from(schema.examAttempts).where(eq(schema.examAttempts.examId, exam.id));
        await notifyUsers(
          attempts.map((a) => a.userId),
          { type: "EXAM_RESULTS", title: `Sınav sonuçları açıklandı: ${exam.title}`, body: "Puanınızı ve soru incelemesini görüntüleyebilirsiniz.", link: `/sinavlar/${exam.id}` },
        );
        await audit(user.id, "exam.publish_results", { type: "exam", id: exam.id }, { attempts: attempts.length });
        revalidateExam(exam.id);
        revalidatePath("/profil");
        return success(undefined, "Sonuçlar yayımlandı; katılımcılar bilgilendirildi.");
      }
    }
    return fail("Geçersiz işlem.");
  } catch (e) {
    return handleError(e, "İşlem tamamlanamadı.");
  }
}

/* -------------------------------------------------------------------------- */
/*  Katılım: deneme başlat, yanıt kaydet, gönder                               */
/* -------------------------------------------------------------------------- */

export async function startAttemptAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertUser();
    const idParsed = uuidSchema.safeParse(formData.get("examId"));
    if (!idParsed.success) return fail("Geçersiz sınav.");
    const exam = await loadExam(idParsed.data);
    if (!exam) return fail("Sınav bulunamadı.");
    if (!canParticipate(exam, user)) return fail("Bu sınavın katılımcısı değilsiniz.");
    if (exam.status !== "OPEN") return fail("Sınav şu anda açık değil.");
    const now = new Date();
    if (exam.endsAt && exam.endsAt.getTime() <= now.getTime()) return fail("Sınav süresi sona erdi.");

    const db = await getDb();
    const [existing] = await db
      .select({ id: schema.examAttempts.id })
      .from(schema.examAttempts)
      .where(and(eq(schema.examAttempts.examId, exam.id), eq(schema.examAttempts.userId, user.id)));
    if (existing) {
      revalidatePath(`/sinavlar/${exam.id}`);
      return success(undefined, "Denemeniz zaten başlatılmış.");
    }

    const qs = await getApprovedQuestions(exam.id);
    if (!qs.length) return fail("Sınavda onaylı soru yok.");
    const ids = qs.map((q) => q.id);
    const order = exam.shuffleQuestions ? secureShuffle(ids) : ids;
    const byDuration = new Date(now.getTime() + exam.durationMinutes * 60_000);
    const deadlineAt = exam.endsAt && exam.endsAt.getTime() < byDuration.getTime() ? exam.endsAt : byDuration;

    try {
      const [row] = await db
        .insert(schema.examAttempts)
        .values({ examId: exam.id, userId: user.id, questionOrder: order, answers: {}, flagged: [], startedAt: now, deadlineAt })
        .returning({ id: schema.examAttempts.id });
      await audit(user.id, "attempt.start", { type: "exam_attempt", id: row.id }, { examId: exam.id, questions: order.length });
    } catch {
      // Benzersiz indeks: eşzamanlı ikinci başlatma -> mevcut denemeye devam
    }
    revalidatePath(`/sinavlar/${exam.id}`);
    revalidatePath("/sinavlar");
    return success();
  } catch (e) {
    return handleError(e, "Sınav başlatılamadı.");
  }
}

const answerSchema = z.object({ attemptId: uuidSchema, questionId: uuidSchema, key: z.string().max(4000) });

/** Deneme sahibini doğrular; süresi dolmuşsa puanlar ve null döner. */
async function loadOpenAttempt(attemptId: string, userId: string) {
  const db = await getDb();
  const [attempt] = await db
    .select()
    .from(schema.examAttempts)
    .where(and(eq(schema.examAttempts.id, attemptId), eq(schema.examAttempts.userId, userId)))
    .limit(1);
  if (!attempt) return { attempt: null, reason: "Deneme bulunamadı." };
  if (attempt.submittedAt) return { attempt: null, reason: "Sınav zaten tamamlandı." };
  const now = new Date();
  if (attempt.deadlineAt.getTime() <= now.getTime()) {
    await finalizeAttempt(attempt, now, "attempt.auto_submit");
    return { attempt: null, reason: "Süre doldu; mevcut yanıtlarınız gönderildi." };
  }
  return { attempt, reason: null };
}

/** Tek bir yanıtı kaydeder (otomatik kayıt). Süre ve soru aidiyeti sunucuda doğrulanır. */
/** Yanıtı soru türüne göre doğrular ve normalize eder; geçersizse null. */
function normalizeAnswerForType(q: { type: string; options: { key: string }[]; pairs: { left: string; right: string }[] | null }, raw: string): string | null {
  const valid = new Set(q.type === "TRUE_FALSE" ? ["A", "B"] : q.options.map((o) => o.key));
  if (q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") return valid.has(raw) ? raw : null;
  if (q.type === "MULTI_SELECT") {
    const keys = raw.split(",").map((k) => k.trim().toUpperCase()).filter(Boolean);
    if (keys.length === 0 || keys.some((k) => !valid.has(k))) return null;
    return normalizeMultiKey(keys);
  }
  if (q.type === "MATCHING") {
    const pairs = q.pairs ?? [];
    const rights = new Set(pairs.map((p) => p.right));
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx >= pairs.length) return null;
      if (typeof v !== "string" || !rights.has(v)) return null;
      out[String(idx)] = v;
    }
    return JSON.stringify(out);
  }
  return null;
}

export async function saveAnswerAction(attemptId: string, questionId: string, key: string): Promise<ActionResult> {
  try {
    const user = await assertUser();
    const parsed = answerSchema.safeParse({ attemptId, questionId, key });
    if (!parsed.success) return fail("Geçersiz yanıt.");
    const { attempt, reason } = await loadOpenAttempt(parsed.data.attemptId, user.id);
    if (!attempt) return fail(reason ?? "Yanıt kaydedilemedi.");
    if (!attempt.questionOrder.includes(parsed.data.questionId)) return fail("Soru bu sınava ait değil.");
    const db = await getDb();
    const [qrow] = await db.select({ type: schema.questions.type, options: schema.questions.options, pairs: schema.questions.pairs }).from(schema.questions).where(eq(schema.questions.id, parsed.data.questionId));
    if (!qrow) return fail("Soru bulunamadı.");
    const normalized = normalizeAnswerForType(qrow, parsed.data.key);
    if (normalized === null) return fail("Geçersiz yanıt biçimi.");
    parsed.data.key = normalized;
    // Atomik JSONB birleştirme: eşzamanlı kayıtlar birbirini ezmez
    await db
      .update(schema.examAttempts)
      .set({ answers: sql`${schema.examAttempts.answers} || ${JSON.stringify({ [parsed.data.questionId]: parsed.data.key })}::jsonb` })
      .where(and(eq(schema.examAttempts.id, attempt.id), isNull(schema.examAttempts.submittedAt)));
    return success();
  } catch (e) {
    return handleError(e, "Yanıt kaydedilemedi.");
  }
}

const flagSchema = z.object({ attemptId: uuidSchema, questionId: uuidSchema, flagged: z.boolean() });

export async function toggleFlagAction(attemptId: string, questionId: string, flagged: boolean): Promise<ActionResult> {
  try {
    const user = await assertUser();
    const parsed = flagSchema.safeParse({ attemptId, questionId, flagged });
    if (!parsed.success) return fail("Geçersiz istek.");
    const { attempt, reason } = await loadOpenAttempt(parsed.data.attemptId, user.id);
    if (!attempt) return fail(reason ?? "İşaret kaydedilemedi.");
    if (!attempt.questionOrder.includes(parsed.data.questionId)) return fail("Soru bu sınava ait değil.");
    const set = new Set(attempt.flagged ?? []);
    if (parsed.data.flagged) set.add(parsed.data.questionId);
    else set.delete(parsed.data.questionId);
    const db = await getDb();
    await db
      .update(schema.examAttempts)
      .set({ flagged: Array.from(set) })
      .where(and(eq(schema.examAttempts.id, attempt.id), isNull(schema.examAttempts.submittedAt)));
    return success();
  } catch (e) {
    return handleError(e, "İşaret kaydedilemedi.");
  }
}

/** Denemeyi gönderir; puanlama sunucuda yapılır. Süre dolmuşsa mevcut yanıtlarla puanlanır. */
export async function submitAttemptAction(attemptId: string): Promise<ActionResult> {
  try {
    const user = await assertUser();
    const parsed = uuidSchema.safeParse(attemptId);
    if (!parsed.success) return fail("Geçersiz deneme.");
    const db = await getDb();
    const [attempt] = await db
      .select()
      .from(schema.examAttempts)
      .where(and(eq(schema.examAttempts.id, parsed.data), eq(schema.examAttempts.userId, user.id)))
      .limit(1);
    if (!attempt) return fail("Deneme bulunamadı.");
    if (attempt.submittedAt) {
      revalidatePath(`/sinavlar/${attempt.examId}`);
      return success(undefined, "Sınav zaten tamamlanmış.");
    }
    const now = new Date();
    await finalizeAttempt(attempt, now, attempt.deadlineAt.getTime() <= now.getTime() ? "attempt.auto_submit" : "attempt.submit");
    revalidatePath(`/sinavlar/${attempt.examId}`);
    revalidatePath("/sinavlar");
    revalidatePath("/profil");
    return success(undefined, "Sınav tamamlandı.");
  } catch (e) {
    return handleError(e, "Sınav gönderilemedi.");
  }
}
