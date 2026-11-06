import type { RetrievedChunk } from "./rag/retrieve";
import type { AiCitation } from "@/db/schema";

export const INSUFFICIENT_TEXT =
  "Onaylı kaynaklarda bu soruya ilişkin içerik bulunamadı. Lütfen soruyu farklı ifade edin veya öğretim üyenize danışın.";

/** Sezgisel: hiç atıf yoksa ya da metin "kaynaklarda ... bulunamadı/yok" diyorsa kanıt yetersiz sayılır. */
export function isInsufficientEvidence(text: string, citationCount: number): boolean {
  if (citationCount === 0) return true;
  return /kaynaklar(da|ımızda|ında)/i.test(text) && /(bulunamadı|bulunmuyor|bulunmamakta|yok|yetersiz|yeterli değil|yer almıyor)/i.test(text);
}

const CITE_RE = /\[(\d{1,2}(?:\s*[,;–-]\s*\d{1,2})*)\]/g;

function expand(group: string): number[] {
  const out: number[] = [];
  for (const p of group.split(/\s*[,;]\s*/)) {
    const range = p.split(/\s*[–-]\s*/).map(Number);
    if (range.length === 2 && range[0] <= range[1] && range[1] - range[0] <= 20) {
      for (let n = range[0]; n <= range[1]; n++) out.push(n);
    } else out.push(range[0]);
  }
  return out;
}

/**
 * Yanıt metnindeki [n] numaralarından kullanılan parçaları çıkarır ve metni ardışık
 * numaralarla yeniden yazar ([1], [2], …) ki saklanan atıf listesiyle bire bir eşleşsin.
 * Bağlamda olmayan numaralar (model uydurmuşsa) metinden kaldırılır.
 */
export function extractCitations(text: string, index: { n: number; chunk: RetrievedChunk }[]): { text: string; citations: AiCitation[] } {
  const byN = new Map(index.map((i) => [i.n, i.chunk]));
  const order: number[] = []; // ilk görünüş sırasıyla orijinal numaralar
  const chunkToNew = new Map<string, number>();
  const nToNew = new Map<number, number>();

  for (const m of text.matchAll(CITE_RE)) {
    for (const n of expand(m[1])) {
      const chunk = byN.get(n);
      if (!chunk || nToNew.has(n)) continue;
      let newN = chunkToNew.get(chunk.chunkId);
      if (!newN) {
        newN = chunkToNew.size + 1;
        chunkToNew.set(chunk.chunkId, newN);
        order.push(n);
      }
      nToNew.set(n, newN);
    }
  }

  const rewritten = text.replace(/([ \t]*)\[(\d{1,2}(?:\s*[,;–-]\s*\d{1,2})*)\]/g, (_all, ws: string, group: string) => {
    const mapped = Array.from(new Set(expand(group).map((n) => nToNew.get(n)).filter((x): x is number => typeof x === "number"))).sort((a, b) => a - b);
    return mapped.length ? `${ws}[${mapped.join(", ")}]` : "";
  });

  const citations: AiCitation[] = [];
  const seen = new Set<string>();
  for (const n of order) {
    const chunk = byN.get(n)!;
    if (seen.has(chunk.chunkId)) continue;
    seen.add(chunk.chunkId);
    citations.push({
      sourceId: chunk.sourceId,
      chunkId: chunk.chunkId,
      title: chunk.sourceTitle,
      page: chunk.pageStart,
      excerpt: chunk.content.slice(0, 240),
    });
  }
  return { text: rewritten, citations };
}
