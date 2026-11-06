"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema, ftsConfig } from "@/db";
import { assertStaff, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { uuidSchema, longText, shortText } from "@/lib/validation";

const subspecialtySchema = z.enum(schema.subspecialtyEnum.enumValues);

const faqSchema = z.object({
  question: shortText(500).min(10, "Soru en az 10 karakter olmalıdır."),
  answer: longText(8000).min(20, "Yanıt en az 20 karakter olmalıdır."),
  sourceId: z.union([z.literal(""), uuidSchema]).optional(),
  sourceNote: shortText(200).optional(),
  subspecialty: z.union([z.literal(""), subspecialtySchema]).optional(),
  published: z.enum(["on"]).optional(),
});

export type FaqFormResult = ActionResult<{ id: string }>;

function revalidateFaq(id?: string) {
  revalidatePath("/sss");
  revalidatePath("/asistan");
  if (id) revalidatePath(`/sss/${id}/duzenle`);
}

/** tsvector soru + yanıt üzerinden; arama her iki alanda çalışır. */
function tsvOf(question: string, answer: string) {
  return sql`to_tsvector(${ftsConfig()}::regconfig, ${`${question}\n${answer}`})` as unknown as string;
}

async function assertSourceExists(sourceId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ id: schema.sources.id }).from(schema.sources).where(eq(schema.sources.id, sourceId)).limit(1);
  return Boolean(row);
}

export async function createFaqAction(_prev: FaqFormResult | null, formData: FormData): Promise<FaqFormResult> {
  try {
    const user = await assertStaff();
    const parsed = faqSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    if (d.sourceId && !(await assertSourceExists(d.sourceId))) return fail("Seçilen kaynak bulunamadı.", { sourceId: ["Kaynak bulunamadı."] });
    const db = await getDb();
    const [row] = await db
      .insert(schema.faqEntries)
      .values({
        question: d.question,
        answer: d.answer,
        sourceId: d.sourceId || null,
        sourceNote: d.sourceNote || null,
        subspecialty: d.subspecialty || null,
        published: d.published === "on",
        tsv: tsvOf(d.question, d.answer),
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning({ id: schema.faqEntries.id });
    await audit(user.id, "faq.create", { type: "faq", id: row.id }, { question: d.question.slice(0, 120), published: d.published === "on" });
    revalidateFaq();
    return success({ id: row.id }, d.published === "on" ? "Soru kaydedildi ve yayımlandı." : "Soru taslak olarak kaydedildi; yayımlayınca asistanlar görür.");
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[faq] create", e);
    return fail("Soru kaydedilemedi.");
  }
}

const updateSchema = faqSchema.extend({ id: uuidSchema });

export async function updateFaqAction(_prev: FaqFormResult | null, formData: FormData): Promise<FaqFormResult> {
  try {
    const user = await assertStaff();
    const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    if (d.sourceId && !(await assertSourceExists(d.sourceId))) return fail("Seçilen kaynak bulunamadı.", { sourceId: ["Kaynak bulunamadı."] });
    const db = await getDb();
    const updated = await db
      .update(schema.faqEntries)
      .set({
        question: d.question,
        answer: d.answer,
        sourceId: d.sourceId || null,
        sourceNote: d.sourceNote || null,
        subspecialty: d.subspecialty || null,
        published: d.published === "on",
        tsv: tsvOf(d.question, d.answer),
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.faqEntries.id, d.id))
      .returning({ id: schema.faqEntries.id });
    if (!updated.length) return fail("Soru bulunamadı.");
    await audit(user.id, "faq.update", { type: "faq", id: d.id }, { question: d.question.slice(0, 120), published: d.published === "on" });
    revalidateFaq(d.id);
    return success({ id: d.id }, "Soru güncellendi.");
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[faq] update", e);
    return fail("Soru güncellenemedi.");
  }
}

const idSchema = z.object({ id: uuidSchema });
const publishSchema = z.object({ id: uuidSchema, published: z.enum(["1", "0"]) });

export async function setFaqPublishedAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const d = publishSchema.parse(Object.fromEntries(formData.entries()));
  const db = await getDb();
  await db
    .update(schema.faqEntries)
    .set({ published: d.published === "1", updatedBy: user.id, updatedAt: new Date() })
    .where(eq(schema.faqEntries.id, d.id));
  await audit(user.id, d.published === "1" ? "faq.publish" : "faq.unpublish", { type: "faq", id: d.id });
  revalidateFaq(d.id);
}

export async function deleteFaqAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const { id } = idSchema.parse(Object.fromEntries(formData.entries()));
  const db = await getDb();
  const deleted = await db.delete(schema.faqEntries).where(eq(schema.faqEntries.id, id)).returning({ question: schema.faqEntries.question });
  if (deleted.length) await audit(user.id, "faq.delete", { type: "faq", id }, { question: deleted[0].question.slice(0, 120) });
  revalidateFaq();
  redirect("/sss");
}
