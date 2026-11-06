import "server-only";
import { z } from "zod";
import { getAiSettings, recordUsage, wrapUntrusted } from "./client";
import { generateJson } from "./provider";
import { LESSON_NOTES_SYSTEM } from "./prompts";
import { SUBSPECIALTY_LABELS, type Subspecialty } from "@/db/schema";

const NotesSchema = z.object({
  summary: z.string().describe("3-5 cümlelik özet"),
  objectives: z.array(z.string()).describe("Öğrenme hedefleri (3-6 madde)"),
  keyPoints: z.array(z.string()).describe("Belgedeki en önemli noktalar; kritik terimler **kalın**"),
  pitfalls: z.array(z.string()).describe("Sık yapılan hatalar / tuzaklar (varsa)"),
  questions: z.array(z.string()).describe("Asistanın kendini sınaması için 3-5 kısa soru"),
});

/** Yüklenen belge metninden yapay zekâ ile kısa, vurgulu ders notu üretir (Markdown). */
export async function generateLessonNotesWithAi(opts: { title: string; subspecialty: Subspecialty; text: string; sourceTitles: string[]; userId: string }) {
  const settings = await getAiSettings();
  const message = await generateJson({
    settings,
    schema: NotesSchema,
    maxTokens: 6000,
    system: LESSON_NOTES_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `Ders: ${wrapUntrusted("kullanici", opts.title)} (${SUBSPECIALTY_LABELS[opts.subspecialty]})`,
          `Belgeler: ${opts.sourceTitles.join("; ")}`,
          "",
          wrapUntrusted("belge", opts.text.slice(0, 120_000)),
          "",
          "Yalnızca belgedeki bilgiye dayan; belgede olmayan iddia ekleme. Önemli terimleri **kalın** yaz.",
        ].join("\n"),
      },
    ],
  });
  await recordUsage({ userId: opts.userId, feature: "lesson_notes", model: message.model, usage: message.usage });
  const d = message.data;
  const list = (arr: string[], prefix = "- ") => arr.map((s) => s.trim()).filter(Boolean).map((s) => `${prefix}${s}`);
  const md = [
    `Kaynak: ${opts.sourceTitles.join("; ")} (yapay zekâ taslağı, ${message.model}; öğretim üyesi düzenleyip onaylamalıdır)`,
    "",
    "## Özet",
    d.summary.trim(),
    "",
    "## Öğrenme hedefleri",
    ...list(d.objectives),
    "",
    "## Önemli noktalar",
    ...list(d.keyPoints),
    ...(d.pitfalls.length ? ["", "## Tuzaklar", ...list(d.pitfalls)] : []),
    ...(d.questions.length ? ["", "## Kendini sına", ...list(d.questions, "1. ")] : []),
  ].join("\n");
  return { markdown: md, model: message.model };
}
