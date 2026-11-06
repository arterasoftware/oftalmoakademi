import type { RetrievedChunk } from "@/lib/ai/rag/retrieve";
import type { AiCitation } from "@/db/schema";

/**
 * Yapay zekâsız "kaynak arama" yanıtı: bulunan SSS girdileri ve kaynak parçaları, modele gitmeden,
 * doğrudan alıntı olarak biçimlendirilir. Çıktı MarkdownLite ile uyumludur (**kalın**, madde, [n] atıf).
 * Hiçbir metin üretilmez; her satır ya öğretim üyesinin yazdığı yanıt ya da kaynağın kendi cümlesidir.
 */

export type FaqHit = { id: string; question: string; answer: string; sourceTitle: string | null; sourceNote: string | null; authorName: string | null };

export const SEARCH_MODE_MODEL = "kaynak-arama";

export const SEARCH_EMPTY_TEXT =
  "Onaylı kaynaklarda ve sık sorulan sorularda bu soruya ilişkin içerik bulunamadı. Sorudaki anahtar terimleri değiştirerek tekrar deneyin veya öğretim üyenize danışın.";

/** Sorgudaki anlamlı terimler (3+ harf), Türkçe küçük harfe çevrilmiş. */
export function queryTerms(query: string): string[] {
  const words = query
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  return Array.from(new Set(words));
}

/** Bir terimin metinde geçtiği yer; Türkçe eklerle de eşleşsin diye önek (kök) karşılaştırması yapılır. */
function termRegex(term: string): RegExp {
  const stem = term.length > 5 ? term.slice(0, Math.max(4, term.length - 2)) : term;
  const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${esc}[\\p{L}\\p{N}]*)`, "giu");
}

/**
 * Parça içinden sorgu terimlerinin en yoğun geçtiği ~maxLen karakterlik pencereyi seçer.
 * Terim yoksa parçanın başı döner. Cümle sınırlarına yaklaşık olarak hizalanır.
 */
export function bestSnippet(content: string, terms: string[], maxLen = 320): string {
  const text = content.replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) return text;
  const positions: number[] = [];
  for (const t of terms) {
    const re = termRegex(t);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      positions.push(m.index + m[1].length);
      if (positions.length > 200) break;
    }
  }
  let start = 0;
  if (positions.length) {
    positions.sort((a, b) => a - b);
    // En çok terim içeren pencereyi bul
    let best = 0;
    let bestStart = positions[0];
    for (let i = 0; i < positions.length; i++) {
      let j = i;
      while (j < positions.length && positions[j] - positions[i] <= maxLen * 0.8) j++;
      if (j - i > best) {
        best = j - i;
        bestStart = positions[i];
      }
    }
    start = Math.max(0, bestStart - Math.floor(maxLen * 0.25));
    // Cümle başına yaklaş
    const sentenceStart = text.lastIndexOf(". ", bestStart);
    if (sentenceStart >= 0 && bestStart - sentenceStart < maxLen * 0.4) start = sentenceStart + 2;
  }
  // Kelime ortasında başlama: bir sonraki boşluğa kay
  if (start > 0 && text[start - 1] !== " ") {
    const sp = text.indexOf(" ", start);
    if (sp >= 0 && sp - start < 30) start = sp + 1;
  }
  let end = Math.min(text.length, start + maxLen);
  const sentenceEnd = text.indexOf(". ", end - 40);
  if (sentenceEnd >= 0 && sentenceEnd - end < 60) end = sentenceEnd + 1;
  const out = text.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${out}${end < text.length ? "…" : ""}`;
}

/** Sorgu terimlerini **kalın** yapar (MarkdownLite). Var olan yıldızlar temizlenir ki biçim bozulmasın. */
export function highlightTerms(snippet: string, terms: string[]): string {
  let out = snippet.replace(/\*\*/g, "");
  for (const t of terms) {
    out = out.replace(termRegex(t), (_m, pre: string, word: string) => `${pre}**${word}**`);
  }
  return out.replace(/\*\*\*\*/g, "");
}

export type SearchAnswer = { text: string; citations: AiCitation[]; insufficient: boolean };

/** Kaynak parçalarını kaynak başına en fazla `perSource` olacak şekilde ayıklar (çeşitlilik). */
function diversify(chunks: RetrievedChunk[], perSource = 3, max = 6): RetrievedChunk[] {
  const counts = new Map<string, number>();
  const out: RetrievedChunk[] = [];
  for (const c of chunks) {
    const n = counts.get(c.sourceId) ?? 0;
    if (n >= perSource) continue;
    counts.set(c.sourceId, n + 1);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** SSS girdilerini (öğretim üyesi yanıtları) MarkdownLite bloğuna çevirir; boşsa boş dize. */
export function formatFaqBlock(faqs: FaqHit[]): string {
  if (!faqs.length) return "";
  const lines: string[] = ["### Sık sorulan sorulardan (öğretim üyesi yanıtı)"];
  for (const f of faqs) {
    lines.push(`**${f.question}**`);
    for (const l of f.answer.split(/\r?\n/)) if (l.trim()) lines.push(l.trim());
    const src = [f.sourceTitle, f.sourceNote].filter(Boolean).join(", ");
    lines.push(`— ${f.authorName ?? "Öğretim üyesi"}${src ? ` · Kaynak: ${src}` : ""}`, "");
  }
  return lines.join("\n");
}

export function buildSearchAnswer(query: string, chunks: RetrievedChunk[], faqs: FaqHit[], opts: { reason?: string } = {}): SearchAnswer {
  const terms = queryTerms(query);
  const lines: string[] = [];
  if (opts.reason) lines.push(`ℹ ${opts.reason}`, "");
  const faqBlock = formatFaqBlock(faqs);
  if (faqBlock) lines.push(faqBlock);

  const picked = diversify(chunks);
  const citations: AiCitation[] = picked.map((c) => ({
    sourceId: c.sourceId,
    chunkId: c.chunkId,
    title: c.sourceTitle,
    page: c.pageStart,
    excerpt: c.content.slice(0, 240),
  }));

  if (picked.length) {
    lines.push("### Onaylı kaynaklardan ilgili bölümler");
    picked.forEach((c, i) => {
      const loc = c.pageStart ? `, s. ${c.pageStart}${c.pageEnd && c.pageEnd !== c.pageStart ? `-${c.pageEnd}` : ""}` : "";
      // Bölüm adı başlığın tekrarıysa (tek başlıklı belgeler) gösterme
      const sec = c.section && c.section.toLocaleLowerCase("tr") !== c.sourceTitle.toLocaleLowerCase("tr") ? ` · ${c.section}` : "";
      // Numaralı liste sözdizimi kullanılmaz (aralarda alıntı satırı olduğundan her madde ayrı liste olurdu)
      lines.push(`**${i + 1}. ${c.sourceTitle}${loc}**${sec} [${i + 1}]`);
      lines.push(`"${highlightTerms(bestSnippet(c.content, terms), terms)}"`, "");
    });
  }

  if (!faqs.length && !picked.length) {
    return { text: `${opts.reason ? `ℹ ${opts.reason}\n\n` : ""}${SEARCH_EMPTY_TEXT}`, citations: [], insufficient: true };
  }

  lines.push("Bu yanıt yapay zekâ olmadan, yalnızca onaylı kaynaklardan ve öğretim üyesi yanıtlarından doğrudan alıntı olarak derlendi.");
  return { text: lines.join("\n").trim(), citations, insufficient: false };
}
