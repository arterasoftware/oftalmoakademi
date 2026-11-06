import "server-only";
import { z } from "zod";
import { getAiSettings, recordUsage, wrapUntrusted } from "./client";
import { generateJson } from "./provider";
import { PDF_QUESTIONS_SYSTEM } from "./prompts";
import type { ParsedQuestion } from "@/lib/exams/pdf-questions";

const Schema = z.object({
  questions: z.array(
    z.object({
      number: z.number().int().describe("Belgedeki soru numarası"),
      stem: z.string().describe("Soru kökü (olduğu gibi)"),
      options: z.array(z.object({ key: z.string().describe("A-E"), text: z.string() })).describe("Şıklar, belgedeki sırayla"),
      correctKey: z.string().nullable().describe("Belgede verilmişse doğru şık harfi; yoksa null (tahmin etme)"),
    }),
  ),
});

/** Düzensiz biçimli soru PDF'leri için yapay zekâ ile ayrıştırma. Doğru yanıt yalnızca belgede varsa doldurulur. */
export async function parseQuestionsWithAi(opts: { text: string; userId: string }): Promise<{ questions: ParsedQuestion[]; model: string }> {
  const settings = await getAiSettings();
  const message = await generateJson({
    settings,
    schema: Schema,
    maxTokens: 12000,
    system: PDF_QUESTIONS_SYSTEM,
    messages: [{ role: "user", content: ["Aşağıdaki belge metnindeki çoktan seçmeli soruları çıkar.", "", wrapUntrusted("belge", opts.text.slice(0, 150_000))].join("\n") }],
  });
  await recordUsage({ userId: opts.userId, feature: "exam_pdf_parse", model: message.model, usage: message.usage });
  const questions: ParsedQuestion[] = message.data.questions
    .map((q) => {
      const options = q.options.map((o, i) => ({ key: (o.key || String.fromCharCode(65 + i)).trim().toUpperCase().slice(0, 1), text: o.text.trim() })).filter((o) => o.text);
      const correctKey = q.correctKey && options.some((o) => o.key === q.correctKey!.toUpperCase()) ? q.correctKey.toUpperCase() : null;
      const warnings: string[] = [];
      if (options.length < 4) warnings.push(`Yalnızca ${options.length} şık bulundu.`);
      if (!correctKey) warnings.push("Doğru yanıt belirlenemedi; işaretleyin.");
      return { number: q.number, stem: q.stem.trim(), options, correctKey, warnings };
    })
    .filter((q) => q.stem.length >= 5 && q.options.length >= 2);
  return { questions, model: message.model };
}
