import "server-only";
import { getAiSettings, recordUsage, wrapUntrusted } from "./client";
import { generateText } from "./provider";
import { CASE_HINT_SYSTEM } from "./prompts";
import { formatContext, retrieve, type RetrievedChunk } from "./rag/retrieve";
import { getCaseTextForAi } from "@/lib/queries/cases";
import { SUBSPECIALTY_LABELS } from "@/db/schema";

export type CaseHintCitation = { sourceId: string; title: string; chunkId: string; page?: number };

/**
 * Asistanın klinik akıl yürütmesini destekleyen Sokratik ipucu üretir.
 * Modele olgu metni (kimliksizleştirilmiş) ve görsel açıklamaları verilir; model kesin tanı önermez.
 */
export async function generateCaseHint(opts: { caseId: string; userId: string; question: string }) {
  const c = await getCaseTextForAi(opts.caseId);
  if (!c) throw new Error("Olgu bulunamadı.");

  const caseText = [`Başlık: ${c.title}`, `Alt dal: ${SUBSPECIALTY_LABELS[c.subspecialty]}`, `Olgu metni:\n${c.body}`, c.imageCaptions.length ? `Görseller: ${c.imageCaptions.join("; ")}` : null]
    .filter(Boolean)
    .join("\n");

  // Onaylı kaynaklardan bağlam (varsa). Başarısızlık ipucu üretimini engellemez.
  let chunks: RetrievedChunk[] = [];
  try {
    chunks = await retrieve(`${opts.question} ${c.title}`.slice(0, 500), { limit: 4 });
  } catch (e) {
    console.error("[case-hint] kaynak getirme başarısız", e);
  }
  const { context, index } = formatContext(chunks);

  const settings = await getAiSettings();
  const message = await generateText({
    settings,
    maxTokens: 2000,
    system: CASE_HINT_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          "Aşağıda kimliksizleştirilmiş bir klinik olgunun asistanlara görünen bölümü ve bir asistanın sorusu/akıl yürütmesi var.",
          "Kesin tanıyı SÖYLEMEDEN, ayırıcı tanıyı daraltmaya yardımcı olacak 3-5 Sokratik soru ve ipucu ver. Kaynak kullandıysan [n] ile göster.",
          "",
          wrapUntrusted("belge", caseText),
          "",
          context ? `Onaylı kaynaklar:\n${context}` : "Onaylı kaynak bulunamadı; kaynaksız iddiaları belirsiz olarak işaretle.",
          "",
          wrapUntrusted("kullanici", opts.question),
        ].join("\n"),
      },
    ],
  });
  await recordUsage({ userId: opts.userId, feature: "case_hint", model: message.model, usage: message.usage });

  const hint = message.text;
  // Yalnızca metinde gerçekten atıf yapılan kaynakları listele
  const used = new Set(Array.from(hint.matchAll(/\[(\d{1,2})\]/g)).map((m) => Number(m[1])));
  const citations: CaseHintCitation[] = index
    .filter(({ n }) => used.has(n))
    .map(({ chunk }) => ({
      sourceId: chunk.sourceId,
      title: chunk.citation ?? chunk.sourceTitle,
      chunkId: chunk.chunkId,
      page: chunk.pageStart ?? undefined,
    }));

  return { hint, citations, usage: message.usage };
}
