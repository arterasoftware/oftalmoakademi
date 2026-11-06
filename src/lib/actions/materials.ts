"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertStaff, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { uuidSchema, shortText, longText } from "@/lib/validation";
import { saveMaterialUpload, deleteFile, UploadError } from "@/lib/storage/files";
import { extractPdfPages } from "@/lib/ai/rag/ingest";
import { videoEmbedUrl } from "@/lib/queries/materials";

async function loadEditableLesson(lessonId: string) {
  const user = await assertStaff();
  const db = await getDb();
  const [lesson] = await db.select().from(schema.lessons).where(eq(schema.lessons.id, lessonId)).limit(1);
  if (!lesson) throw new AuthError("Ders bulunamadı.");
  if (user.role !== "ADMIN" && lesson.authorId !== user.id) throw new AuthError("Bu dersi yalnızca yazarı veya yönetici düzenleyebilir.");
  return { user, lesson, db };
}

const addSchema = z.object({
  lessonId: uuidSchema,
  kind: z.enum(["PDF", "IMAGE", "MODEL3D", "VIDEO", "LINK", "AUDIO"]),
  title: shortText(200).min(2, "Başlık girin."),
  description: longText(2000).optional().or(z.literal("")),
  url: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function addMaterialAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const parsed = addSchema.safeParse({
      lessonId: formData.get("lessonId"),
      kind: formData.get("kind"),
      title: formData.get("title"),
      description: formData.get("description") ?? "",
      url: formData.get("url") ?? "",
    });
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const { user, lesson, db } = await loadEditableLesson(d.lessonId);

    let fileId: string | null = null;
    let url: string | null = null;
    let extractedText: string | null = null;

    const usesUrl = d.kind === "LINK" || (d.kind === "VIDEO" && d.url);
    if (usesUrl) {
      const u = z.string().url().safeParse(d.url);
      if (!u.success || !/^https?:$/.test(new URL(u.data).protocol)) return fail("Geçerli bir http(s) adresi girin.", { url: ["Geçerli bir adres girin."] });
      if (d.kind === "VIDEO" && !videoEmbedUrl(u.data)) {
        return fail("Video bağlantısı yalnızca YouTube veya Vimeo olabilir; diğer videoları dosya olarak yükleyin.", { url: ["YouTube/Vimeo adresi girin."] });
      }
      url = u.data;
    } else {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) return fail("Dosya seçin.", { file: ["Dosya seçin."] });
      if (!(await consumeRateLimit(`upload:${user.id}`, RATE_LIMITS.uploadPerUser.limit, RATE_LIMITS.uploadPerUser.window))) return fail("Yükleme sınırına ulaştınız; bir süre sonra tekrar deneyin.");
      const row = await saveMaterialUpload({ ownerId: user.id, kind: d.kind as "PDF" | "IMAGE" | "MODEL3D" | "VIDEO" | "AUDIO", file });
      fileId = row.id;
      if (d.kind === "PDF") {
        try {
          const pages = await extractPdfPages(Buffer.from(await file.arrayBuffer()));
          const text = pages.map((p) => p.text).join("\n\n").trim();
          extractedText = text.length > 50 ? text.slice(0, 200_000) : null;
        } catch {
          extractedText = null;
        }
      }
    }

    const [agg] = await db
      .select({ maxOrder: sql<number>`coalesce(max(${schema.lessonMaterials.order}), -1)` })
      .from(schema.lessonMaterials)
      .where(eq(schema.lessonMaterials.lessonId, lesson.id));
    const maxOrder = Number(agg?.maxOrder ?? -1);

    const [row] = await db
      .insert(schema.lessonMaterials)
      .values({ lessonId: lesson.id, kind: d.kind, title: d.title, description: d.description || null, fileId, url, extractedText, order: maxOrder + 1, uploadedBy: user.id })
      .returning({ id: schema.lessonMaterials.id });
    await audit(user.id, "lesson.material.add", { type: "lesson_material", id: row.id }, { lessonId: lesson.id, kind: d.kind });
    revalidatePath(`/dersler/${lesson.id}`);
    revalidatePath(`/dersler/${lesson.id}/duzenle`);
    return success(undefined, d.kind === "PDF" && !extractedText ? "Materyal eklendi; PDF'den metin çıkarılamadı (taranmış olabilir)." : "Materyal eklendi.");
  } catch (e) {
    if (e instanceof AuthError || e instanceof UploadError) return fail(e.message);
    console.error(e);
    return fail("Materyal eklenemedi.");
  }
}

const idSchema = z.object({ id: uuidSchema, lessonId: uuidSchema });

export async function deleteMaterialAction(formData: FormData): Promise<void> {
  const d = idSchema.parse(Object.fromEntries(formData.entries()));
  const { user, lesson, db } = await loadEditableLesson(d.lessonId);
  const [m] = await db.select().from(schema.lessonMaterials).where(and(eq(schema.lessonMaterials.id, d.id), eq(schema.lessonMaterials.lessonId, lesson.id))).limit(1);
  if (!m) return;
  await db.delete(schema.lessonMaterials).where(eq(schema.lessonMaterials.id, m.id));
  if (m.fileId) await deleteFile(m.fileId).catch(() => {});
  await audit(user.id, "lesson.material.delete", { type: "lesson_material", id: m.id }, { lessonId: lesson.id });
  revalidatePath(`/dersler/${lesson.id}`);
  revalidatePath(`/dersler/${lesson.id}/duzenle`);
}
