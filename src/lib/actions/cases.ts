"use server";

import { and, count, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertUser, assertStaff, isStaff, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { uuidSchema, longText, shortText } from "@/lib/validation";
import { saveImageUpload, saveAudioUpload, deleteFile, UploadError } from "@/lib/storage/files";
import { aiAvailable, AiUnavailableError } from "@/lib/ai/client";
import { summarizeDiscussion } from "@/lib/ai/discussion-summary";
import { generateCaseHint } from "@/lib/ai/case-hint";
import { canEditCase } from "@/lib/queries/cases";
import { MAX_CASE_IMAGES, CASE_AUDIO_MAX_SEC } from "@/lib/status-labels-cases";

/* -------------------------------------------------------------------------- */
/*  Yardımcılar                                                                */
/* -------------------------------------------------------------------------- */

const casePath = (id: string) => `/olgular/${id}`;

function revalidateCase(id: string) {
  revalidatePath("/olgular");
  revalidatePath(casePath(id));
  revalidatePath(`${casePath(id)}/duzenle`);
  revalidatePath("/panel");
}

function handleError(e: unknown, fallback: string): ActionResult<never> {
  if (e instanceof AuthError || e instanceof UploadError || e instanceof AiUnavailableError) return fail(e.message);
  console.error("[cases]", e);
  return fail(fallback);
}

async function loadCase(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.clinicalCases).where(eq(schema.clinicalCases.id, id)).limit(1);
  return row ?? null;
}

const caseFormSchema = z.object({
  title: shortText(200).min(5, "Başlık en az 5 karakter olmalıdır."),
  subspecialty: z.enum(schema.subspecialtyEnum.enumValues, { message: "Alt dal seçin." }),
  body: longText(20000).min(20, "Olgu metni en az 20 karakter olmalıdır."),
  audioDurationSec: z.coerce.number().int().min(0).max(CASE_AUDIO_MAX_SEC, "Ses kaydı en fazla 10 dakika olabilir.").optional(),
  deidentified: z.enum(["on"]).optional(),
  removeAudio: z.enum(["on"]).optional(),
});

function collectUploads(formData: FormData) {
  const images = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const audio = formData.get("audio");
  return { images, audio: audio instanceof File && audio.size > 0 ? audio : null };
}

async function takeUploadSlot(userId: string) {
  if (!(await consumeRateLimit(`upload:${userId}`, RATE_LIMITS.uploadPerUser.limit, RATE_LIMITS.uploadPerUser.window))) {
    throw new UploadError("Yükleme sınırına ulaştınız; biraz bekleyin.");
  }
}

/** Görselleri ve (varsa) ses kaydını kaydeder; olgu satırını günceller. Hata durumunda kaydedilen dosyalar silinir. */
async function saveCaseMedia(userId: string, caseId: string, media: { images: File[]; audio: File | null; audioDurationSec?: number }) {
  const db = await getDb();
  const saved: string[] = [];
  try {
    const [{ n }] = await db.select({ n: count() }).from(schema.caseImages).where(eq(schema.caseImages.caseId, caseId));
    let order = Number(n ?? 0);
    if (order + media.images.length > MAX_CASE_IMAGES) throw new UploadError(`Bir olguya en fazla ${MAX_CASE_IMAGES} görsel eklenebilir (mevcut: ${order}).`);
    for (const file of media.images) {
      await takeUploadSlot(userId);
      const img = await saveImageUpload({ ownerId: userId, kind: "CASE_IMAGE", file });
      saved.push(img.id);
      await db.insert(schema.caseImages).values({ caseId, fileId: img.id, caption: null, order: order++ });
    }
    if (media.audio) {
      await takeUploadSlot(userId);
      const [cur] = await db.select({ audioFileId: schema.clinicalCases.audioFileId }).from(schema.clinicalCases).where(eq(schema.clinicalCases.id, caseId)).limit(1);
      const a = await saveAudioUpload({ ownerId: userId, file: media.audio, kind: "CASE_AUDIO" });
      saved.push(a.id);
      await db.update(schema.clinicalCases).set({ audioFileId: a.id, audioDurationSec: media.audioDurationSec ?? null }).where(eq(schema.clinicalCases.id, caseId));
      if (cur?.audioFileId) await deleteFile(cur.audioFileId).catch(() => {});
    }
  } catch (e) {
    for (const id of saved) await deleteFile(id).catch(() => {});
    throw e;
  }
}

/* -------------------------------------------------------------------------- */
/*  Oluştur / güncelle                                                         */
/* -------------------------------------------------------------------------- */

/** Olgu doğrudan paylaşılır (inceleme yok); başarıda olgu sayfasına yönlendirir. */
export async function createCaseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let createdId: string | null = null;
  try {
    const user = await assertUser();
    const raw = Object.fromEntries(formData.entries());
    if (raw.audioDurationSec === "") delete raw.audioDurationSec;
    const parsed = caseFormSchema.safeParse(raw);
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    if (d.deidentified !== "on") return fail("Olguda hasta kimlik bilgisi bulunmadığını onaylamalısınız.", { deidentified: ["Onay gerekli."] });
    const media = collectUploads(formData);
    if (media.images.length > MAX_CASE_IMAGES) return fail(`En fazla ${MAX_CASE_IMAGES} görsel seçebilirsiniz.`, { images: [`En fazla ${MAX_CASE_IMAGES} görsel.`] });

    const db = await getDb();
    const [row] = await db
      .insert(schema.clinicalCases)
      .values({ title: d.title, subspecialty: d.subspecialty, body: d.body, deidentificationConfirmed: true, authorId: user.id, status: "PUBLISHED" })
      .returning({ id: schema.clinicalCases.id });
    try {
      await saveCaseMedia(user.id, row.id, { ...media, audioDurationSec: d.audioDurationSec });
    } catch (e) {
      await db.delete(schema.clinicalCases).where(eq(schema.clinicalCases.id, row.id));
      throw e;
    }
    await audit(user.id, "case.create", { type: "case", id: row.id }, { images: media.images.length, audio: Boolean(media.audio) });
    await notifyRoles(["RESIDENT", "FACULTY"], { type: "CASE_PUBLISHED", title: `Yeni olgu: ${d.title}`, body: `${user.name} bir olgu paylaştı.`, link: casePath(row.id) }, user.id);
    revalidateCase(row.id);
    createdId = row.id;
  } catch (e) {
    return handleError(e, "Olgu kaydedilemedi.");
  }
  redirect(casePath(createdId));
}

const editSchema = caseFormSchema.extend({ id: uuidSchema });

export async function updateCaseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertUser();
    const raw = Object.fromEntries(formData.entries());
    if (raw.audioDurationSec === "") delete raw.audioDurationSec;
    const parsed = editSchema.safeParse(raw);
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const c = await loadCase(d.id);
    if (!c) return fail("Olgu bulunamadı.");
    if (!canEditCase(c, user)) throw new AuthError("Bu olguyu düzenleyemezsiniz.");
    const media = collectUploads(formData);

    const db = await getDb();
    await db.update(schema.clinicalCases).set({ title: d.title, subspecialty: d.subspecialty, body: d.body, updatedAt: new Date() }).where(eq(schema.clinicalCases.id, c.id));
    if (d.removeAudio === "on" && c.audioFileId && !media.audio) {
      await db.update(schema.clinicalCases).set({ audioFileId: null, audioDurationSec: null }).where(eq(schema.clinicalCases.id, c.id));
      await deleteFile(c.audioFileId).catch(() => {});
    }
    await saveCaseMedia(user.id, c.id, { ...media, audioDurationSec: d.audioDurationSec });
    await audit(user.id, "case.update", { type: "case", id: c.id }, { images: media.images.length, audio: Boolean(media.audio), removeAudio: d.removeAudio === "on" });
    revalidateCase(c.id);
    return success(undefined, "Olgu güncellendi.");
  } catch (e) {
    return handleError(e, "Olgu güncellenemedi.");
  }
}

const deleteImageSchema = z.object({ caseId: uuidSchema, imageId: uuidSchema });

export async function deleteCaseImageAction(formData: FormData): Promise<void> {
  const user = await assertUser();
  const d = deleteImageSchema.parse(Object.fromEntries(formData.entries()));
  const c = await loadCase(d.caseId);
  if (!c) return;
  if (!canEditCase(c, user)) throw new AuthError("Bu olgunun görsellerini silemezsiniz.");
  const db = await getDb();
  const [img] = await db.select({ id: schema.caseImages.id, fileId: schema.caseImages.fileId }).from(schema.caseImages).where(and(eq(schema.caseImages.id, d.imageId), eq(schema.caseImages.caseId, c.id))).limit(1);
  if (!img) return;
  await db.delete(schema.caseImages).where(eq(schema.caseImages.id, img.id));
  await deleteFile(img.fileId).catch(() => {});
  await audit(user.id, "case.image.delete", { type: "case", id: c.id }, { imageId: img.id });
  revalidateCase(c.id);
}

/* -------------------------------------------------------------------------- */
/*  Gizle / sil                                                                */
/* -------------------------------------------------------------------------- */

const hideSchema = z.object({ id: uuidSchema, hidden: z.enum(["1", "0"]) });

/** Öğretim üyesi olguyu gizler (asistanlar göremez) veya yeniden açar. */
export async function setCaseHiddenAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertStaff();
    const parsed = hideSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Geçersiz veri.");
    const c = await loadCase(parsed.data.id);
    if (!c) return fail("Olgu bulunamadı.");
    const hidden = parsed.data.hidden === "1";
    const db = await getDb();
    await db.update(schema.clinicalCases).set({ status: hidden ? "HIDDEN" : "PUBLISHED", updatedAt: new Date() }).where(eq(schema.clinicalCases.id, c.id));
    await audit(user.id, hidden ? "case.hide" : "case.unhide", { type: "case", id: c.id });
    revalidateCase(c.id);
    return success(undefined, hidden ? "Olgu gizlendi." : "Olgu yeniden tartışmaya açıldı.");
  } catch (e) {
    return handleError(e, "İşlem yapılamadı.");
  }
}

const idSchema = z.object({ id: uuidSchema });

/** Yazar veya personel olguyu siler (görseller, ses ve tartışma dâhil). */
export async function deleteCaseAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertUser();
    const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Geçersiz veri.");
    const c = await loadCase(parsed.data.id);
    if (!c) return fail("Olgu bulunamadı.");
    if (!canEditCase(c, user)) throw new AuthError("Bu olguyu silemezsiniz.");
    const db = await getDb();
    const imgs = await db.select({ fileId: schema.caseImages.fileId }).from(schema.caseImages).where(eq(schema.caseImages.caseId, c.id));
    const cmts = await db.select({ id: schema.comments.id, audioFileId: schema.comments.audioFileId }).from(schema.comments).where(and(eq(schema.comments.targetType, "CASE"), eq(schema.comments.targetId, c.id)));
    const cmtImgs = cmts.length ? await db.select({ fileId: schema.commentImages.fileId }).from(schema.commentImages).where(inArray(schema.commentImages.commentId, cmts.map((x) => x.id))) : [];
    await db.delete(schema.clinicalCases).where(eq(schema.clinicalCases.id, c.id));
    if (cmts.length) await db.delete(schema.comments).where(inArray(schema.comments.id, cmts.map((x) => x.id)));
    const fileIds = [...imgs.map((i) => i.fileId), ...cmtImgs.map((i) => i.fileId), ...cmts.map((x) => x.audioFileId).filter((x): x is string => Boolean(x)), ...(c.audioFileId ? [c.audioFileId] : [])];
    for (const id of fileIds) await deleteFile(id).catch(() => {});
    await audit(user.id, "case.delete", { type: "case", id: c.id }, { title: c.title, comments: cmts.length, files: fileIds.length, own: c.authorId === user.id });
    revalidatePath("/olgular");
    revalidatePath("/panel");
  } catch (e) {
    return handleError(e, "Olgu silinemedi.");
  }
  redirect("/olgular");
}

/* -------------------------------------------------------------------------- */
/*  Yapay zekâ                                                                 */
/* -------------------------------------------------------------------------- */

const hintSchema = z.object({ id: uuidSchema, question: longText(3000).min(10, "Sorunuzu veya akıl yürütmenizi en az 10 karakterle yazın.") });

/** Asistan için Sokratik ipucu: kesin tanı önermez. Üretilen ipucu tartışmaya yapay zekâ yorumu olarak eklenir. */
export async function requestCaseHintAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertUser();
    if (!aiAvailable()) return fail("Yapay zekâ yapılandırılmamış.");
    const parsed = hintSchema.safeParse({ id: formData.get("id"), question: formData.get("question") });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Geçersiz veri.", zodFieldErrors(parsed.error.issues));
    const c = await loadCase(parsed.data.id);
    if (!c) return fail("Olgu bulunamadı.");
    if (c.status !== "PUBLISHED" && !isStaff(user.role)) return fail("Bu olgu şu anda tartışmaya açık değil.");
    if (c.discussionLocked) return fail("Bu tartışma sonlandırılmış.");
    if (!(await consumeRateLimit(`ai:${user.id}`, RATE_LIMITS.aiPerUser.limit, RATE_LIMITS.aiPerUser.window)))
      return fail("Yapay zekâ kullanım sınırına ulaştınız. Lütfen daha sonra deneyin.");

    const { hint, citations } = await generateCaseHint({ caseId: c.id, userId: user.id, question: parsed.data.question });
    if (!hint) return fail("Yapay zekâ yanıt üretemedi.");
    const db = await getDb();
    const body = `İpucu isteği (${user.name}): ${parsed.data.question}\n\n${hint}`;
    const [row] = await db
      .insert(schema.comments)
      .values({ targetType: "CASE", targetId: c.id, parentId: null, authorId: null, isAi: true, body, aiCitations: citations.length ? citations : null })
      .returning({ id: schema.comments.id });
    await audit(user.id, "case.hint", { type: "case", id: c.id }, { commentId: row.id, citations: citations.length });
    revalidateCase(c.id);
    return success(undefined, "İpucu tartışmaya eklendi.");
  } catch (e) {
    return handleError(e, e instanceof Error && e.message.startsWith("Yapay zekâ") ? e.message : "İpucu alınamadı.");
  }
}

export async function summarizeCaseDiscussionAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertStaff();
    if (!aiAvailable()) return fail("Yapay zekâ yapılandırılmamış.");
    const parsed = idSchema.safeParse({ id: formData.get("id") });
    if (!parsed.success) return fail("Geçersiz olgu kimliği.");
    const c = await loadCase(parsed.data.id);
    if (!c) return fail("Olgu bulunamadı.");
    if (!(await consumeRateLimit(`ai:${user.id}`, RATE_LIMITS.aiPerUser.limit, RATE_LIMITS.aiPerUser.window)))
      return fail("Yapay zekâ kullanım sınırına ulaştınız. Lütfen daha sonra deneyin.");
    const { summary } = await summarizeDiscussion({ targetType: "CASE", targetId: c.id, contextTitle: c.title, requestedBy: user.id });
    const db = await getDb();
    await db.update(schema.clinicalCases).set({ aiSummary: summary, updatedAt: new Date() }).where(eq(schema.clinicalCases.id, c.id));
    await audit(user.id, "case.ai_summary", { type: "case", id: c.id });
    revalidateCase(c.id);
    return success(undefined, "Tartışma özeti oluşturuldu.");
  } catch (e) {
    return handleError(e, "Özet oluşturulamadı.");
  }
}
