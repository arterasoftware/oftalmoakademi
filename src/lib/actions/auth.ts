"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { hashPassword, passwordPolicyError, verifyPassword } from "@/lib/auth/password";
import {
  clearSessionCookie,
  createSession,
  invalidateAllUserSessions,
  invalidateSession,
  markSessionMfaVerified,
  setSessionCookie,
} from "@/lib/auth/session";
import { getCurrentSession } from "@/lib/auth/dal";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { getClientIp, getUserAgent } from "@/lib/request";
import { audit } from "@/lib/audit";
import { emailSchema, passwordSchema, nameSchema, totpSchema } from "@/lib/validation";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { findValidInvitation } from "@/lib/auth/invitations";
import { generateMfaSecret, generateRecoveryCodes, mfaUri, verifyTotp } from "@/lib/auth/mfa";
import { sha256Hex } from "@/lib/crypto";

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Parola girin.").max(128) });

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
  const { email, password } = parsed.data;

  const ip = await getClientIp();
  const okIp = await consumeRateLimit(`login:ip:${ip ?? "?"}`, RATE_LIMITS.loginPerIp.limit, RATE_LIMITS.loginPerIp.window);
  const okEmail = await consumeRateLimit(`login:email:${email}`, RATE_LIMITS.loginPerEmail.limit, RATE_LIMITS.loginPerEmail.window);
  if (!okIp || !okEmail) {
    await audit(null, "auth.login.rate_limited", undefined, { email });
    return fail("Çok fazla deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.");
  }

  const db = await getDb();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);

  // Kullanıcı yoksa da aynı süreyi harca (zamanlama sızıntısını azalt)
  const valid = user ? await verifyPassword(user.passwordHash, password) : await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", password);
  if (!user || !valid) {
    await audit(user?.id ?? null, "auth.login.failed", undefined, { email });
    return fail("E-posta veya parola hatalı.");
  }
  if (user.status !== "ACTIVE") {
    await audit(user.id, "auth.login.suspended");
    return fail("Hesabınız askıya alınmış. Yöneticinizle iletişime geçin.");
  }

  const { token } = await createSession({
    userId: user.id,
    ip,
    userAgent: await getUserAgent(),
    mfaVerified: !user.mfaEnabled,
  });
  await setSessionCookie(token);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  await audit(user.id, "auth.login.success");

  redirect(user.mfaEnabled ? "/giris/mfa" : "/panel");
}

export async function mfaVerifyAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const s = await getCurrentSession();
  if (!s) redirect("/giris");
  if (!s.user.mfaEnabled || !s.user.mfaSecretEnc) redirect("/panel");

  const ok = await consumeRateLimit(`mfa:${s.session.id}`, RATE_LIMITS.mfaPerSession.limit, RATE_LIMITS.mfaPerSession.window);
  if (!ok) {
    await invalidateSession(s.session.id);
    await clearSessionCookie();
    await audit(s.user.id, "auth.mfa.rate_limited");
    redirect("/giris?hata=mfa");
  }

  const code = String(formData.get("code") ?? "").trim();
  const db = await getDb();

  // Kurtarma kodu mu?
  if (code.length >= 8 && !/^\d{6}$/.test(code)) {
    const h = sha256Hex(code.toUpperCase());
    const hashes = s.user.mfaRecoveryHashes ?? [];
    if (hashes.includes(h)) {
      await db
        .update(schema.users)
        .set({ mfaRecoveryHashes: hashes.filter((x) => x !== h) })
        .where(eq(schema.users.id, s.user.id));
      await markSessionMfaVerified(s.session.id);
      await audit(s.user.id, "auth.mfa.recovery_used");
      redirect("/panel");
    }
    return fail("Kod geçersiz.");
  }

  const parsed = totpSchema.safeParse(code);
  if (!parsed.success || !verifyTotp(s.user.mfaSecretEnc, parsed.data)) {
    await audit(s.user.id, "auth.mfa.failed");
    return fail("Kod geçersiz veya süresi dolmuş.");
  }
  await markSessionMfaVerified(s.session.id);
  await audit(s.user.id, "auth.mfa.success");
  redirect("/panel");
}

export async function logoutAction() {
  const s = await getCurrentSession();
  if (s) {
    await invalidateSession(s.session.id);
    await audit(s.user.id, "auth.logout");
  }
  await clearSessionCookie();
  redirect("/giris");
}

const acceptSchema = z.object({
  token: z.string().min(20),
  name: nameSchema,
  password: passwordSchema,
  passwordConfirm: z.string(),
  title: z.string().trim().max(60).optional(),
  residencyYear: z.coerce.number().int().min(1).max(6).optional(),
  kvkk: z.literal("on", { message: "Aydınlatma metnini onaylamanız gerekir." }),
});

export async function acceptInvitationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const raw = Object.fromEntries(formData.entries());
  if (raw.residencyYear === "") delete raw.residencyYear;
  const parsed = acceptSchema.safeParse(raw);
  if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  if (d.password !== d.passwordConfirm) return fail("Parolalar eşleşmiyor.", { passwordConfirm: ["Parolalar eşleşmiyor."] });

  const inv = await findValidInvitation(d.token);
  if (!inv) return fail("Davet bağlantısı geçersiz veya süresi dolmuş.");

  const policy = passwordPolicyError(d.password, inv.email);
  if (policy) return fail(policy, { password: [policy] });

  const db = await getDb();
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${inv.email}`)
    .limit(1);
  if (existing.length) return fail("Bu e-posta ile kayıtlı bir hesap zaten var. Giriş yapın.");

  const passwordHash = await hashPassword(d.password);
  const [user] = await db
    .insert(schema.users)
    .values({
      email: inv.email,
      name: d.name,
      title: d.title || null,
      role: inv.role,
      residencyYear: inv.role === "RESIDENT" ? d.residencyYear ?? null : null,
      passwordHash,
    })
    .returning();
  await db.update(schema.invitations).set({ acceptedAt: new Date() }).where(eq(schema.invitations.id, inv.id));
  await audit(user.id, "auth.invitation.accepted", { type: "invitation", id: inv.id }, { role: inv.role });

  const { token } = await createSession({ userId: user.id, ip: await getClientIp(), userAgent: await getUserAgent(), mfaVerified: true });
  await setSessionCookie(token);
  redirect("/panel?hosgeldiniz=1");
}

const changePasswordSchema = z.object({
  current: z.string().min(1),
  next: passwordSchema,
  nextConfirm: z.string(),
});

export async function changePasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const s = await getCurrentSession();
  if (!s) redirect("/giris");
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return fail("Bilgileri kontrol edin.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  if (d.next !== d.nextConfirm) return fail("Yeni parolalar eşleşmiyor.");
  const policy = passwordPolicyError(d.next, s.user.email);
  if (policy) return fail(policy);
  if (!(await verifyPassword(s.user.passwordHash, d.current))) return fail("Mevcut parola hatalı.");

  const db = await getDb();
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(d.next), passwordChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.users.id, s.user.id));
  await invalidateAllUserSessions(s.user.id, s.session.id);
  await audit(s.user.id, "auth.password.changed");
  return success(undefined, "Parolanız güncellendi. Diğer cihazlardaki oturumlar kapatıldı.");
}

/** MFA kurulumu 1. adım: sır üret, QR için URI döndür (henüz etkin değil). */
export async function beginMfaSetupAction(): Promise<ActionResult<{ uri: string; base32: string; secretEnc: string }>> {
  const s = await getCurrentSession();
  if (!s) redirect("/giris");
  if (s.user.mfaEnabled) return fail("İki adımlı doğrulama zaten etkin.");
  const { secretEnc, base32 } = generateMfaSecret();
  return success({ uri: mfaUri(base32, s.user.email), base32, secretEnc });
}

/** MFA kurulumu 2. adım: kodu doğrula, etkinleştir, kurtarma kodlarını döndür. */
export async function confirmMfaSetupAction(
  _prev: ActionResult<{ recoveryCodes: string[] }> | null,
  formData: FormData,
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const s = await getCurrentSession();
  if (!s) redirect("/giris");
  const secretEnc = String(formData.get("secretEnc") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!secretEnc || !totpSchema.safeParse(code).success) return fail("6 haneli kodu girin.");
  let valid = false;
  try {
    valid = verifyTotp(secretEnc, code);
  } catch {
    valid = false;
  }
  if (!valid) return fail("Kod doğrulanamadı. Uygulamadaki güncel kodu girin.");

  const { plain, hashes } = generateRecoveryCodes();
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ mfaEnabled: true, mfaSecretEnc: secretEnc, mfaRecoveryHashes: hashes, updatedAt: new Date() })
    .where(eq(schema.users.id, s.user.id));
  await markSessionMfaVerified(s.session.id);
  await audit(s.user.id, "auth.mfa.enabled");
  return success({ recoveryCodes: plain }, "İki adımlı doğrulama etkinleştirildi.");
}

export async function disableMfaAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const s = await getCurrentSession();
  if (!s) redirect("/giris");
  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(s.user.passwordHash, password))) return fail("Parola hatalı.");
  const db = await getDb();
  await db
    .update(schema.users)
    .set({ mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryHashes: null, updatedAt: new Date() })
    .where(eq(schema.users.id, s.user.id));
  await audit(s.user.id, "auth.mfa.disabled");
  return success(undefined, "İki adımlı doğrulama kapatıldı.");
}
