"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getDb, schema } from "@/db";
import { assertStaff, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { uuidSchema, longText, shortText } from "@/lib/validation";
import { aiAvailable, AiUnavailableError } from "@/lib/ai/client";
import { evaluateArticleCandidates, generateArticleSummary } from "@/lib/ai/article";
import { getArticleRaw, listUnscoredCandidates } from "@/lib/queries/articles";
import { savePdfUpload, deleteFile, UploadError } from "@/lib/storage/files";
import { lookupDoi, normalizeDoi, extractDoiFromText, extractPdfText, type ArticleMeta } from "@/lib/articles/metadata";

function revalidateArticles(id?: string) {
  revalidatePath("/makaleler");
  revalidatePath("/makaleler/oneriler");
  if (id) revalidatePath(`/makaleler/${id}`);
  revalidatePath("/panel");
  revalidatePath("/takvim");
}

function userFacingError(e: unknown, fallback: string): string {
  if (e instanceof AuthError || e instanceof AiUnavailableError) return e.message;
  if (e instanceof Anthropic.APIError) return `Yapay zekâ hizmetine ulaşılamadı (HTTP ${e.status ?? "?"}). Lütfen daha sonra tekrar deneyin.`;
  if (e instanceof Error && /kesildi|güvenlik nedeniyle|ayrıştırılamadı|özet \(abstract\)/.test(e.message)) return e.message;
  return fallback;
}

/** İçinde bulunulan haftanın pazartesi 00:00'ı (sunucu yerel saati). */
function mondayOfCurrentWeek(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (d.getDay() + 6) % 7; // Pzt=0 ... Paz=6
  d.setDate(d.getDate() - offset);
  return d;
}

/* ------------------------------------------------------------------ */
/*  Aday ekleme (elle)                                                 */
/* ------------------------------------------------------------------ */

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const candidateSchema = z.object({
  title: shortText(400).min(5, "Başlık en az 5 karakter olmalıdır."),
  authors: z.preprocess(emptyToUndef, shortText(1000).optional()),
  journal: z.preprocess(emptyToUndef, shortText(200).optional()),
  publishedOn: z.preprocess(emptyToUndef, shortText(40).optional()),
  doi: z.preprocess(
    emptyToUndef,
    z
      .string()
      .trim()
      .regex(/^10\.\d{4,9}\/\S+$/, "DOI biçimi geçersiz (örn. 10.1016/j.ophtha.2024.01.001).")
      .max(200)
      .optional(),
  ),
  pmid: z.preprocess(emptyToUndef, z.string().trim().regex(/^\d{1,9}$/, "PMID yalnızca rakamlardan oluşur.").optional()),
  url: z.preprocess(emptyToUndef, z.string().trim().url("Geçerli bir bağlantı girin.").max(500).optional()),
  abstract: z.preprocess(emptyToUndef, longText(10000).optional()),
  subspecialty: z.preprocess(emptyToUndef, z.enum(schema.subspecialtyEnum.enumValues).optional()),
  /** uploadArticlePdfAction ile önceden yüklenmiş tam metin PDF */
  pdfFileId: z.preprocess(emptyToUndef, uuidSchema.optional()),
});

/* ------------------------------------------------------------------ */
/*  DOI ile künye getirme ve PDF yükleme (form yardımcıları)           */
/* ------------------------------------------------------------------ */

/** DOI'den Crossref/PubMed künyesi. Yalnızca personel; saatte 60 sorgu. */
export async function lookupArticleDoiAction(rawDoi: string): Promise<ActionResult<ArticleMeta>> {
  try {
    const user = await assertStaff();
    const doi = normalizeDoi(String(rawDoi ?? ""));
    if (!doi) return fail("DOI biçimi geçersiz (örn. 10.1016/j.ophtha.2024.01.001).", { doi: ["Geçersiz DOI."] });
    if (!(await consumeRateLimit(`doi:${user.id}`, 60, 60 * 60))) return fail("Çok sık sorgu yaptınız; biraz bekleyin.");
    const meta = await lookupDoi(doi);
    if (!meta) return fail("Bu DOI için Crossref ve PubMed'de kayıt bulunamadı. Künyeyi elle girebilirsiniz.", { doi: ["Kayıt bulunamadı."] });
    return success(meta);
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[articles.doi]", e);
    return fail("Künye getirilemedi. Ağ bağlantısını kontrol edin.");
  }
}

export type ArticlePdfUpload = { fileId: string; name: string; size: number; doi: string | null; meta: ArticleMeta | null };

/** Tam metin PDF'i yükler, ilk sayfalardan DOI'yi bulup künyeyi getirir. Dosya aday eklenene kadar formda bekler. */
export async function uploadArticlePdfAction(formData: FormData): Promise<ActionResult<ArticlePdfUpload>> {
  try {
    const user = await assertStaff();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("PDF dosyası seçin.");
    if (!(await consumeRateLimit(`upload:${user.id}`, RATE_LIMITS.uploadPerUser.limit, RATE_LIMITS.uploadPerUser.window))) return fail("Yükleme sınırına ulaştınız; biraz bekleyin.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const saved = await savePdfUpload({ ownerId: user.id, file, kind: "ARTICLE_PDF" });
    const text = await extractPdfText(bytes, 3);
    const doi = extractDoiFromText(text);
    const meta = doi ? await lookupDoi(doi) : null;
    await audit(user.id, "article.pdf.upload", { type: "file", id: saved.id }, { size: saved.size, doi });
    return success({ fileId: saved.id, name: saved.originalName, size: saved.size, doi, meta });
  } catch (e) {
    if (e instanceof AuthError || e instanceof UploadError) return fail(e.message);
    console.error("[articles.pdf]", e);
    return fail("PDF yüklenemedi.");
  }
}

export async function addArticleCandidateAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertStaff();
    const parsed = candidateSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    if (d.url && !/^https?:\/\//i.test(d.url)) return fail("Bağlantı http(s) ile başlamalıdır.", { url: ["Yalnızca http(s) bağlantıları."] });

    const db = await getDb();
    if (d.doi) {
      const [dup] = await db
        .select({ id: schema.articles.id, title: schema.articles.title })
        .from(schema.articles)
        .where(sql`lower(${schema.articles.doi}) = lower(${d.doi})`)
        .limit(1);
      if (dup) return fail(`Bu DOI zaten kayıtlı: "${dup.title}".`, { doi: ["Aynı DOI ile bir makale var."] });
    }
    if (d.pdfFileId) {
      // Yalnızca bu kullanıcının yüklediği, henüz bir makaleye bağlanmamış makale PDF'i kabul edilir
      const [f] = await db.select({ id: schema.files.id }).from(schema.files).where(and(eq(schema.files.id, d.pdfFileId), eq(schema.files.ownerId, user.id), eq(schema.files.kind, "ARTICLE_PDF"))).limit(1);
      if (!f) return fail("Yüklenen PDF bulunamadı; dosyayı yeniden yükleyin.", { pdfFileId: ["Dosya geçersiz."] });
      const [used] = await db.select({ id: schema.articles.id }).from(schema.articles).where(eq(schema.articles.pdfFileId, d.pdfFileId)).limit(1);
      if (used) return fail("Bu PDF zaten başka bir makaleye bağlı.", { pdfFileId: ["Dosya kullanımda."] });
    }
    const [row] = await db
      .insert(schema.articles)
      .values({
        title: d.title,
        authors: d.authors ?? null,
        journal: d.journal ?? null,
        publishedOn: d.publishedOn ?? null,
        doi: d.doi ?? null,
        pmid: d.pmid ?? null,
        url: d.url ?? null,
        abstract: d.abstract ?? null,
        pdfFileId: d.pdfFileId ?? null,
        subspecialty: d.subspecialty ?? null,
        status: "SUGGESTED",
        suggestedBy: user.id,
      })
      .returning({ id: schema.articles.id });

    await audit(user.id, "article.suggest", { type: "article", id: row.id }, { manual: true, pdf: Boolean(d.pdfFileId), doi: d.doi ?? null });
    revalidateArticles(row.id);
    return success(undefined, "Aday makale eklendi.");
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[articles.add]", e);
    return fail("Aday eklenemedi.");
  }
}

/* ------------------------------------------------------------------ */
/*  Yapay zekâ ile değerlendir ve öner                                 */
/* ------------------------------------------------------------------ */

/** useActionState imzasıyla uyumlu (durum ve form verisi kullanılmaz). */
export async function evaluateCandidatesAction(): Promise<ActionResult> {
  try {
    const user = await assertStaff();
    if (!aiAvailable()) return fail("Yapay zekâ yapılandırılmamış.");
    const candidates = await listUnscoredCandidates(15);
    if (candidates.length === 0) return fail("Değerlendirilecek yeni aday yok (tüm adaylar puanlanmış).");
    if (!(await consumeRateLimit(`ai:${user.id}`, RATE_LIMITS.aiPerUser.limit, RATE_LIMITS.aiPerUser.window)))
      return fail("Yapay zekâ kullanım sınırına ulaştınız. Lütfen daha sonra tekrar deneyin.");

    const evaluations = await evaluateArticleCandidates({ candidates, userId: user.id });
    const db = await getDb();
    let n = 0;
    for (const [id, ev] of evaluations) {
      await db
        .update(schema.articles)
        .set({
          aiRationale: ev.rationale,
          aiQualityNotes: { design: ev.design, clinicalImportance: ev.clinicalImportance, novelty: ev.novelty, limitations: ev.limitations, score: ev.score },
          updatedAt: new Date(),
        })
        .where(eq(schema.articles.id, id));
      n++;
    }
    await audit(user.id, "article.ai_evaluate", undefined, { evaluated: n, candidates: candidates.length });
    revalidateArticles();
    return success(undefined, `${n} aday değerlendirildi ve puanlandı.`);
  } catch (e) {
    console.error("[articles.evaluate]", e);
    return fail(userFacingError(e, "Değerlendirme tamamlanamadı."));
  }
}

/* ------------------------------------------------------------------ */
/*  Seç / Reddet / Özet üret / Yayımla                                 */
/* ------------------------------------------------------------------ */

const workflowSchema = z.object({ id: uuidSchema, op: z.enum(["select", "reject", "summarize", "publish"]) });

export async function articleWorkflowAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertStaff();
    const parsed = workflowSchema.safeParse({ id: formData.get("id"), op: formData.get("op") });
    if (!parsed.success) return fail("Geçersiz istek.");
    const { id, op } = parsed.data;
    const article = await getArticleRaw(id);
    if (!article) return fail("Makale bulunamadı.");
    const db = await getDb();
    const now = new Date();

    switch (op) {
      case "select": {
        if (article.status !== "SUGGESTED") return fail("Yalnızca öneri durumundaki makaleler seçilebilir.");
        await db.update(schema.articles).set({ status: "SELECTED", selectedBy: user.id, updatedAt: now }).where(eq(schema.articles.id, id));
        await audit(user.id, "article.select", { type: "article", id });
        revalidateArticles(id);
        return success(undefined, "Makale seçildi. Şimdi özet üretip yayımlayabilirsiniz.");
      }
      case "reject": {
        if (!["SUGGESTED", "SELECTED"].includes(article.status)) return fail("Bu makale reddedilebilir durumda değil.");
        await db.update(schema.articles).set({ status: "REJECTED", updatedAt: now }).where(eq(schema.articles.id, id));
        await audit(user.id, "article.reject", { type: "article", id });
        revalidateArticles(id);
        return success(undefined, "Makale reddedildi.");
      }
      case "summarize": {
        if (!["SELECTED", "PUBLISHED"].includes(article.status)) return fail("Özet için önce makaleyi seçin.");
        if (!aiAvailable()) return fail("Yapay zekâ yapılandırılmamış.");
        if (!(await consumeRateLimit(`ai:${user.id}`, RATE_LIMITS.aiPerUser.limit, RATE_LIMITS.aiPerUser.window)))
          return fail("Yapay zekâ kullanım sınırına ulaştınız. Lütfen daha sonra tekrar deneyin.");
        const { summary, model } = await generateArticleSummary({ article, userId: user.id });
        await db.update(schema.articles).set({ summary: { ...summary, source: "ai" }, updatedAt: now }).where(eq(schema.articles.id, id));
        await audit(user.id, "article.summarize", { type: "article", id }, { model });
        revalidateArticles(id);
        return success(undefined, "Türkçe özet ve tartışma soruları üretildi. Yayımlamadan önce gözden geçirin.");
      }
      case "publish": {
        if (article.status !== "SELECTED") return fail("Yalnızca seçilmiş makaleler yayımlanabilir.");
        const weekOf = mondayOfCurrentWeek(now);
        await db
          .update(schema.articles)
          .set({ status: "PUBLISHED", publishedAt: now, weekOf, selectedBy: article.selectedBy ?? user.id, updatedAt: now })
          .where(eq(schema.articles.id, id));
        await db.insert(schema.calendarEvents).values({
          title: `Haftanın makalesi: ${article.title}`,
          kind: "ARTICLE",
          refId: id,
          startsAt: now,
          description: article.journal ?? null,
          createdBy: user.id,
        });
        await audit(user.id, "article.publish", { type: "article", id }, { weekOf: weekOf.toISOString() });
        await notifyRoles(
          ["RESIDENT", "FACULTY"],
          { type: "ARTICLE_PUBLISHED", title: `Haftanın makalesi: ${article.title}`, body: article.journal ?? undefined, link: `/makaleler/${id}` },
          user.id,
        );
        revalidateArticles(id);
        return success(undefined, "Makale yayımlandı.");
      }
    }
    return fail("Geçersiz işlem.");
  } catch (e) {
    console.error("[articles.workflow]", e);
    return fail(userFacingError(e, "İşlem tamamlanamadı."));
  }
}


/* ---------------- Elle Türkçe özet (yapay zekâsız kurulum veya YZ taslağını düzeltme) ---------------- */

const lines = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter.`)
    .transform((v) => v.split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean));

const summarySchema = z.object({
  id: uuidSchema,
  structuredSummaryTr: longText(6000).min(30, "Yapılandırılmış özet en az 30 karakter olmalıdır."),
  background: longText(3000),
  methods: longText(3000),
  keyFindings: lines(3000),
  strengths: lines(2000),
  weaknesses: lines(2000),
  clinicalImplications: longText(3000),
  discussionQuestions: lines(3000),
});

/**
 * Öğretim üyesi Türkçe özeti ve tartışma sorularını elle yazar veya YZ taslağını düzeltir.
 * Kaydedilen özet "manual" olarak etiketlenir; asistan görünümünde yapay zekâ rozeti kalkar.
 */
export async function saveArticleSummaryAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertStaff();
    const parsed = summarySchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const { id, ...fields } = parsed.data;
    if (fields.discussionQuestions.length === 0) return fail("En az bir tartışma sorusu yazın.", { discussionQuestions: ["En az bir tartışma sorusu yazın."] });
    const article = await getArticleRaw(id);
    if (!article) return fail("Makale bulunamadı.");
    if (!["SELECTED", "PUBLISHED"].includes(article.status)) return fail("Özet yalnızca seçilmiş veya yayımlanmış makalede düzenlenebilir.");
    const db = await getDb();
    await db
      .update(schema.articles)
      .set({ summary: { ...fields, source: "manual" }, updatedAt: new Date() })
      .where(eq(schema.articles.id, id));
    await audit(user.id, "article.summary.edit", { type: "article", id }, { previous: article.summary?.source ?? null });
    revalidateArticles(id);
    return success(undefined, "Türkçe özet kaydedildi.");
  } catch (e) {
    console.error("[articles.summary]", e);
    return fail(userFacingError(e, "Özet kaydedilemedi."));
  }
}

/* ------------------------------------------------------------------ */
/*  Tam metin PDF'i kaldır                                             */
/* ------------------------------------------------------------------ */

const pdfRemoveSchema = z.object({ id: uuidSchema });

export async function removeArticlePdfAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const { id } = pdfRemoveSchema.parse(Object.fromEntries(formData.entries()));
  const db = await getDb();
  const [a] = await db.select({ pdfFileId: schema.articles.pdfFileId }).from(schema.articles).where(eq(schema.articles.id, id)).limit(1);
  if (!a?.pdfFileId) return;
  await db.update(schema.articles).set({ pdfFileId: null, updatedAt: new Date() }).where(eq(schema.articles.id, id));
  await deleteFile(a.pdfFileId).catch(() => {});
  await audit(user.id, "article.pdf.remove", { type: "article", id }, { fileId: a.pdfFileId });
  revalidateArticles(id);
}
