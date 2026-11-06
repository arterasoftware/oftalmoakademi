import "server-only";
import { hash, verify } from "@node-rs/argon2";

/** OWASP önerisi: Argon2id, m=19 MiB, t=2, p=1 */
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 /* Argon2id */ };

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Parola politikası: en az 12 karakter, en fazla 128, boşluk kırpılmaz.
 * Karakter sınıfı zorunluluğu yerine uzunluk + yaygın parola kontrolü (NIST 800-63B).
 */
const COMMON = new Set([
  "123456789012",
  "password1234",
  "qwertyuiop12",
  "oftalmoloji1",
  "oftalmoakademi",
  "asistan12345",
  "hastane12345",
]);

export function passwordPolicyError(password: string, email?: string): string | null {
  if (password.length < 12) return "Parola en az 12 karakter olmalıdır.";
  if (password.length > 128) return "Parola en fazla 128 karakter olabilir.";
  if (COMMON.has(password.toLowerCase())) return "Bu parola çok yaygın; farklı bir parola seçin.";
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase())) {
    return "Parola e-posta adresinizi içermemelidir.";
  }
  return null;
}
