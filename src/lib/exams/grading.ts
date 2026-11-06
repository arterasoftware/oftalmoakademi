/**
 * Sınav puanlama: sunucu tarafında, soruların doğru anahtarları ile.
 * İstemciye hiçbir zaman doğru anahtar/eşleştirme gönderilmez; bu dosya yalnızca sunucuda kullanılır.
 *
 * Yanıt biçimleri (exam_attempts.answers[questionId] -> string):
 *  - MULTIPLE_CHOICE / TRUE_FALSE : "A"
 *  - MULTI_SELECT                  : "A,C" (sıralı, virgüllü)
 *  - MATCHING                      : JSON {"0":"<sağ metin>","1":"<sağ metin>"} (sol dizin -> seçilen sağ öğe metni)
 */
import type { MatchingPair, QuestionType } from "@/db/schema";

export type GradableQuestion = { id: string; type: QuestionType; correctKey: string; pairs: MatchingPair[] | null; subspecialty: string };

export type GradeResult = {
  score: number;
  total: number;
  breakdown: Record<string, { correct: number; total: number }>;
};

export function normalizeMultiKey(keys: string[]): string {
  return Array.from(new Set(keys.map((k) => k.trim().toUpperCase()).filter(Boolean)))
    .sort()
    .join(",");
}

export function parseMatchingAnswer(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === "string") out[k] = val;
      return out;
    }
  } catch {
    /* geçersiz */
  }
  return {};
}

/** Tek bir sorunun doğru olup olmadığı. Eşleştirmede tüm çiftler doğru olmalıdır. */
export function isCorrect(q: GradableQuestion, answer: string | undefined): boolean {
  if (!answer) return false;
  switch (q.type) {
    case "MULTIPLE_CHOICE":
    case "TRUE_FALSE":
      return answer === q.correctKey;
    case "MULTI_SELECT":
      return normalizeMultiKey(answer.split(",")) === normalizeMultiKey(q.correctKey.split(","));
    case "MATCHING": {
      const pairs = q.pairs ?? [];
      if (pairs.length === 0) return false;
      const a = parseMatchingAnswer(answer);
      return pairs.every((p, i) => a[String(i)] === p.right);
    }
    default:
      return false;
  }
}

/** Yanıt verilmiş sayılır mı (boş soru ayrımı için). */
export function isAnswered(q: GradableQuestion | { type: QuestionType; pairs?: MatchingPair[] | null }, answer: string | undefined): boolean {
  if (!answer) return false;
  if (q.type === "MATCHING") return Object.keys(parseMatchingAnswer(answer)).length > 0;
  return answer.trim().length > 0;
}

export function gradeAnswers(questions: GradableQuestion[], answers: Record<string, string>): GradeResult {
  const breakdown: Record<string, { correct: number; total: number }> = {};
  let score = 0;
  for (const q of questions) {
    const b = (breakdown[q.subspecialty] ??= { correct: 0, total: 0 });
    b.total += 1;
    if (isCorrect(q, answers[q.id])) {
      score += 1;
      b.correct += 1;
    }
  }
  return { score, total: questions.length, breakdown };
}

export function percentage(score: number | null | undefined, total: number | null | undefined): number {
  if (!total) return 0;
  return Math.round(((score ?? 0) / total) * 100);
}

/** Sonuçların katılımcıya görünür olduğu durum. */
export function resultsVisible(exam: { status: string; resultsAt: Date | null }, now = new Date()): boolean {
  if (exam.status === "RESULTS_PUBLISHED") return true;
  if (exam.status === "CLOSED" && exam.resultsAt && exam.resultsAt.getTime() <= now.getTime()) return true;
  return false;
}

/**
 * Eşleştirme sorusunda sağ sütunun katılımcıya gösterilme sırası: soru kimliğine bağlı,
 * deterministik karıştırma (her katılımcı için aynı, doğru sıra ele verilmez).
 */
export function shuffledRightItems(questionId: string, pairs: MatchingPair[]): string[] {
  let h = 2166136261;
  for (const ch of questionId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const arr = pairs.map((p) => p.right);
  for (let i = arr.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const TRUE_FALSE_OPTIONS = [
  { key: "A", text: "Doğru" },
  { key: "B", text: "Yanlış" },
];
