import { z } from "zod";

/**
 * Ortam değişkenleri tek noktadan, şema ile doğrulanarak okunur.
 * Yalnızca sunucu tarafında import edilmelidir.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("OftalmoAkademi"),
  APP_ENCRYPTION_KEY: z
    .string()
    .min(1, "APP_ENCRYPTION_KEY zorunludur (32 bayt base64)")
    .refine((v) => Buffer.from(v, "base64").length === 32, "APP_ENCRYPTION_KEY 32 bayt base64 olmalıdır"),
  DATABASE_URL: z.string().optional().default(""),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  S3_ENDPOINT: z.string().optional().default(""),
  S3_REGION: z.string().optional().default(""),
  S3_BUCKET: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  /** Yoğunluk (503) sürerse sırayla denenecek yedek modeller (virgülle) */
  GEMINI_FALLBACK_MODELS: z.string().default("gemini-3-flash-preview,gemini-3.1-flash-lite"),
  GEMINI_EMBEDDING_MODEL: z.string().default("gemini-embedding-001"),
  VOYAGE_API_KEY: z.string().optional().default(""),
  VOYAGE_MODEL: z.string().default("voyage-3"),
  /** NCBI E-utilities (PubMed) — isteğe bağlı; anahtar saniyede 10 isteğe izin verir, yoksa 3 */
  NCBI_API_KEY: z.string().optional().default(""),
  /** NCBI'nin istediği iletişim adresi (kurumsal bir adres; kişisel adres kullanmayın) */
  NCBI_EMAIL: z.string().optional().default(""),
  /** "0" ise otomatik makale taraması zamanlayıcısı başlatılmaz */
  ARTICLE_SCAN_SCHEDULER: z.string().optional().default("1"),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional().default(""),
  BOOTSTRAP_ADMIN_NAME: z.string().optional().default(""),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Ortam değişkenleri geçersiz:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
