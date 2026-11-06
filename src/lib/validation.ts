import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Geçerli bir e-posta adresi girin.")
  .max(254);

export const passwordSchema = z.string().min(12, "Parola en az 12 karakter olmalıdır.").max(128);

export const nameSchema = z.string().trim().min(2, "Ad en az 2 karakter olmalıdır.").max(120);

export const uuidSchema = z.string().uuid("Geçersiz kimlik.");

export const totpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "6 haneli kod girin.");

/** Serbest metin alanları için üst sınır ve kırpma. */
export const longText = (max = 20000) => z.string().trim().max(max, `En fazla ${max} karakter.`);
export const shortText = (max = 300) => z.string().trim().max(max, `En fazla ${max} karakter.`);
