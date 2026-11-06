import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { getDb, schema } from "@/db";

/**
 * Anthropic istemcisi (tekil). API anahtarı yalnızca sunucuda, ortam değişkeninden okunur.
 * Model, yönetim panelindeki ayarla (settings.ai_model) veya AI_MODEL ile belirlenir.
 */
let client: Anthropic | null = null;

/** En az bir sağlayıcı anahtarı (Gemini veya Anthropic) tanımlı mı? */
export function aiAvailable(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY || env().GEMINI_API_KEY);
}

export function anthropic(): Anthropic {
  if (!aiAvailable()) throw new AiUnavailableError();
  if (!client) client = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client;
}

export class AiUnavailableError extends Error {
  constructor() {
    super("Yapay zekâ hizmeti yapılandırılmamış (ANTHROPIC_API_KEY eksik).");
    this.name = "AiUnavailableError";
  }
}

export type AiSettings = {
  /** Tercih edilen sağlayıcı; anahtarı yoksa anahtarı olana düşülür (bkz. provider.ts) */
  provider: "anthropic" | "gemini";
  /** Anthropic modeli */
  model: string;
  /** Gemini modeli */
  geminiModel: string;
  effort: "low" | "medium" | "high";
  /** Kaynaksız soruda yanıt üretilsin mi? Varsayılan hayır: belirsizlik açıkça belirtilir. */
  allowGeneralKnowledgeFallback: boolean;
  maxContextChunks: number;
  /**
   * Asistan kipi: "auto" = anahtar varsa yapay zekâ, yoksa/başarısızsa kaynak arama;
   * "search_only" = yapay zekâ hiç çağrılmaz, yalnızca kaynak alıntıları ve SSS (sıfır maliyet).
   */
  assistantMode: "auto" | "search_only";
};

const DEFAULTS: AiSettings = {
  provider: env().GEMINI_API_KEY && !env().ANTHROPIC_API_KEY ? "gemini" : "anthropic",
  model: env().AI_MODEL,
  geminiModel: env().GEMINI_MODEL,
  effort: "medium",
  allowGeneralKnowledgeFallback: false,
  maxContextChunks: 8,
  assistantMode: "auto",
};

export async function getAiSettings(): Promise<AiSettings> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.settings);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const s = (map["ai"] ?? {}) as Partial<AiSettings>;
    return { ...DEFAULTS, ...s };
  } catch {
    return DEFAULTS;
  }
}

/** Token kullanımını kaydeder (maliyet takibi). Hata fırlatmaz. */
export async function recordUsage(opts: {
  userId: string | null;
  feature: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null };
}) {
  try {
    const db = await getDb();
    await db.insert(schema.aiUsage).values({
      userId: opts.userId,
      feature: opts.feature,
      model: opts.model,
      inputTokens: opts.usage.input_tokens,
      outputTokens: opts.usage.output_tokens,
      cacheReadTokens: opts.usage.cache_read_input_tokens ?? 0,
    });
  } catch (e) {
    console.error("[ai] kullanım kaydı yazılamadı", e);
  }
}

/** Kullanıcıdan gelen metni sistem talimatlarından ayırmak için sarmalar (prompt injection azaltımı). */
export function wrapUntrusted(label: string, text: string): string {
  const safe = text.replace(/<\/?(kullanici|kaynak|belge|sistem)[^>]*>/gi, "");
  return `<${label}>\n${safe}\n</${label}>`;
}

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Güvenlik sınıflandırıcısı reddi veya kesilme durumlarını kullanıcı dostu hataya çevirir. */
export function assertCompleted(message: Anthropic.Message) {
  if (message.stop_reason === "refusal") {
    throw new Error("Yapay zekâ bu isteği güvenlik nedeniyle yanıtlamadı. Lütfen isteği yeniden ifade edin.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Yanıt çok uzun olduğu için kesildi. Daha dar bir kapsam deneyin.");
  }
}
