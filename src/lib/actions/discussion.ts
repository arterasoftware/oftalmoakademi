"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertUser, assertStaff, isStaff, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notifications";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { fail, success, type ActionResult } from "@/lib/action-result";
import { uuidSchema } from "@/lib/validation";
import { getDiscussionLock, type DiscussionTarget } from "@/lib/queries/discussion";
import { saveAudioUpload, saveImageUpload, deleteFile, UploadError } from "@/lib/storage/files";

/** Sesli yorum için en uzun kayıt (saniye) */
const COMMENT_AUDIO_MAX_SEC = 180;
/** Bir yoruma eklenebilecek en çok görsel */
const COMMENT_MAX_IMAGES = 4;

const targetSchema = z.enum(["LESSON", "ARTICLE", "CASE"]);

const addSchema = z.object({
  targetType: targetSchema,
  targetId: uuidSchema,
  parentId: uuidSchema.optional().or(z.literal("")),
  body: z.string().trim().max(5000, "Yorum en fazla 5000 karakter olabilir.").default(""),
  path: z.string().startsWith("/"),
  isFacultyCorrection: z.enum(["on"]).optional(),
  audioDurationSec: z.coerce.number().int().min(0).max(COMMENT_AUDIO_MAX_SEC, "Sesli yorum en fazla 3 dakika olabilir.").optional(),
  deidentified: z.enum(["on"]).optional(),
});

export async function addCommentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertUser();
    const raw = Object.fromEntries(formData.entries());
    if (raw.audioDurationSec === "") delete raw.audioDurationSec;
    const parsed = addSchema.safeParse(raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Geçersiz veri.");
    const d = parsed.data;

    // Sesli yorum: metin boş olabilir; ses yoksa en az 2 karakter metin gerekir
    const audio = formData.get("audio");
    const hasAudio = audio instanceof File && audio.size > 0;
    const images = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    if (images.length > COMMENT_MAX_IMAGES) return fail(`Bir yoruma en fazla ${COMMENT_MAX_IMAGES} görsel eklenebilir.`);
    const hasMedia = hasAudio || images.length > 0;
    if (!hasMedia && d.body.length < 2) return fail("Yorum metni yazın ya da ses kaydı veya görsel ekleyin.");
    if (hasMedia && d.deidentified !== "on") return fail("Ekte hasta kimlik bilgisi bulunmadığını onaylamalısınız.");

    if (!(await consumeRateLimit(`comment:${user.id}`, RATE_LIMITS.commentPerUser.limit, RATE_LIMITS.commentPerUser.window)))
      return fail("Çok hızlı yorum yapıyorsunuz. Biraz bekleyin.");
    for (let i = 0; i < (hasAudio ? 1 : 0) + images.length; i++) {
      if (!(await consumeRateLimit(`upload:${user.id}`, RATE_LIMITS.uploadPerUser.limit, RATE_LIMITS.uploadPerUser.window))) return fail("Yükleme sınırına ulaştınız; biraz bekleyin.");
    }

    if (await getDiscussionLock(d.targetType, d.targetId)) return fail("Bu tartışma sonlandırılmış.");

    const db = await getDb();
    const parentId = d.parentId || null;
    let notifyParentAuthor: string | null = null;
    if (parentId) {
      const [parent] = await db
        .select({ authorId: schema.comments.authorId, targetId: schema.comments.targetId })
        .from(schema.comments)
        .where(and(eq(schema.comments.id, parentId), eq(schema.comments.targetType, d.targetType)))
        .limit(1);
      if (!parent || parent.targetId !== d.targetId) return fail("Yanıtlanan yorum bulunamadı.");
      if (parent.authorId && parent.authorId !== user.id) notifyParentAuthor = parent.authorId;
    }

    // Ekler önce depoya yazılır; yorum kaydı başarısız olursa geri alınır
    const savedFileIds: string[] = [];
    let audioFile: { id: string } | null = null;
    const imageFiles: { id: string }[] = [];
    try {
      if (hasAudio) {
        audioFile = await saveAudioUpload({ ownerId: user.id, file: audio, kind: "COMMENT_AUDIO" });
        savedFileIds.push(audioFile.id);
      }
      for (const img of images) {
        const f = await saveImageUpload({ ownerId: user.id, kind: "COMMENT_IMAGE", file: img });
        imageFiles.push(f);
        savedFileIds.push(f.id);
      }
    } catch (e) {
      for (const id of savedFileIds) await deleteFile(id).catch(() => {});
      throw e;
    }

    let row: { id: string };
    try {
      [row] = await db
        .insert(schema.comments)
        .values({
          targetType: d.targetType,
          targetId: d.targetId,
          parentId,
          authorId: user.id,
          body: d.body,
          isFacultyCorrection: isStaff(user.role) && d.isFacultyCorrection === "on",
          audioFileId: audioFile?.id ?? null,
          audioDurationSec: audioFile ? (d.audioDurationSec ?? null) : null,
        })
        .returning({ id: schema.comments.id });
      if (imageFiles.length) await db.insert(schema.commentImages).values(imageFiles.map((f, i) => ({ commentId: row.id, fileId: f.id, order: i })));
    } catch (e) {
      for (const id of savedFileIds) await deleteFile(id).catch(() => {});
      throw e;
    }

    await audit(user.id, "comment.create", { type: "comment", id: row.id }, { targetType: d.targetType, targetId: d.targetId, audio: Boolean(audioFile), images: imageFiles.length });
    if (notifyParentAuthor) {
      await notifyUsers([notifyParentAuthor], {
        type: "COMMENT_REPLY",
        title: `${user.name} yorumunuza yanıt verdi`,
        body: (d.body || (audioFile ? "🎤 Sesli yorum" : "🖼 Görselli yorum")).slice(0, 140),
        link: `${d.path}#yorum-${row.id}`,
      });
    }
    revalidatePath(d.path);
    return success();
  } catch (e) {
    if (e instanceof AuthError || e instanceof UploadError) return fail(e.message);
    console.error(e);
    return fail("Yorum kaydedilemedi.");
  }
}

const idPathSchema = z.object({ id: uuidSchema, path: z.string().startsWith("/") });

export async function togglePinCommentAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const { id, path } = idPathSchema.parse(Object.fromEntries(formData.entries()));
  const db = await getDb();
  const [c] = await db.select({ isPinned: schema.comments.isPinned }).from(schema.comments).where(eq(schema.comments.id, id));
  if (!c) return;
  await db.update(schema.comments).set({ isPinned: !c.isPinned }).where(eq(schema.comments.id, id));
  await audit(user.id, c.isPinned ? "comment.unpin" : "comment.pin", { type: "comment", id });
  revalidatePath(path);
}

export async function deleteCommentAction(formData: FormData): Promise<void> {
  const user = await assertUser();
  const { id, path } = idPathSchema.parse(Object.fromEntries(formData.entries()));
  const db = await getDb();
  const [c] = await db.select({ authorId: schema.comments.authorId, audioFileId: schema.comments.audioFileId }).from(schema.comments).where(eq(schema.comments.id, id));
  if (!c) return;
  if (c.authorId !== user.id && !isStaff(user.role)) throw new AuthError();
  await db.update(schema.comments).set({ deletedAt: new Date(), deletedBy: user.id }).where(eq(schema.comments.id, id));
  // Sesli yorumun kaydı da silinir (FK set null); silinmiş yorumun sesi dinlenemez
  if (c.audioFileId) await deleteFile(c.audioFileId).catch(() => {});
  const imgs = await db.select({ fileId: schema.commentImages.fileId }).from(schema.commentImages).where(eq(schema.commentImages.commentId, id));
  for (const i of imgs) await deleteFile(i.fileId).catch(() => {});
  await audit(user.id, "comment.delete", { type: "comment", id }, { own: c.authorId === user.id, audio: Boolean(c.audioFileId) });
  revalidatePath(path);
}

const lockSchema = z.object({ targetType: targetSchema, targetId: uuidSchema, path: z.string().startsWith("/"), lock: z.enum(["1", "0"]) });

/** Öğretim üyesi tartışmayı sonlandırabilir / yeniden açabilir. */
export async function setDiscussionLockAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const d = lockSchema.parse(Object.fromEntries(formData.entries()));
  const db = await getDb();
  const locked = d.lock === "1";
  if (d.targetType === "LESSON") await db.update(schema.lessons).set({ discussionLocked: locked }).where(eq(schema.lessons.id, d.targetId));
  else if (d.targetType === "ARTICLE") await db.update(schema.articles).set({ discussionLocked: locked }).where(eq(schema.articles.id, d.targetId));
  else await db.update(schema.clinicalCases).set({ discussionLocked: locked }).where(eq(schema.clinicalCases.id, d.targetId));
  await audit(user.id, locked ? "discussion.lock" : "discussion.unlock", { type: d.targetType.toLowerCase(), id: d.targetId });
  revalidatePath(d.path);
}

export type { DiscussionTarget };
