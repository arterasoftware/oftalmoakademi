"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertAdmin, AuthError } from "@/lib/auth/dal";
import { invalidateAllUserSessions } from "@/lib/auth/session";
import { createInvitation } from "@/lib/auth/invitations";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { emailSchema, nameSchema, uuidSchema } from "@/lib/validation";
import { getAiSettings, type AiSettings } from "@/lib/ai/client";

const roleSchema = z.enum(schema.userRoleEnum.enumValues);

async function loadTarget(id: string) {
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return u ?? null;
}

/* ------------------------------- Kullanıcılar ----------------------------- */

const roleChangeSchema = z.object({ id: uuidSchema, role: roleSchema });

export async function changeUserRoleAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const admin = await assertAdmin();
    const parsed = roleChangeSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Geçersiz veri.");
    const { id, role } = parsed.data;
    if (id === admin.id) return fail("Kendi rolünüzü değiştiremezsiniz.");
    const target = await loadTarget(id);
    if (!target) return fail("Kullanıcı bulunamadı.");
    if (target.role === role) return success(undefined, "Rol zaten aynı.");
    const db = await getDb();
    await db
      .update(schema.users)
      .set({ role, residencyYear: role === "RESIDENT" ? target.residencyYear : null, updatedAt: new Date() })
      .where(eq(schema.users.id, id));
    // Rol değişimi yetki kapsamını değiştirir: açık oturumları kapat
    await invalidateAllUserSessions(id);
    await audit(admin.id, "user.role.change", { type: "user", id }, { targetUserId: id, from: target.role, to: role });
    revalidatePath("/yonetim/kullanicilar");
    return success(undefined, "Rol güncellendi; kullanıcının oturumları sonlandırıldı.");
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[admin] role", e);
    return fail("Rol güncellenemedi.");
  }
}

const statusSchema = z.object({ id: uuidSchema, status: z.enum(schema.userStatusEnum.enumValues) });

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const { id, status } = statusSchema.parse(Object.fromEntries(formData.entries()));
  if (id === admin.id) throw new AuthError("Kendi hesabınızın durumunu değiştiremezsiniz.");
  const target = await loadTarget(id);
  if (!target || target.status === status) return;
  const db = await getDb();
  await db.update(schema.users).set({ status, updatedAt: new Date() }).where(eq(schema.users.id, id));
  if (status === "SUSPENDED") await invalidateAllUserSessions(id);
  await audit(admin.id, status === "SUSPENDED" ? "user.suspend" : "user.activate", { type: "user", id }, { targetUserId: id, from: target.status, to: status });
  revalidatePath("/yonetim/kullanicilar");
}

const idOnly = z.object({ id: uuidSchema });

export async function endUserSessionsAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const { id } = idOnly.parse(Object.fromEntries(formData.entries()));
  const target = await loadTarget(id);
  if (!target) return;
  await invalidateAllUserSessions(id);
  await audit(admin.id, "user.sessions.revoke", { type: "user", id }, { targetUserId: id, self: id === admin.id });
  revalidatePath("/yonetim/kullanicilar");
}

/** MFA sıfırlama: kullanıcı telefonunu kaybettiğinde. Sır ve kurtarma kodları silinir; oturumlar kapatılır. */
export async function resetUserMfaAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const { id } = idOnly.parse(Object.fromEntries(formData.entries()));
  const target = await loadTarget(id);
  if (!target) return;
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryHashes: null, updatedAt: new Date() })
    .where(eq(schema.users.id, id));
  await invalidateAllUserSessions(id);
  await audit(admin.id, "user.mfa.reset", { type: "user", id }, { targetUserId: id, wasEnabled: target.mfaEnabled });
  revalidatePath("/yonetim/kullanicilar");
}

/* --------------------------------- Davetler ------------------------------- */

const inviteSchema = z.object({
  email: emailSchema,
  name: z.union([z.literal(""), nameSchema]).optional(),
  role: roleSchema,
});

export type InviteResult = ActionResult<{ link: string; email: string; expiresAt: string }>;

export async function createInvitationAction(_prev: InviteResult | null, formData: FormData): Promise<InviteResult> {
  try {
    const admin = await assertAdmin();
    const parsed = inviteSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const db = await getDb();
    const existing = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${d.email}`).limit(1);
    if (existing.length) return fail("Bu e-posta ile kayıtlı bir kullanıcı zaten var.", { email: ["Kayıtlı kullanıcı."] });

    const { invitation, token } = await createInvitation({ email: d.email, name: d.name || undefined, role: d.role, invitedBy: admin.id });
    await audit(admin.id, "user.invite", { type: "invitation", id: invitation.id }, { email: d.email, role: d.role });
    revalidatePath("/yonetim/davetler");
    const link = `${env().APP_URL.replace(/\/$/, "")}/davet/${token}`;
    return success({ link, email: d.email, expiresAt: invitation.expiresAt.toISOString() }, "Davet oluşturuldu. Bağlantı yalnızca bir kez gösterilir.");
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[admin] invite", e);
    return fail("Davet oluşturulamadı.");
  }
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const { id } = idOnly.parse(Object.fromEntries(formData.entries()));
  const db = await getDb();
  const [inv] = await db.select({ email: schema.invitations.email, acceptedAt: schema.invitations.acceptedAt }).from(schema.invitations).where(eq(schema.invitations.id, id)).limit(1);
  if (!inv || inv.acceptedAt) return;
  await db.update(schema.invitations).set({ revokedAt: new Date() }).where(eq(schema.invitations.id, id));
  await audit(admin.id, "user.invite.revoke", { type: "invitation", id }, { email: inv.email });
  revalidatePath("/yonetim/davetler");
}

/* ----------------------------- Yapay zekâ ayarları ------------------------ */

const modelName = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9.-]+$/i, "Model adı yalnızca harf, rakam, nokta ve tire içerebilir.");

const aiSettingsSchema = z.object({
  provider: z.enum(["anthropic", "gemini"]),
  model: modelName,
  geminiModel: modelName,
  effort: z.enum(["low", "medium", "high"]),
  allowGeneralKnowledgeFallback: z.enum(["on"]).optional(),
  maxContextChunks: z.coerce.number().int().min(4, "En az 4.").max(16, "En fazla 16."),
  assistantMode: z.enum(["auto", "search_only"]).default("auto"),
});

export async function saveAiSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const admin = await assertAdmin();
    const parsed = aiSettingsSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const next: AiSettings = {
      provider: d.provider,
      model: d.model,
      geminiModel: d.geminiModel,
      effort: d.effort,
      allowGeneralKnowledgeFallback: d.allowGeneralKnowledgeFallback === "on",
      maxContextChunks: d.maxContextChunks,
      assistantMode: d.assistantMode,
    };
    const prev = await getAiSettings();
    const db = await getDb();
    await db
      .insert(schema.settings)
      .values({ key: "ai", value: next, updatedBy: admin.id, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: next, updatedBy: admin.id, updatedAt: new Date() } });
    await audit(admin.id, "settings.ai.update", { type: "settings", id: "ai" }, { from: prev, to: next });
    revalidatePath("/yonetim/yz-ayarlari");
    return success(undefined, "Yapay zekâ ayarları kaydedildi.");
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[admin] ai settings", e);
    return fail("Ayarlar kaydedilemedi.");
  }
}
