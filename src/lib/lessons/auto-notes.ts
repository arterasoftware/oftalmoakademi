/**
 * Yapay zekâsız ders notu: bir belgenin metninden önemli cümleleri seçip basit Markdown not üretir.
 * Saf fonksiyonlar (sunucu/istemci bağımsız, test edilebilir). Metin yeniden yazılmaz; cümleler
 * belgeden olduğu gibi alınır, anahtar terimler kalınlaştırılır.
 *
 * Yöntem (klasik çıkarımsal özetleme):
 *  1. Metin bölümlere ayrılır (kısa, büyük harfli/numaralı satırlar başlık sayılır).
 *  2. Cümleler bulunur; durak sözcükler atılıp terim sıklığı (TF) hesaplanır.
 *  3. Her cümle, içerdiği terimlerin sıklığıyla puanlanır (uzunluk normalize edilir; bölüm başı cümleleri hafif öne çıkar).
 *  4. Her bölümden en yüksek puanlı cümleler belge sırasına göre yazılır; en sık terimler "Anahtar terimler" olarak listelenir.
 */

export type AutoNotesOptions = {
  /** Toplam madde sayısı üst sınırı */
  maxPoints?: number;
  /** Bölüm başına en çok madde */
  maxPerSection?: number;
  /** Anahtar terim sayısı */
  maxTerms?: number;
  /** Not başlığında kullanılacak kaynak adı */
  sourceTitle?: string;
};

export type AutoNotesResult = {
  markdown: string;
  sections: { heading: string; points: string[] }[];
  terms: string[];
  /** Metin yetersizse false (not üretilmedi) */
  ok: boolean;
};

const STOPWORDS = new Set(
  (
    "ve veya ile için gibi bir bu şu o da de ki mi mı mu mü ancak ama fakat çünkü ise ya ne hem her çok daha en az ancak olan olarak olup olduğu olduğunu olmak olur olabilir oldukça ise ilgili göre kadar sonra önce arasında üzerinde altında içinde dışında yoluyla tarafından nedeniyle sırasında yani ayrıca örneğin genellikle sıklıkla bazen bazı tüm bütün birçok diğer başka aynı ilk son yeni eski büyük küçük yüksek düşük " +
    "the and or of in on at to for with by from as is are was were be been being this that these those it its an a not no yes if then than so such which who whom whose what when where why how also may might can could should would will shall into over under between among during after before about above below more most less least very"
  ).split(/\s+/),
);

const SENTENCE_SPLIT = /(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9"“(])/u;

export function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/** Kaba Türkçe/İngilizce kök: sık çekim eklerini atar (sınıflama için yeterli). */
export function stem(word: string): string {
  let w = word;
  for (let i = 0; i < 3; i++) {
    const next = w.replace(/(ler|lar|leri|ları|nin|nın|nün|nun|in|ın|ün|un|de|da|den|dan|ye|ya|yi|yı|yü|yu|si|sı|sü|su|le|la|ki|ler|s|es|ed|ing)$/u, "");
    if (next === w || next.length < 4) break;
    w = next;
  }
  return w;
}

function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 90) return false;
  if (/[.!?;:,]$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 12) return false;
  if (/^(\d+(\.\d+)*\.?|[IVXLC]+\.|[A-ZÇĞİÖŞÜ]\.)\s+\S/u.test(t)) return true; // numaralı başlık
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 4 && letters === letters.toLocaleUpperCase("tr-TR")) return true; // BÜYÜK HARF
  const capitalized = words.filter((w) => /^[A-ZÇĞİÖŞÜ]/u.test(w)).length;
  return words.length <= 6 && capitalized >= Math.ceil(words.length * 0.8) && !/\d{2,}/.test(t); // Başlık Biçimi
}

type Section = { heading: string; text: string };

/** Satır satır gezerek başlık/bölüm yapısını çıkarır. */
export function splitSections(text: string): Section[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sections: Section[] = [];
  let cur: Section = { heading: "", text: "" };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      cur.text += "\n";
      continue;
    }
    if (isHeading(line)) {
      if (cur.text.trim()) sections.push(cur);
      cur = { heading: line.replace(/^(\d+(\.\d+)*\.?|[IVXLC]+\.)\s+/u, ""), text: "" };
      continue;
    }
    // Satır sonu tire ile bölünmüş sözcükleri birleştir, satırları boşlukla ekle
    cur.text += (cur.text.endsWith("-") ? cur.text.slice(0, -1) && "" : " ") + line;
  }
  if (cur.text.trim()) sections.push(cur);
  return sections;
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 400 && /\p{L}{3,}/u.test(s));
}

/** Anahtar terimleri cümle içinde kalınlaştırır (en fazla 3 terim). */
export function emphasize(sentence: string, terms: string[]): string {
  let out = sentence;
  let n = 0;
  for (const term of terms) {
    if (n >= 3) break;
    const re = new RegExp(`(^|[^\\p{L}])(${escapeRe(term)}\\p{L}*)`, "iu");
    if (re.test(out)) {
      out = out.replace(re, (_m, pre: string, w: string) => `${pre}**${w}**`);
      n++;
    }
  }
  return out;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildAutoNotes(text: string, opts: AutoNotesOptions = {}): AutoNotesResult {
  const maxPoints = opts.maxPoints ?? 18;
  const maxPerSection = opts.maxPerSection ?? 5;
  const maxTerms = opts.maxTerms ?? 10;
  const sections = splitSections(text);
  const allSentences = sections.flatMap((s) => splitSentences(s.text));
  if (allSentences.length < 3) return { markdown: "", sections: [], terms: [], ok: false };

  // Terim sıklığı (köklenmiş)
  const freq = new Map<string, number>();
  const display = new Map<string, string>();
  for (const sent of allSentences) {
    for (const tok of tokenize(sent)) {
      const k = stem(tok);
      freq.set(k, (freq.get(k) ?? 0) + 1);
      if (!display.has(k) || tok.length < display.get(k)!.length) display.set(k, tok);
    }
  }
  const ranked = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  const terms = ranked.slice(0, maxTerms).map(([k]) => display.get(k)!);
  const topSet = new Set(ranked.slice(0, 40).map(([k]) => k));

  const score = (sent: string, idx: number) => {
    const toks = tokenize(sent).map(stem);
    if (toks.length === 0) return 0;
    let s = 0;
    for (const t of toks) if (topSet.has(t)) s += Math.log1p(freq.get(t) ?? 0);
    const lenNorm = Math.sqrt(toks.length);
    const positional = idx === 0 ? 1.15 : 1;
    const numeric = /\d/.test(sent) ? 1.05 : 1; // sayısal veri (doz, oran) içeren cümleler önemli olma eğiliminde
    return (s / lenNorm) * positional * numeric;
  };

  const out: { heading: string; points: string[] }[] = [];
  let budget = maxPoints;
  const perSection = Math.max(2, Math.min(maxPerSection, Math.ceil(maxPoints / Math.max(1, sections.length))));
  for (const sec of sections) {
    if (budget <= 0) break;
    const sents = splitSentences(sec.text);
    if (sents.length === 0) continue;
    const scored = sents.map((sent, i) => ({ sent, i, sc: score(sent, i) }));
    const chosen = [...scored]
      .sort((a, b) => b.sc - a.sc)
      .slice(0, Math.min(perSection, budget))
      .sort((a, b) => a.i - b.i);
    budget -= chosen.length;
    out.push({ heading: sec.heading, points: chosen.map((c) => emphasize(c.sent, terms)) });
  }

  const md: string[] = [];
  if (opts.sourceTitle) md.push(`Kaynak: ${opts.sourceTitle} (belge metninden otomatik seçilen cümleler; yapay zekâ kullanılmadı)`, "");
  if (terms.length) md.push(`**Anahtar terimler:** ${terms.join(", ")}`, "");
  for (const sec of out) {
    if (sec.heading) md.push(`## ${sec.heading}`);
    for (const pt of sec.points) md.push(`- ${pt}`);
    md.push("");
  }
  return { markdown: md.join("\n").trim(), sections: out, terms, ok: true };
}
