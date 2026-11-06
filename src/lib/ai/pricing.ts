/**
 * Yaklaşık model fiyatları (USD / 1M token). Yalnızca TAHMİNİ maliyet gösterimi için;
 * gerçek fatura Anthropic konsolundan izlenmelidir. Önbellek okumaları giriş fiyatının %10'u sayılır.
 */
export type Price = { input: number; output: number; label: string };

const TABLE: { match: RegExp; price: Price }[] = [
  // Gemini: ücretsiz katmanda 0; ücretli katman fiyatları Google AI fiyat sayfasından güncellenmelidir
  { match: /gemini/i, price: { input: 0, output: 0, label: "Gemini (ücretsiz katman)" } },
  { match: /opus/i, price: { input: 4, output: 20, label: "Opus" } },
  { match: /sonnet/i, price: { input: 2, output: 10, label: "Sonnet" } },
  { match: /haiku/i, price: { input: 0.1, output: 0.5, label: "Haiku" } },
];

export const KNOWN_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;
export const KNOWN_GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"] as const;

export function priceFor(model: string): Price | null {
  return TABLE.find((t) => t.match.test(model))?.price ?? null;
}

/** Tahmini maliyet (USD). Fiyatı bilinmeyen model için null. */
export function estimateCostUsd(model: string, tokens: { input: number; output: number; cacheRead?: number }): number | null {
  const p = priceFor(model);
  if (!p) return null;
  const cache = tokens.cacheRead ?? 0;
  return (tokens.input * p.input + cache * p.input * 0.1 + tokens.output * p.output) / 1_000_000;
}

export function formatUsd(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v);
}
