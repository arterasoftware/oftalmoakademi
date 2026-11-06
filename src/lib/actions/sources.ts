"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertStaff, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { uuidSchema, longText, shortText } from "@/lib/validation";
import { savePdfUpload, deleteFile, UploadError } from "@/lib/storage/files";
import { ingestSource } from "@/lib/ai/rag/ingest";
import { retrieve, type RetrievedChunk } from "@/lib/ai/rag/retrieve";

const subspecialtySchema = z.enum(schema.subspecialtyEnum.enumValues);

/** Kaynaklar hem /kaynaklar hem de Yönetim → Kaynaklar sekmesinde listelenir; ikisi de yenilenir. */
function revalidateSources(id?: string) {
  revalidatePath("/kaynaklar");
  revalidatePath("/yonetim/kaynaklar");
  revalidatePath("/yonetim");
  if (id) revalidatePath(`/kaynaklar/${id}`);
}

/** Silme/onay sonrası dönülecek sayfa; yalnızca bilinen iç yollar kabul edilir (açık yönlendirme engeli). */
const RETURN_PATHS = ["/kaynaklar", "/yonetim/kaynaklar"] as const;
const returnToSchema = z.enum(RETURN_PATHS).optional();

const createSchema = z.object({
  type: z.enum(["PDF", "TEXT"]),
  title: shortText(300).min(3, "Başlık en az 3 karakter olmalıdır."),
  authors: shortText(500).optional(),
  year: z
    .union([z.literal(""), z.coerce.number().int().min(1800, "Geçersiz yıl.").max(2100, "Geçersiz yıl.")])
    .optional(),
  citation: longText(1500).min(10, "Atıf bilgisi zorunludur (en az 10 karakter)."),
  doi: shortText(200).optional(),
  url: z.union([z.literal(""), z.string().trim().url("Geçerli bir URL girin.").max(1000)]).optional(),
  subspecialty: z.union([z.literal(""), subspecialtySchema]).optional(),
  licenseNote: longText(1000).min(5, "Telif / kullanım izni açıklaması zorunludur."),
  rawText: longText(400_000).optional(),
});

export type CreateSourceResult = ActionResult<{ id: string; chunks: number }>;

/**
 * Kaynak ekler ve hemen indeksler (işlem, onlarca sayfalık PDF'lerde saniyeler sürebilir).
 * Yalnızca öğretim üyesi/yönetici. Uzman onayı ayrı bir adımdır.
 */
export async function createSourceAction(_prev: CreateSourceResult | null, formData: FormData): Promise<CreateSourceResult> {
  let fileId: string | null = null;
  try {
    const user = await assertStaff();
    const raw: Record<string, unknown> = {};
    for (const [k, v] of formData.entries()) if (typeof v === "string") raw[k] = v;
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;

    if (!(await consumeRateLimit(`upload:${user.id}`, RATE_LIMITS.uploadPerUser.limit, RATE_LIMITS.uploadPerUser.window)))
      return fail("Çok fazla yükleme yaptınız. Lütfen bir süre sonra tekrar deneyin.");

    const db = await getDb();

    if (d.type === "PDF") {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) return fail("PDF dosyası seçin.", { file: ["PDF dosyası seçin."] });
      const saved = await savePdfUpload({ ownerId: user.id, file });
      fileId = saved.id;
    } else if (!d.rawText || d.rawText.length < 50) {
      return fail("Metin en az 50 karakter olmalıdır.", { rawText: ["Metin en az 50 karakter olmalıdır."] });
    }

    const [row] = await db
      .insert(schema.sources)
      .values({
        title: d.title,
        type: d.type,
        citation: d.citation,
        authors: d.authors || null,
        year: typeof d.year === "number" ? d.year : null,
        url: d.url || null,
        doi: d.doi || null,
        licenseNote: d.licenseNote,
        subspecialty: d.subspecialty || null,
        fileId,
        rawText: d.type === "TEXT" ? d.rawText : null,
        uploadedBy: user.id,
      })
      .returning({ id: schema.sources.id });

    await audit(user.id, "source.create", { type: "source", id: row.id }, { type: d.type, title: d.title, fileId });

    try {
      const { chunks } = await ingestSource(row.id);
      await audit(user.id, "source.ingest", { type: "source", id: row.id }, { chunks });
      revalidateSources();
      return success({ id: row.id, chunks }, `Kaynak eklendi ve ${chunks} parçaya ayrılarak indekslendi. Uzman onayı verildikten sonra yapay zekâ tarafından kullanılabilir.`);
    } catch (e) {
      revalidateSources();
      const msg = e instanceof Error ? e.message : "İndeksleme hatası";
      return success({ id: row.id, chunks: 0 }, `Kaynak kaydedildi ancak indekslenemedi: ${msg}. Kaynak sayfasından yeniden indeksleyebilirsiniz.`);
    }
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    if (e instanceof UploadError) return fail(e.message, { file: [e.message] });
    console.error("[sources] create", e);
    return fail("Kaynak eklenemedi.");
  }
}

const idSchema = z.object({ id: uuidSchema });

export async function reindexSourceAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const { id } = idSchema.parse(Object.fromEntries(formData.entries()));
  try {
    const { chunks } = await ingestSource(id);
    await audit(user.id, "source.reindex", { type: "source", id }, { chunks });
  } catch (e) {
    await audit(user.id, "source.reindex_failed", { type: "source", id }, { error: e instanceof Error ? e.message.slice(0, 300) : "?" });
  }
  revalidateSources(id);
}

const approvalSchema = z.object({ id: uuidSchema, approved: z.enum(["1", "0"]) });

/** Uzman onayı: yalnızca onaylı ve READY kaynaklar yapay zekâ tarafından aranır. */
export async function setSourceApprovalAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const d = approvalSchema.parse(Object.fromEntries(formData.entries()));
  const approved = d.approved === "1";
  const db = await getDb();
  const [src] = await db.select({ approved: schema.sources.approved, status: schema.sources.status }).from(schema.sources).where(eq(schema.sources.id, d.id)).limit(1);
  if (!src) return;
  await db
    .update(schema.sources)
    .set({ approved, approvedBy: approved ? user.id : null, updatedAt: new Date() })
    .where(eq(schema.sources.id, d.id));
  await audit(user.id, approved ? "source.approve" : "source.unapprove", { type: "source", id: d.id }, { from: src.approved, to: approved, status: src.status });
  revalidateSources(d.id);
}

const deleteSchema = z.object({ id: uuidSchema, returnTo: returnToSchema });

/**
 * Kaynağı kalıcı olarak siler: parçalar (source_chunks) ve ders bağlantıları (lesson_sources) veritabanında
 * cascade ile, PDF dosyası depolamadan silinir. Geçmiş yapay zekâ yanıtlarındaki atıf metinleri korunur
 * (yalnızca metin olarak saklanır). `returnTo` verilirse işlem sonrası o sayfaya yönlendirilir.
 */
export async function deleteSourceAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const { id, returnTo } = deleteSchema.parse(Object.fromEntries(formData.entries()));
  const db = await getDb();
  const [src] = await db
    .select({ fileId: schema.sources.fileId, title: schema.sources.title, approved: schema.sources.approved, chunkCount: schema.sources.chunkCount })
    .from(schema.sources)
    .where(eq(schema.sources.id, id))
    .limit(1);
  if (!src) {
    if (returnTo) redirect(returnTo);
    return;
  }
  const [{ c: lessonCount }] = await db.select({ c: count() }).from(schema.lessonSources).where(eq(schema.lessonSources.sourceId, id));
  await db.delete(schema.sources).where(eq(schema.sources.id, id)); // parçalar ve ders bağlantıları cascade ile silinir
  if (src.fileId) await deleteFile(src.fileId).catch((e) => console.error("[sources] dosya silinemedi", e));
  await audit(user.id, "source.delete", { type: "source", id }, {
    title: src.title,
    fileId: src.fileId,
    approved: src.approved,
    chunks: src.chunkCount,
    linkedLessons: Number(lessonCount ?? 0),
  });
  revalidateSources(id);
  if (returnTo) redirect(returnTo);
}

const searchSchema = z.object({ id: uuidSchema, q: z.string().trim().min(2, "En az 2 karakter girin.").max(500) });

export type SearchTestResult = ActionResult<{ hits: RetrievedChunk[]; note?: string }>;

/** Kaynak sayfasındaki "Arama testi": yalnızca bu kaynak içinde getirme çalıştırır. */
export async function testRetrieveAction(_prev: SearchTestResult | null, formData: FormData): Promise<SearchTestResult> {
  try {
    await assertStaff();
    const parsed = searchSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Geçersiz sorgu.");
    const { id, q } = parsed.data;
    const db = await getDb();
    const [src] = await db.select({ approved: schema.sources.approved, status: schema.sources.status }).from(schema.sources).where(eq(schema.sources.id, id)).limit(1);
    if (!src) return fail("Kaynak bulunamadı.");
    const hits = await retrieve(q, { limit: 8, sourceIds: [id] });
    const note =
      !src.approved || src.status !== "READY"
        ? "Bu kaynak onaylı ve hazır olmadığı için getirme sonucu boş döner; onay verildikten sonra tekrar deneyin."
        : undefined;
    return success({ hits, note });
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[sources] test retrieve", e);
    return fail("Arama çalıştırılamadı.");
  }
}
