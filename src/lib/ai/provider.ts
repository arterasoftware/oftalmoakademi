import "server-only";
import type { ZodType } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenAI, ApiError as GeminiApiError, FinishReason, ThinkingLevel } from "@google/genai";
import { env } from "@/lib/env";
import { toGeminiSchema } from "./gemini-schema";
import type { AiSettings } from "./client";

/**
 * Sağlayıcıdan bağımsız yapay zekâ katmanı. Tüm modüller yalnızca buradaki üç işlevi kullanır:
 *   generateText, generateJson, streamText (+ embedTexts, rag/embed.ts içinde).
 * Sağlayıcı (Anthropic Claude veya Google Gemini) yönetim panelindeki ayarla seçilir;
 * anahtarı olmayan sağlayıcı seçilmişse anahtarı olana düşülür.
 */

export type AiProviderName = "anthropic" | "gemini";
export type ChatTurn = { role: "user" | "assistant"; content: string };
export type AiUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null };
export type GenResult = { text: string; model: string; provider: AiProviderName; usage: AiUsage };

export type GenerateOptions = {
  settings: AiSettings;
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  signal?: AbortSignal;
};

export class AiRequestError extends Error {
  constructor(
    message: string,
    public readonly kind: "refusal" | "max_tokens" | "rate_limit" | "auth" | "parse" | "unavailable" | "other" = "other",
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

/* -------------------------------------------------------------------------- */
/*  Sağlayıcı seçimi                                                           */
/* -------------------------------------------------------------------------- */

export function availableProviders(): AiProviderName[] {
  const e = env();
  const out: AiProviderName[] = [];
  if (e.GEMINI_API_KEY) out.push("gemini");
  if (e.ANTHROPIC_API_KEY) out.push("anthropic");
  return out;
}

export function resolveProvider(settings: AiSettings): AiProviderName {
  const avail = availableProviders();
  if (avail.length === 0) throw new AiRequestError("Yapay zekâ hizmeti yapılandırılmamış (GEMINI_API_KEY veya ANTHROPIC_API_KEY eksik).", "unavailable");
  return avail.includes(settings.provider) ? settings.provider : avail[0];
}

export function resolveModel(settings: AiSettings, provider = resolveProvider(settings)): string {
  return provider === "gemini" ? settings.geminiModel || env().GEMINI_MODEL : settings.model || env().AI_MODEL;
}

let anthropicClient: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return anthropicClient;
}
let geminiClient: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!geminiClient) geminiClient = new GoogleGenAI({ apiKey: env().GEMINI_API_KEY });
  return geminiClient;
}

/* -------------------------------------------------------------------------- */
/*  Ortak yardımcılar                                                          */
/* -------------------------------------------------------------------------- */

function anthropicUsage(m: Anthropic.Message): AiUsage {
  return { input_tokens: m.usage.input_tokens, output_tokens: m.usage.output_tokens, cache_read_input_tokens: m.usage.cache_read_input_tokens ?? 0 };
}

function checkAnthropicStop(m: Anthropic.Message) {
  if (m.stop_reason === "refusal") throw new AiRequestError("Yapay zekâ bu isteği güvenlik nedeniyle yanıtlamadı. Lütfen isteği yeniden ifade edin.", "refusal");
  if (m.stop_reason === "max_tokens") throw new AiRequestError("Yanıt çok uzun olduğu için kesildi. Daha dar bir kapsam deneyin.", "max_tokens");
}

/** Gemini'de düşünme token'ları çıktı bütçesinden düşer; yanıtın kesilmemesi için bütçeye pay eklenir. */
function geminiMaxTokens(maxTokens: number) {
  return Math.min(65000, maxTokens + 4000);
}

/** Gemini düşünme derinliği: effort -> thinkingLevel (Gemini 3.x); çıktı bütçesini düşünme tüketmesin diye sınırlı tutulur. */
function geminiThinking(effort: AiSettings["effort"]) {
  const level = effort === "high" ? ThinkingLevel.HIGH : effort === "low" ? ThinkingLevel.LOW : ThinkingLevel.MEDIUM;
  return { thinkingLevel: level, includeThoughts: false };
}

/** Birincil model yoğunsa (503) yedek modelleri sırayla dener. Kullanılan modeli döndürür. */
async function withModelFallback<T>(primary: string, fn: (model: string) => Promise<T>): Promise<{ result: T; model: string }> {
  const chain = [primary, ...env().GEMINI_FALLBACK_MODELS.split(",").map((m) => m.trim()).filter((m) => m && m !== primary)];
  let lastErr: unknown;
  for (const model of chain) {
    try {
      return { result: await withRetry(() => fn(model), 2), model };
    } catch (e) {
      lastErr = e;
      const status = e instanceof GeminiApiError ? e.status : 0;
      if (status !== 503 && status !== 404) throw e;
      console.warn(`[ai] Gemini modeli ${model} kullanılamadı (${status}); yedek deneniyor.`);
    }
  }
  throw lastErr;
}

/** Geçici yoğunluk (503) ve istek sınırı (429) hatalarında kısa bekleyip bir kez daha dener. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = e instanceof GeminiApiError ? e.status : 0;
      if ((status !== 503 && status !== 429) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

function geminiContents(messages: ChatTurn[]) {
  return messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
}

function geminiUsage(u: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number } | undefined): AiUsage {
  return {
    input_tokens: u?.promptTokenCount ?? 0,
    output_tokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    cache_read_input_tokens: u?.cachedContentTokenCount ?? 0,
  };
}

function checkGeminiFinish(reason: FinishReason | string | undefined, hadText: boolean) {
  if (reason === FinishReason.SAFETY || reason === FinishReason.PROHIBITED_CONTENT || reason === "BLOCKLIST") {
    throw new AiRequestError("Yapay zekâ bu isteği güvenlik nedeniyle yanıtlamadı. Lütfen isteği yeniden ifade edin.", "refusal");
  }
  if (reason === FinishReason.MAX_TOKENS) throw new AiRequestError("Yanıt çok uzun olduğu için kesildi. Daha dar bir kapsam deneyin.", "max_tokens");
  if (!hadText) throw new AiRequestError("Yapay zekâ boş yanıt döndürdü. Lütfen tekrar deneyin.", "other");
}

/** Sağlayıcı hatalarını kullanıcı dostu Türkçe mesaja çevirir. */
export function translateAiError(e: unknown): AiRequestError {
  if (e instanceof AiRequestError) return e;
  if (e instanceof GeminiApiError) {
    if (e.status === 429) return new AiRequestError("Gemini istek sınırı aşıldı (ücretsiz katman). Bir dakika sonra tekrar deneyin.", "rate_limit");
    if (e.status === 503) return new AiRequestError("Gemini şu anda yoğun (503). Birkaç saniye sonra tekrar deneyin.", "rate_limit");
    if (e.status === 404) return new AiRequestError("Seçili Gemini modeli bulunamadı; Yönetim → Yapay zekâ ayarları'ndan güncel bir model seçin.", "other");
    if (e.status === 401 || e.status === 403) return new AiRequestError("Gemini API anahtarı geçersiz veya yetkisiz.", "auth");
    if (e.status === 400 && /API key/i.test(e.message)) return new AiRequestError("Gemini API anahtarı geçersiz.", "auth");
    return new AiRequestError(`Gemini hatası (${e.status}).`, "other");
  }
  if (e instanceof Anthropic.RateLimitError) return new AiRequestError("Anthropic istek sınırı aşıldı. Biraz sonra tekrar deneyin.", "rate_limit");
  if (e instanceof Anthropic.AuthenticationError) return new AiRequestError("Anthropic API anahtarı geçersiz.", "auth");
  if (e instanceof Anthropic.APIError) return new AiRequestError(`Anthropic hatası (${e.status ?? "?"}).`, "other");
  return new AiRequestError("Yapay zekâ isteği başarısız oldu. Lütfen tekrar deneyin.", "other");
}

/* -------------------------------------------------------------------------- */
/*  Metin üretimi                                                              */
/* -------------------------------------------------------------------------- */

export async function generateText(o: GenerateOptions): Promise<GenResult> {
  const provider = resolveProvider(o.settings);
  const model = resolveModel(o.settings, provider);
  try {
    if (provider === "anthropic") {
      const m = await anthropic().messages.create(
        { model, max_tokens: o.maxTokens, output_config: { effort: o.settings.effort }, system: o.system, messages: o.messages },
        { signal: o.signal },
      );
      checkAnthropicStop(m);
      const text = m.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { text, model: m.model, provider, usage: anthropicUsage(m) };
    }
    const { result: r, model: used } = await withModelFallback(model, (m) =>
      gemini().models.generateContent({
        model: m,
        contents: geminiContents(o.messages),
        config: { systemInstruction: o.system, maxOutputTokens: geminiMaxTokens(o.maxTokens), thinkingConfig: geminiThinking(o.settings.effort), abortSignal: o.signal },
      }),
    );
    const text = (r.text ?? "").trim();
    checkGeminiFinish(r.candidates?.[0]?.finishReason, text.length > 0);
    return { text, model: used, provider, usage: geminiUsage(r.usageMetadata) };
  } catch (e) {
    throw translateAiError(e);
  }
}

/* -------------------------------------------------------------------------- */
/*  Yapılandırılmış (JSON) üretim                                              */
/* -------------------------------------------------------------------------- */

export async function generateJson<T>(o: GenerateOptions & { schema: ZodType<T> }): Promise<GenResult & { data: T }> {
  const provider = resolveProvider(o.settings);
  const model = resolveModel(o.settings, provider);
  try {
    if (provider === "anthropic") {
      const m = await anthropic().messages.parse(
        {
          model,
          max_tokens: o.maxTokens,
          output_config: { effort: o.settings.effort, format: zodOutputFormat(o.schema) },
          system: o.system,
          messages: o.messages,
        },
        { signal: o.signal },
      );
      checkAnthropicStop(m);
      if (!m.parsed_output) throw new AiRequestError("Yapay zekâ çıktısı ayrıştırılamadı. Lütfen tekrar deneyin.", "parse");
      const text = m.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      return { data: m.parsed_output as T, text, model: m.model, provider, usage: anthropicUsage(m) };
    }
    const { result: r, model: used } = await withModelFallback(model, (m) =>
      gemini().models.generateContent({
        model: m,
        contents: geminiContents(o.messages),
        config: {
          systemInstruction: o.system,
          maxOutputTokens: geminiMaxTokens(o.maxTokens),
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(o.schema),
          thinkingConfig: geminiThinking(o.settings.effort),
          abortSignal: o.signal,
        },
      }),
    );
    const text = (r.text ?? "").trim();
    checkGeminiFinish(r.candidates?.[0]?.finishReason, text.length > 0);
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(text);
    } catch {
      throw new AiRequestError("Yapay zekâ çıktısı JSON olarak ayrıştırılamadı. Lütfen tekrar deneyin.", "parse");
    }
    const parsed = o.schema.safeParse(parsedRaw);
    if (!parsed.success) throw new AiRequestError("Yapay zekâ çıktısı beklenen biçime uymadı. Lütfen tekrar deneyin.", "parse");
    return { data: parsed.data, text, model: used, provider, usage: geminiUsage(r.usageMetadata) };
  } catch (e) {
    throw translateAiError(e);
  }
}

/* -------------------------------------------------------------------------- */
/*  Akışlı metin                                                               */
/* -------------------------------------------------------------------------- */

export type TextStream = {
  /** Metin parçaları; tüketildikten sonra `final()` çağrılır. */
  chunks: AsyncIterable<string>;
  final: () => Promise<GenResult>;
  abort: () => void;
  aborted: () => boolean;
};

export function streamText(o: GenerateOptions): TextStream {
  const provider = resolveProvider(o.settings);
  const model = resolveModel(o.settings, provider);
  const controller = new AbortController();
  if (o.signal) o.signal.addEventListener("abort", () => controller.abort(), { once: true });
  let aborted = false;
  const abort = () => {
    aborted = true;
    controller.abort();
  };

  if (provider === "anthropic") {
    const stream = anthropic().messages.stream(
      { model, max_tokens: o.maxTokens, output_config: { effort: o.settings.effort }, system: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }], messages: o.messages },
      { signal: controller.signal },
    );
    const chunks = (async function* () {
      try {
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
        }
      } catch (e) {
        if (!aborted) throw translateAiError(e);
      }
    })();
    return {
      chunks,
      final: async () => {
        const m = await stream.finalMessage().catch((e) => {
          throw translateAiError(e);
        });
        checkAnthropicStop(m);
        const text = m.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
        return { text, model: m.model, provider, usage: anthropicUsage(m) };
      },
      abort,
      aborted: () => aborted,
    };
  }

  let text = "";
  let usage: AiUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
  let finish: FinishReason | string | undefined;
  let usedModel = model;
  const chunks = (async function* () {
    try {
      const { result: s, model: m } = await withModelFallback(model, (mm) =>
        gemini().models.generateContentStream({
          model: mm,
          contents: geminiContents(o.messages),
          config: { systemInstruction: o.system, maxOutputTokens: geminiMaxTokens(o.maxTokens), thinkingConfig: geminiThinking(o.settings.effort), abortSignal: controller.signal },
        }),
      );
      usedModel = m;
      for await (const chunk of s) {
        const t = chunk.text ?? "";
        if (t) {
          text += t;
          yield t;
        }
        if (chunk.usageMetadata) usage = geminiUsage(chunk.usageMetadata);
        const fr = chunk.candidates?.[0]?.finishReason;
        if (fr) finish = fr;
      }
    } catch (e) {
      if (!aborted) throw translateAiError(e);
    }
  })();
  return {
    chunks,
    final: async () => {
      checkGeminiFinish(finish, text.length > 0);
      return { text, model: usedModel, provider, usage };
    },
    abort,
    aborted: () => aborted,
  };
}

/* -------------------------------------------------------------------------- */
/*  Gemini embedding (rag/embed.ts tarafından kullanılır)                      */
/* -------------------------------------------------------------------------- */

export async function geminiEmbed(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY", dimensions: number): Promise<number[][]> {
  const out: number[][] = [];
  const model = env().GEMINI_EMBEDDING_MODEL;
  for (let i = 0; i < texts.length; i += 50) {
    const batch = texts.slice(i, i + 50);
    try {
      const r = await gemini().models.embedContent({ model, contents: batch, config: { taskType, outputDimensionality: dimensions } });
      for (const e of r.embeddings ?? []) out.push(normalize(e.values ?? []));
    } catch (e) {
      throw translateAiError(e);
    }
  }
  return out;
}

/** Gemini küçültülmüş boyutlarda normalize vektör döndürmez; kosinüs için birim uzunluğa getir. */
function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}
