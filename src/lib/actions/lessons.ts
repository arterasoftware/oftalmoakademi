"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { Lesson, User } from "@/db/schema";
import { assertStaff, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { uuidSchema, longText, shortText } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import { aiAvailable, AiUnavailableError } from "@/lib/ai/client";
import { generateLessonNotesWithAi } from "@/lib/ai/lesson-notes";
import { buildAutoNotes } from "@/lib/lessons/auto-notes";
import { getLessonRaw } from "@/lib/queries/lessons";
import { parseDatetimeLocal } from "@/lib/lesson-form";
import { deleteFile } from "@/lib/storage/files";

/* ------------------------------------------------------------------ */
/*  Yardımcılar                                                        */
/* ------------------------------------------------------------------ */

const subspecialtySchema = z.enum(schema.subspecialtyEnum.enumValues);

function makeSlug(title: string) {
  return `${slugify(title) || "ders"}-${randomBytes(3).toString("hex")}`;
}

/** Yazar veya yönetici düzenleyebilir/yayımlayabilir. */
function canEdit(user: User, lesson: Lesson) {
  return user.role === "ADMIN" || lesson.authorId === user.id;
}

function revalidateLesson(id: string) {
  revalidatePath("/dersler");
  revalidatePath(`/dersler/${id}`);
  revalidatePath(`/dersler/${id}/duzenle`);
  revalidatePath("/panel");
  revalidatePath("/takvim");
}

function userFacingError(e: unknown, fallback: string): string {
  if (e instanceof AuthError || e instanceof AiUnavailableError) return e.message;
  if (e instanceof Error && /kesildi|güvenlik nedeniyle|ulaşılamadı|kota|quota/i.test(e.message)) return e.message;
  return fallback;
}

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const infoSchema = z.object({
  title: shortText(200).min(3, "Başlık en az 3 karakter olmalıdır."),
  subspecialty: subspecialtySchema,
  description: z.preprocess(emptyToUndef, longText(2000).optional()),
  scheduledFor: z.string().optional(),
});

/* ------------------------------------------------------------------ */
/*  Oluşturma: ders bilgileri → taslak → düzenleme sayfası             */
/* ------------------------------------------------------------------ */

export async function createLessonAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let redirectTo: string;
  try {
    const user = await assertStaff();
    const parsed = infoSchema.safeParse({
      title: formData.get("title"),
      subspecialty: formData.get("subspecialty"),
      description: formData.get("description") ?? "",
      scheduledFor: formData.get("scheduledFor") ?? undefined,
    });
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const scheduledFor = parseDatetimeLocal(d.scheduledFor);
    if (scheduledFor === undefined) return fail("Planlanan tarih geçersiz.", { scheduledFor: ["Geçerli bir tarih ve saat girin."] });

    const db = await getDb();
    const [row] = await db
      .insert(schema.lessons)
      .values({ title: d.title, slug: makeSlug(d.title), subspecialty: d.subspecialty, description: d.description ?? null, status: "DRAFT", authorId: user.id, scheduledFor })
      .returning({ id: schema.lessons.id });
    await audit(user.id, "lesson.create", { type: "lesson", id: row.id });
    revalidatePath("/dersler");
    redirectTo = `/dersler/${row.id}/duzenle?olusturuldu=1`;
  } catch (e) {
    console.error("[lessons.create]", e);
    return fail(userFacingError(e, "Ders oluşturulamadı."));
  }
  redirect(redirectTo);
}

/* ------------------------------------------------------------------ */
/*  Güncelleme: bilgiler ve ders notu                                  */
/* ------------------------------------------------------------------ */

const updateSchema = infoSchema.extend({ id: uuidSchema, notes: z.preprocess(emptyToUndef, longText(60000).optional()) });

export async function updateLessonAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertStaff();
    const parsed = updateSchema.safeParse({
      id: formData.get("id"),
      title: formData.get("title"),
      subspecialty: formData.get("subspecialty"),
      description: formData.get("description") ?? "",
      scheduledFor: formData.get("scheduledFor") ?? undefined,
      notes: formData.get("notes") ?? "",
    });
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const lesson = await getLessonRaw(d.id);
    if (!lesson) return fail("Ders bulunamadı.");
    if (!canEdit(user, lesson)) return fail("Bu dersi yalnızca yazarı veya yönetici düzenleyebilir.");
    const scheduledFor = parseDatetimeLocal(d.scheduledFor);
    if (scheduledFor === undefined) return fail("Planlanan tarih geçersiz.", { scheduledFor: ["Geçerli bir tarih ve saat girin."] });

    // Tarayıcı textarea satır sonlarını \r\n gönderir; karşılaştırma ve kayıt için normalize edilir
    const notes = d.notes ? d.notes.replace(/\r\n?/g, "\n") : undefined;
    const notesChanged = (notes ?? "") !== (lesson.notes ?? "");
    const db = await getDb();
    await db
      .update(schema.lessons)
      .set({
        title: d.title,
        subspecialty: d.subspecialty,
        description: d.description ?? null,
        scheduledFor,
        notes: notes ?? null,
        ...(notesChanged ? { notesSource: notes ? "manual" : null, notesUpdatedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.lessons.id, d.id));
    await audit(user.id, "lesson.update", { type: "lesson", id: d.id }, { status: lesson.status, notesChanged });
    revalidateLesson(d.id);
    return success(undefined, "Ders kaydedildi.");
  } catch (e) {
    console.error("[lessons.update]", e);
    return fail(userFacingError(e, "Ders kaydedilemedi."));
  }
}

/* ------------------------------------------------------------------ */
/*  Ders notu üretimi (belgeden): yapay zekâsız veya yapay zekâ ile    */
/* ------------------------------------------------------------------ */

const notesSchema = z.object({
  id: uuidSchema,
  mode: z.enum(["auto", "ai"]),
  materialIds: z.array(uuidSchema).max(10),
});

/**
 * Seçilen PDF materyallerinin metninden ders notu üretir ve taslak olarak kaydeder.
 * "auto": çıkarımsal özet, model çağrısı yok (sıfır maliyet). "ai": Gemini/Claude ile yapılandırılmış not.
 * Her iki durumda da not düzenlenebilir; yayın öğretim üyesinin kararıdır.
 */
export async function generateLessonNotesAction(_prev: ActionResult<{ notes: string }> | null, formData: FormData): Promise<ActionResult<{ notes: string }>> {
  try {
    const user = await assertStaff();
    const parsed = notesSchema.safeParse({ id: formData.get("id"), mode: formData.get("mode"), materialIds: formData.getAll("materialIds").map(String) });
    if (!parsed.success) return fail("Geçersiz istek.");
    const d = parsed.data;
    const lesson = await getLessonRaw(d.id);
    if (!lesson) return fail("Ders bulunamadı.");
    if (!canEdit(user, lesson)) return fail("Bu dersi yalnızca yazarı veya yönetici düzenleyebilir.");

    const db = await getDb();
    const mats = await db
      .select({ id: schema.lessonMaterials.id, title: schema.lessonMaterials.title, text: schema.lessonMaterials.extractedText })
      .from(schema.lessonMaterials)
      .where(and(eq(schema.lessonMaterials.lessonId, lesson.id), d.materialIds.length ? inArray(schema.lessonMaterials.id, d.materialIds) : undefined));
    const withText = mats.filter((m) => m.text && m.text.trim().length > 200);
    if (withText.length === 0) return fail("Metni çıkarılmış bir belge (PDF) seçin. Taranmış PDF'lerden metin çıkarılamaz.");
    const text = withText.map((m) => `${m.title}\n\n${m.text}`).join("\n\n");
    const titles = withText.map((m) => m.title);

    let notes: string;
    let model: string | null = null;
    if (d.mode === "ai") {
      if (!aiAvailable()) return fail("Yapay zekâ yapılandırılmamış; 'Belgeden not çıkar' seçeneğini kullanın.");
      if (!(await consumeRateLimit(`ai:${user.id}`, RATE_LIMITS.aiPerUser.limit, RATE_LIMITS.aiPerUser.window))) return fail("Yapay zekâ kullanım sınırına ulaştınız.");
      const r = await generateLessonNotesWithAi({ title: lesson.title, subspecialty: lesson.subspecialty, text, sourceTitles: titles, userId: user.id });
      notes = r.markdown;
      model = r.model;
    } else {
      const r = buildAutoNotes(text, { sourceTitle: titles.join("; "), maxPoints: 24, maxPerSection: 5 });
      if (!r.ok) return fail("Belge metni not çıkarmak için yetersiz.");
      notes = r.markdown;
    }
    await db
      .update(schema.lessons)
      .set({ notes, notesSource: d.mode, notesModel: model, notesUpdatedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.lessons.id, lesson.id));
    await audit(user.id, "lesson.notes.generate", { type: "lesson", id: lesson.id }, { mode: d.mode, model, materials: withText.length, chars: text.length });
    revalidateLesson(lesson.id);
    return success({ notes }, d.mode === "ai" ? "Yapay zekâ notu üretildi; düzenleyip kaydedin." : "Belgeden not çıkarıldı; düzenleyip kaydedin.");
  } catch (e) {
    console.error("[lessons.notes]", e);
    return fail(userFacingError(e, "Not üretilemedi."));
  }
}

/* ------------------------------------------------------------------ */
/*  Durum akışı: yayımla / yayından kaldır / arşivle / sil             */
/* ------------------------------------------------------------------ */

const workflowSchema = z.object({ id: uuidSchema, op: z.enum(["publish", "unpublish", "archive", "delete"]) });

export async function lessonWorkflowAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let deleted = false;
  try {
    const user = await assertStaff();
    const parsed = workflowSchema.safeParse({ id: formData.get("id"), op: formData.get("op") });
    if (!parsed.success) return fail("Geçersiz istek.");
    const { id, op } = parsed.data;
    const lesson = await getLessonRaw(id);
    if (!lesson) return fail("Ders bulunamadı.");
    if (!canEdit(user, lesson)) return fail("Bu dersi yalnızca yazarı veya yönetici yönetebilir.");
    const db = await getDb();
    const now = new Date();

    switch (op) {
      case "publish": {
        if (lesson.status === "PUBLISHED") return fail("Ders zaten yayında.");
        const [{ n }] = await db.select({ n: schema.lessonMaterials.id }).from(schema.lessonMaterials).where(eq(schema.lessonMaterials.lessonId, id)).limit(1).then((r) => [{ n: r.length }]);
        if (!n && !(lesson.notes && lesson.notes.trim())) return fail("Yayımlamadan önce en az bir materyal ekleyin veya ders notu yazın.");
        const first = !lesson.publishedAt;
        const eventAt = lesson.scheduledFor && lesson.scheduledFor > now ? lesson.scheduledFor : now;
        await db.update(schema.lessons).set({ status: "PUBLISHED", publishedAt: lesson.publishedAt ?? now, updatedAt: now }).where(eq(schema.lessons.id, id));
        if (first) {
          await db.insert(schema.calendarEvents).values({ title: `Ders: ${lesson.title}`, kind: "LESSON", refId: id, startsAt: eventAt, description: schema.SUBSPECIALTY_LABELS[lesson.subspecialty], createdBy: user.id });
          await notifyRoles(["RESIDENT", "FACULTY"], { type: "LESSON_PUBLISHED", title: `Yeni ders: ${lesson.title}`, body: schema.SUBSPECIALTY_LABELS[lesson.subspecialty], link: `/dersler/${id}` }, user.id);
        }
        await audit(user.id, "lesson.publish", { type: "lesson", id }, { first });
        revalidateLesson(id);
        return success(undefined, "Ders yayımlandı.");
      }
      case "unpublish": {
        if (lesson.status !== "PUBLISHED") return fail("Ders yayında değil.");
        await db.update(schema.lessons).set({ status: "DRAFT", updatedAt: now }).where(eq(schema.lessons.id, id));
        await audit(user.id, "lesson.unpublish", { type: "lesson", id });
        revalidateLesson(id);
        return success(undefined, "Ders yayından kaldırıldı (taslak).");
      }
      case "archive": {
        if (lesson.status !== "PUBLISHED") return fail("Yalnızca yayımlanmış dersler arşivlenir.");
        await db.update(schema.lessons).set({ status: "ARCHIVED", updatedAt: now }).where(eq(schema.lessons.id, id));
        await audit(user.id, "lesson.archive", { type: "lesson", id });
        revalidateLesson(id);
        return success(undefined, "Ders arşivlendi.");
      }
      case "delete": {
        if (lesson.status === "PUBLISHED") return fail("Yayındaki ders silinemez; önce yayından kaldırın.");
        const mats = await db.select({ fileId: schema.lessonMaterials.fileId }).from(schema.lessonMaterials).where(eq(schema.lessonMaterials.lessonId, id));
        await db.delete(schema.lessons).where(eq(schema.lessons.id, id));
        for (const m of mats) if (m.fileId) await deleteFile(m.fileId).catch(() => {});
        await audit(user.id, "lesson.delete", { type: "lesson", id }, { title: lesson.title, materials: mats.length });
        revalidatePath("/dersler");
        revalidatePath("/panel");
        deleted = true;
        break;
      }
    }
  } catch (e) {
    console.error("[lessons.workflow]", e);
    return fail(userFacingError(e, "İşlem tamamlanamadı."));
  }
  if (deleted) redirect("/dersler");
  return success();
}
