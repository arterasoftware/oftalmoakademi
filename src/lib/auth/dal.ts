import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSessionCookie, validateSessionToken, type SessionWithUser } from "./session";
import type { UserRole } from "@/db/schema";

/**
 * Veri Erişim Katmanı (DAL): her sunucu bileşeni, server action ve route handler
 * yetki kontrolünü yalnızca buradaki fonksiyonlarla yapar. Proxy (middleware) yalnızca
 * iyimser bir ön kontroldür; asıl karar burada verilir.
 */

export const getCurrentSession = cache(async (): Promise<SessionWithUser | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  return validateSessionToken(token);
});

/** Oturum açmış ve (gerekiyorsa) MFA'yı tamamlamış kullanıcı. Yoksa /giris'e yönlendirir. */
export async function requireUser() {
  const s = await getCurrentSession();
  if (!s) redirect("/giris");
  if (s.user.mfaEnabled && !s.session.mfaVerified) redirect("/giris/mfa");
  return s.user;
}

export async function requireRole(...roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/yetkisiz");
  return user;
}

/** Öğretim üyesi veya yönetici: içerik onay yetkisi. */
export async function requireStaff() {
  return requireRole("ADMIN", "FACULTY");
}

export async function requireAdmin() {
  return requireRole("ADMIN");
}

/* ---- Server action / route handler içinde kullanılacak yönlendirmesiz sürümler ---- */

export class AuthError extends Error {
  constructor(message = "Bu işlem için yetkiniz yok.") {
    super(message);
    this.name = "AuthError";
  }
}

export async function assertUser() {
  const s = await getCurrentSession();
  if (!s) throw new AuthError("Oturum bulunamadı.");
  if (s.user.mfaEnabled && !s.session.mfaVerified) throw new AuthError("İki adımlı doğrulama tamamlanmadı.");
  return s.user;
}

export async function assertRole(...roles: UserRole[]) {
  const user = await assertUser();
  if (!roles.includes(user.role)) throw new AuthError();
  return user;
}

export const assertStaff = () => assertRole("ADMIN", "FACULTY");
export const assertAdmin = () => assertRole("ADMIN");

export const isStaff = (role: UserRole) => role === "ADMIN" || role === "FACULTY";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Yönetici",
  FACULTY: "Öğretim Üyesi",
  RESIDENT: "Asistan Hekim",
};
