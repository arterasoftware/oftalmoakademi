import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { SUBSPECIALTY_LABELS, subspecialtyEnum, type Subspecialty } from "@/db/schema";
import { getAiSettings, recordUsage, wrapUntrusted } from "./client";
import { generateJson } from "./provider";
import { QUIZ_SYSTEM } from "./prompts";
import { formatContext, retrieve, sourceFullTexts } from "./rag/retrieve";

/**
 * Yapay zekâ ile çoktan seçmeli soru üretimi (sınav editörü için).
 * Üretilen sorular TASLAK olarak eklenir; öğretim üyesi onayı olmadan sınava girmez.
 */

const OptionSchema = z.object({
  key: z.enum(["A", "B", "C", "D", "E"]).describe("Seçenek harfi; A, B, C, D, E sırasıyla tam 5 seçenek"),
  text: z.string().describe("Seçenek metni"),
});

const QuestionSchema = z.object({
  stem: z.string().describe("Soru kökü; klinik senaryo dâhil, Türkçe"),
  options: z.array(OptionSchema).describe("Tam 5 seçenek: A, B, C, D, E"),
  correctKey: z.enum(["A", "B", "C", "D", "E"]).describe("Doğru seçeneğin harfi"),
  explanation: z.string().describe("2-4 cümlelik açıklama; neden doğru, diğerleri neden yanlış"),
  subspecialty: z.enum(subspecialtyEnum.enumValues).describe("Alt branş"),
  difficulty: z.number().describe("Zorluk: 1 kolay, 2 orta, 3 zor"),
  sourceRef: z.string().describe("Dayandığı kaynağın atfı; örn. '[1] Kanski, s. 412'. Kaynak yoksa boş bırak."),
});

export const QuizOutputSchema = z.object({ questions: z.array(QuestionSchema) });

export type GeneratedQuestion = z.infer<typeof QuestionSchema>;

export type DifficultyMix = "BALANCED" | "EASY" | "MEDIUM" | "HARD";

export const DIFFICULTY_MIX_LABELS: Record<DifficultyMix, string> = {
  BALANCED: "Dengeli (kolay/orta/zor)",
  EASY: "Ağırlıklı kolay",
  MEDIUM: "Ağırlıklı orta",
  HARD: "Ağırlıklı zor",
};

const MIX_TEXT: Record<DifficultyMix, string> = {
  BALANCED: "yaklaşık üçte bir kolay (1), üçte bir orta (2), üçte bir zor (3)",
  EASY: "çoğunluğu kolay (1), birkaçı orta (2)",
  MEDIUM: "çoğunluğu orta (2), birkaçı kolay veya zor",
  HARD: "çoğunluğu zor (3), birkaçı orta (2)",
};

/** Ders bağlamı: ders notu + PDF materyallerinden çıkarılmış metin (sınırlı). */
async function lessonContextText(lessonId: string, notes: string | null): Promise<string> {
  const db = await getDb();
  const mats = await db
    .select({ title: schema.lessonMaterials.title, text: schema.lessonMaterials.extractedText })
    .from(schema.lessonMaterials)
    .where(eq(schema.lessonMaterials.lessonId, lessonId));
  const parts: string[] = [];
  if (notes?.trim()) parts.push(`Ders notu:\n${notes.trim()}`);
  for (const m of mats) if (m.text?.trim()) parts.push(`Materyal: ${m.title}\n${m.text.trim().slice(0, 40_000)}`);
  return parts.join("\n\n");
}

export async function generateQuizQuestions(opts: {
  userId: string;
  count: number;
  subspecialty: Subspecialty;
  lessonId?: string | null;
  topic?: string | null;
  mix: DifficultyMix;
}): Promise<{ questions: GeneratedQuestion[]; dropped: number; contextTitles: string[]; model: string }> {
  const db = await getDb();
  const settings = await getAiSettings();

  let lessonBlock = "";
  let sourceBlock = "";
  const titles: string[] = [];

  if (opts.lessonId) {
    const [lesson] = await db.select().from(schema.lessons).where(eq(schema.lessons.id, opts.lessonId)).limit(1);
    if (lesson) {
      titles.push(`Ders: ${lesson.title}`);
      const text = await lessonContextText(lesson.id, lesson.notes);
      if (text) lessonBlock = wrapUntrusted("belge", `Ders başlığı: ${lesson.title}\n\n${text}`.slice(0, 120_000));
      const ls = await db.select({ sourceId: schema.lessonSources.sourceId }).from(schema.lessonSources).where(eq(schema.lessonSources.lessonId, lesson.id));
      const full = await sourceFullTexts(
        ls.map((r) => r.sourceId),
        140_000,
      );
      sourceBlock = full.context;
      titles.push(...full.titles);
    }
  }

  if (!sourceBlock) {
    const query = `${opts.topic?.trim() || ""} ${SUBSPECIALTY_LABELS[opts.subspecialty]}`.trim();
    const chunks = await retrieve(query, { limit: Math.min(12, settings.maxContextChunks + 4) });
    if (chunks.length) {
      sourceBlock = formatContext(chunks).context;
      for (const c of chunks) if (!titles.includes(c.sourceTitle)) titles.push(c.sourceTitle);
    }
  }

  const topicLine = opts.topic?.trim() ? `Konu odağı: ${wrapUntrusted("kullanici", opts.topic.trim().slice(0, 300))}\n` : "";
  const noContextNote =
    !lessonBlock && !sourceBlock
      ? "\nUYARI: Bu istek için onaylı kaynak bulunamadı. Soruları yalnızca genel kabul görmüş, ders kitabı düzeyindeki bilgilere dayandır ve her sorunun sourceRef alanını boş bırak.\n"
      : "";

  const user = `${topicLine}Alt branş: ${SUBSPECIALTY_LABELS[opts.subspecialty]} (${opts.subspecialty})
İstenen soru sayısı: ${opts.count}
Zorluk dağılımı: ${MIX_TEXT[opts.mix]}
${noContextNote}
${lessonBlock ? `Ders içeriği:\n${lessonBlock}\n\n` : ""}${sourceBlock ? `Kaynaklar:\n${sourceBlock}\n\n` : ""}Tam olarak ${opts.count} soru üret. Her soruda 5 seçenek (A-E) olmalı, tek doğru yanıt bulunmalı; "subspecialty" alanı ${opts.subspecialty} olmalı (soru farklı bir alt branşa daha uygunsa en uygun olanı seç).`;

  const message = await generateJson({ settings, schema: QuizOutputSchema, maxTokens: 16000, system: QUIZ_SYSTEM, messages: [{ role: "user", content: user }] });
  await recordUsage({ userId: opts.userId, feature: "quiz_gen", model: message.model, usage: message.usage });

  // Yapısal doğrulama: tam 5 seçenek, A-E anahtarları, doğru anahtar seçeneklerde
  const valid: GeneratedQuestion[] = [];
  let dropped = 0;
  for (const q of message.data.questions) {
    const keys = q.options.map((o) => o.key);
    const ok =
      q.options.length === 5 &&
      ["A", "B", "C", "D", "E"].every((k) => keys.includes(k as "A")) &&
      keys.includes(q.correctKey) &&
      q.stem.trim().length > 10 &&
      q.options.every((o) => o.text.trim().length > 0);
    if (!ok) {
      dropped++;
      continue;
    }
    const sorted = [...q.options].sort((a, b) => a.key.localeCompare(b.key)).map((o) => ({ key: o.key, text: o.text.trim() }));
    valid.push({
      ...q,
      stem: q.stem.trim(),
      options: sorted,
      explanation: q.explanation.trim(),
      difficulty: Math.min(3, Math.max(1, Math.round(Number(q.difficulty) || 2))),
      sourceRef: q.sourceRef?.trim() ?? "",
    });
    if (valid.length >= opts.count) break;
  }
  return { questions: valid, dropped, contextTitles: titles, model: message.model };
}
