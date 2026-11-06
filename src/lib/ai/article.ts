import "server-only";
import { z } from "zod";
import { getAiSettings, recordUsage, wrapUntrusted } from "./client";
import { generateJson } from "./provider";
import { ARTICLE_EVAL_SYSTEM, ARTICLE_SUGGEST_SYSTEM } from "./prompts";
import { SUBSPECIALTY_LABELS, type Article, type ArticleSummary } from "@/db/schema";

/* ------------------------------------------------------------------ */
/*  Aday değerlendirme (puanlama)                                      */
/* ------------------------------------------------------------------ */

const CandidateEvalSchema = z.object({
  evaluations: z
    .array(
      z.object({
        n: z.number().describe("Aday numarası (listedeki n)"),
        design: z.string().describe("Araştırma tasarımı ve bilimsel kalite değerlendirmesi"),
        clinicalImportance: z.string().describe("Klinik önem"),
        novelty: z.string().describe("Yenilik düzeyi"),
        limitations: z.string().describe("Sınırlılıklar"),
        score: z.number().describe("0-100 arası uygunluk puanı"),
        rationale: z.string().describe("Journal Club için neden önerildiği / önerilmediği; 2-4 cümle"),
      }),
    )
    .describe("Listedeki HER aday için bir değerlendirme"),
});

export type CandidateEvaluation = {
  design: string;
  clinicalImportance: string;
  novelty: string;
  limitations: string;
  score: number;
  rationale: string;
};

function citationLine(a: Pick<Article, "title" | "authors" | "journal" | "publishedOn" | "subspecialty">) {
  const parts = [a.authors, a.title, a.journal, a.publishedOn].filter(Boolean);
  return `${parts.join(". ")}${a.subspecialty ? ` (${SUBSPECIALTY_LABELS[a.subspecialty]})` : ""}`;
}

/**
 * Aday makaleleri künye + özet (abstract) üzerinden puanlar.
 * Tam metin kullanılmaz; değerlendirme yalnızca özetten yapılır (telif/erişim çerçevesi).
 * Döndürür: makale id -> değerlendirme.
 */
export async function evaluateArticleCandidates(opts: { candidates: Article[]; userId: string }): Promise<Map<string, CandidateEvaluation>> {
  const out = new Map<string, CandidateEvaluation>();
  const candidates = opts.candidates.slice(0, 15);
  if (candidates.length === 0) return out;

  const settings = await getAiSettings();

  const list = candidates
    .map((a, i) => {
      const n = i + 1;
      return `<aday n="${n}">\n${wrapUntrusted("belge", `${citationLine(a)}\n\nÖzet: ${(a.abstract ?? "(özet girilmedi)").slice(0, 6000)}`)}\n</aday>`;
    })
    .join("\n\n");

  const message = await generateJson({
    settings,
    schema: CandidateEvalSchema,
    maxTokens: 8000,
    system: ARTICLE_SUGGEST_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Aşağıdaki ${candidates.length} aday makaleyi Journal Club için değerlendir. Listedeki HER aday için ayrı bir değerlendirme ve 0-100 puan ver; en uygun olanları yüksek puanla. Değerlendirme yalnızca künye ve özete dayanır; tam metin yoktur.\n\n${list}`,
      },
    ],
  });
  await recordUsage({ userId: opts.userId, feature: "article_suggest", model: message.model, usage: message.usage });

  for (const ev of message.data.evaluations) {
    const a = candidates[Math.round(ev.n) - 1];
    if (!a) continue;
    out.set(a.id, {
      design: ev.design.trim(),
      clinicalImportance: ev.clinicalImportance.trim(),
      novelty: ev.novelty.trim(),
      limitations: ev.limitations.trim(),
      score: Math.max(0, Math.min(100, Math.round(ev.score))),
      rationale: ev.rationale.trim(),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Türkçe özet ve tartışma soruları                                   */
/* ------------------------------------------------------------------ */

/** `ArticleSummary` tipiyle bire bir eşleşen şema. */
const ArticleSummarySchema = z.object({
  structuredSummaryTr: z.string().describe("Türkçe yapılandırılmış özet (amaç, yöntem, bulgular, sonuç)"),
  background: z.string().describe("Arka plan"),
  methods: z.string().describe("Yöntem"),
  keyFindings: z.array(z.string()).describe("Temel bulgular"),
  strengths: z.array(z.string()).describe("Güçlü yönler"),
  weaknesses: z.array(z.string()).describe("Zayıf yönler / sınırlılıklar"),
  clinicalImplications: z.string().describe("Klinik çıkarımlar"),
  discussionQuestions: z.array(z.string()).describe("4-6 tartışma sorusu"),
});

export async function generateArticleSummary(opts: { article: Article; userId: string }): Promise<{ summary: ArticleSummary; model: string }> {
  const a = opts.article;
  if (!a.abstract?.trim()) throw new Error("Özet (abstract) girilmemiş; önce makalenin özetini ekleyin.");

  const settings = await getAiSettings();
  const message = await generateJson({
    settings,
    schema: ArticleSummarySchema,
    maxTokens: 8000,
    system: ARTICLE_EVAL_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Makale künyesi ve özeti:\n${wrapUntrusted("belge", `${citationLine(a)}${a.doi ? `\nDOI: ${a.doi}` : ""}\n\nÖzet: ${a.abstract.slice(0, 8000)}`)}\n\nYalnızca özete dayanarak Türkçe Journal Club değerlendirmesi hazırla.`,
      },
    ],
  });
  await recordUsage({ userId: opts.userId, feature: "article_eval", model: message.model, usage: message.usage });
  const p = message.data;

  const clean = (arr: string[]) => arr.map((s) => s.trim()).filter(Boolean);
  const summary: ArticleSummary = {
    structuredSummaryTr: p.structuredSummaryTr.trim(),
    background: p.background.trim(),
    methods: p.methods.trim(),
    keyFindings: clean(p.keyFindings),
    strengths: clean(p.strengths),
    weaknesses: clean(p.weaknesses),
    clinicalImplications: p.clinicalImplications.trim(),
    discussionQuestions: clean(p.discussionQuestions),
  };
  return { summary, model: message.model };
}
