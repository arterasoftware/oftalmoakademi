"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { assertStaff, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { shortText } from "@/lib/validation";
import { aiAvailable, AiUnavailableError } from "@/lib/ai/client";
import { extractPdfText } from "@/lib/articles/metadata";
import { parseQuestionsFromText, type ParsedQuestion } from "@/lib/exams/pdf-questions";
import { parseQuestionsWithAi } from "@/lib/ai/pdf-questions";

export type PdfParseOutput = { fileName: string; chars: number; mode: "auto" | "ai"; model: string | null; questions: ParsedQuestion[]; warnings: string[]; keyFound: boolean };

const MAX_PDF = 40 * 1024 * 1024;

/** PDF'i okur ve soruları ayrıştırır; dosya saklanmaz (yalnızca metin işlenir). */
export async function parseExamPdfAction(_prev: ActionResult<PdfParseOutput> | null, formData: FormData): Promise<ActionResult<PdfParseOutput>> {
  try {
    const user = await assertStaff();
    const mode = formData.get("mode") === "ai" ? "ai" : "auto";
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("PDF dosyası seçin.", { file: ["Dosya gerekli."] });
    if (file.size > MAX_PDF) return fail("PDF 40 MB'den büyük olamaz.");
    if (!(await consumeRateLimit(`upload:${user.id}`, RATE_LIMITS.uploadPerUser.limit, RATE_LIMITS.uploadPerUser.window))) return fail("Yükleme sınırına ulaştınız; biraz bekleyin.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) return fail("Dosya geçerli bir PDF değil.");
    const text = await extractPdfText(bytes, 80);
    if (text.trim().length < 50) return fail("PDF'ten metin çıkarılamadı. Taranmış (görüntü) PDF'ler desteklenmez; metin tabanlı bir PDF yükleyin.");

    let questions: ParsedQuestion[];
    let warnings: string[] = [];
    let keyFound = false;
    let model: string | null = null;
    if (mode === "ai") {
      if (!aiAvailable()) return fail("Yapay zekâ yapılandırılmamış; yapay zekâsız ayrıştırmayı kullanın.");
      if (!(await consumeRateLimit(`ai:${user.id}`, RATE_LIMITS.aiPerUser.limit, RATE_LIMITS.aiPerUser.window))) return fail("Yapay zekâ kullanım sınırına ulaştınız.");
      const r = await parseQuestionsWithAi({ text, userId: user.id });
      questions = r.questions;
      model = r.model;
      keyFound = questions.some((q) => q.correctKey);
      const missing = questions.filter((q) => !q.correctKey).length;
      if (!questions.length) warnings.push("Yapay zekâ belgede soru bulamadı.");
      if (missing) warnings.push(`${missing} sorunun doğru yanıtı belgede yok; önizlemede işaretleyin.`);
    } else {
      const r = parseQuestionsFromText(text);
      questions = r.questions;
      warnings = r.warnings;
      keyFound = r.keyFound;
    }
    await audit(user.id, "exam.pdf.parse", undefined, { mode, model, fileName: file.name, questions: questions.length, chars: text.length });
    return success({ fileName: file.name, chars: text.length, mode, model, questions, warnings, keyFound }, questions.length ? `${questions.length} soru bulundu.` : undefined);
  } catch (e) {
    if (e instanceof AuthError || e instanceof AiUnavailableError) return fail(e.message);
    console.error("[exam.pdf]", e);
    return fail("PDF ayrıştırılamadı.");
  }
}

const importedQuestionSchema = z.object({
  stem: z.string().trim().min(5, "Soru kökü çok kısa.").max(4000),
  options: z.array(z.object({ key: z.string().regex(/^[A-E]$/), text: z.string().trim().min(1, "Şık metni boş olamaz.").max(1000) })).min(2).max(5),
  correctKey: z.string().regex(/^[A-E]$/, "Doğru yanıt seçin."),
  explanation: z.string().trim().max(4000).optional().default(""),
});

const importSchema = z.object({
  title: shortText(200).min(3, "Başlık en az 3 karakter olmalıdır."),
  type: z.enum(["WEEKLY", "MONTHLY"]),
  subspecialty: z.enum(schema.subspecialtyEnum.enumValues, { message: "Alt branş seçin." }),
  durationMinutes: z.coerce.number().int().min(1).max(600),
  sourceRef: z.string().trim().max(300).optional().default(""),
  questions: z.array(importedQuestionSchema).min(1, "En az bir soru seçin.").max(200),
});

/** Önizlemede onaylanan soruları taslak sınav olarak kaydeder; sorular DRAFT durumunda tek tek onaylanır. */
export async function createExamFromImportAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let newId: string;
  try {
    const user = await assertStaff();
    let payload: unknown;
    try {
      payload = JSON.parse(String(formData.get("payload") ?? ""));
    } catch {
      return fail("Önizleme verisi okunamadı; sayfayı yenileyip tekrar deneyin.");
    }
    const parsed = importSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const qi = issue?.path[0] === "questions" && typeof issue.path[1] === "number" ? issue.path[1] + 1 : null;
      return fail(qi ? `${qi}. soru: ${issue.message}` : (issue?.message ?? "Bilgileri kontrol edin."), zodFieldErrors(parsed.error.issues));
    }
    const d = parsed.data;
    for (const [i, q] of d.questions.entries()) {
      if (!q.options.some((o) => o.key === q.correctKey)) return fail(`${i + 1}. soru: doğru yanıt şıklar arasında değil.`);
      const keys = q.options.map((o) => o.key);
      if (new Set(keys).size !== keys.length) return fail(`${i + 1}. soru: şık harfleri tekrar ediyor.`);
    }

    const db = await getDb();
    const [exam] = await db
      .insert(schema.exams)
      .values({ title: d.title, type: d.type, description: d.sourceRef ? `Kaynak: ${d.sourceRef}` : null, durationMinutes: d.durationMinutes, shuffleQuestions: true, createdBy: user.id })
      .returning({ id: schema.exams.id });
    await db.insert(schema.questions).values(
      d.questions.map((q, i) => ({
        examId: exam.id,
        order: i + 1,
        type: "MULTIPLE_CHOICE" as const,
        stem: q.stem,
        options: q.options,
        correctKey: q.correctKey,
        explanation: q.explanation,
        subspecialty: d.subspecialty,
        difficulty: 2,
        sourceRef: d.sourceRef || null,
        aiGenerated: false,
        status: "DRAFT" as const,
      })),
    );
    newId = exam.id;
    await audit(user.id, "exam.create", { type: "exam", id: exam.id }, { type: d.type, title: d.title, importedFromPdf: true, questions: d.questions.length });
    revalidatePath("/sinavlar");
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[exam.import]", e);
    return fail("Sınav oluşturulamadı.");
  }
  redirect(`/sinavlar/${newId}/duzenle`);
}
