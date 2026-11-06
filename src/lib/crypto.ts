import "server-only";
import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Rastgele, URL güvenli belirteç (varsayılan 32 bayt = 256 bit). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function key(): Buffer {
  return Buffer.from(env().APP_ENCRYPTION_KEY, "base64");
}

/** AES-256-GCM: `iv.ct.tag` (base64url) biçiminde döner. MFA sırları gibi hassas alanlar için. */
export function encryptString(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${ct.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptString(payload: string): string {
  const [ivB, ctB, tagB] = payload.split(".");
  if (!ivB || !ctB || !tagB) throw new Error("Geçersiz şifreli veri");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]);
  return pt.toString("utf8");
}
