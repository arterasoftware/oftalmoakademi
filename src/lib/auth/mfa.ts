import "server-only";
import * as OTPAuth from "otpauth";
import { randomBytes } from "node:crypto";
import { decryptString, encryptString, sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";

export function generateMfaSecret(): { secretEnc: string; base32: string } {
  const secret = new OTPAuth.Secret({ size: 20 });
  return { secretEnc: encryptString(secret.base32), base32: secret.base32 };
}

export function mfaUri(base32: string, label: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: env().APP_NAME,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32),
  });
  return totp.toString();
}

export function verifyTotp(secretEnc: string, code: string): boolean {
  const base32 = decryptString(secretEnc);
  const totp = new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(base32) });
  const delta = totp.validate({ token: code.replace(/\s+/g, ""), window: 1 });
  return delta !== null;
}

/** 8 adet tek kullanımlık kurtarma kodu (10 karakter, karışabilen harfler hariç); yalnızca SHA-256 özetleri saklanır. */
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRecoveryCodes(): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: 8 }, () => {
    const bytes = randomBytes(10);
    return Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
  });
  return { plain, hashes: plain.map(sha256Hex) };
}
