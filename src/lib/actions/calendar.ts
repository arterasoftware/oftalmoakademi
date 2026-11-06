"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertStaff, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { uuidSchema, longText, shortText } from "@/lib/validation";
import { parseDatetimeLocal } from "@/lib/lesson-form";

const addSchema = z.object({
  title: shortText(200).min(2, "Başlık en az 2 karakter olmalıdır."),
  startsAt: z.string().min(1, "Başlangıç zamanı gerekir."),
  endsAt: z.string().optional(),
  description: longText(2000).optional(),
});

/** Personel: takvime serbest (OTHER) etkinlik ekler. */
export async function addCalendarEventAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertStaff();
    const parsed = addSchema.safeParse({
      title: formData.get("title"),
      startsAt: formData.get("startsAt"),
      endsAt: formData.get("endsAt") ?? undefined,
      description: formData.get("description") ?? undefined,
    });
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const startsAt = parseDatetimeLocal(d.startsAt);
    if (!startsAt) return fail("Başlangıç zamanı geçersiz.", { startsAt: ["Geçerli bir tarih ve saat girin."] });
    const endsAt = parseDatetimeLocal(d.endsAt);
    if (endsAt === undefined) return fail("Bitiş zamanı geçersiz.", { endsAt: ["Geçerli bir tarih ve saat girin."] });
    if (endsAt && endsAt < startsAt) return fail("Bitiş, başlangıçtan önce olamaz.", { endsAt: ["Bitiş, başlangıçtan önce olamaz."] });

    const db = await getDb();
    const [row] = await db
      .insert(schema.calendarEvents)
      .values({ title: d.title, kind: "OTHER", startsAt, endsAt, description: d.description?.trim() || null, createdBy: user.id })
      .returning({ id: schema.calendarEvents.id });
    await audit(user.id, "calendar.create", { type: "calendar_event", id: row.id }, { startsAt: startsAt.toISOString() });
    revalidatePath("/takvim");
    revalidatePath("/panel");
    return success(undefined, "Etkinlik eklendi.");
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[calendar.add]", e);
    return fail("Etkinlik eklenemedi.");
  }
}

const deleteSchema = z.object({ id: uuidSchema, ay: z.string().regex(/^\d{4}-\d{2}$/).optional() });

/** Yalnızca OTHER türündeki ve kendi eklediği (veya yönetici) etkinlikleri siler. */
export async function deleteCalendarEventAction(formData: FormData): Promise<void> {
  const user = await assertStaff();
  const parsed = deleteSchema.safeParse({ id: formData.get("id"), ay: formData.get("ay") ?? undefined });
  if (!parsed.success) return;
  const db = await getDb();
  const [ev] = await db.select().from(schema.calendarEvents).where(eq(schema.calendarEvents.id, parsed.data.id)).limit(1);
  if (!ev) return;
  if (ev.kind !== "OTHER") throw new AuthError("Sistem etkinlikleri (ders/makale/sınav) buradan silinemez.");
  if (ev.createdBy !== user.id && user.role !== "ADMIN") throw new AuthError();
  await db.delete(schema.calendarEvents).where(eq(schema.calendarEvents.id, ev.id));
  await audit(user.id, "calendar.delete", { type: "calendar_event", id: ev.id }, { title: ev.title });
  revalidatePath("/takvim");
  revalidatePath("/panel");
}
