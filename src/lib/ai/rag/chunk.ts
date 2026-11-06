/**
 * Metin parçalama: paragraf sınırlarına saygılı, ~900 karakterlik parçalar, 120 karakter örtüşme.
 * Sayfa bilgisi korunur (PDF). Saf fonksiyon; test edilebilir.
 */
export type PageText = { page: number; text: string };
export type Chunk = { idx: number; content: string; pageStart: number | null; pageEnd: number | null; section: string | null };

const TARGET = 900;
const MAX = 1300;
const OVERLAP = 120;

function normalize(t: string) {
  return t
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/-\n(?=[a-zçğıöşü])/g, "") // satır sonu heceleme
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitLong(p: string): string[] {
  if (p.length <= MAX) return [p];
  const sentences = p.split(/(?<=[.!?;:])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length > MAX && cur) {
      out.push(cur.trim());
      cur = s;
    } else cur = (cur + " " + s).trim();
  }
  if (cur) out.push(cur.trim());
  return out.flatMap((x) => (x.length > MAX ? x.match(new RegExp(`.{1,${MAX}}`, "gs")) ?? [x] : [x]));
}

export function chunkPages(pages: PageText[]): Chunk[] {
  const units: { text: string; page: number }[] = [];
  for (const pg of pages) {
    const paras = normalize(pg.text).split(/\n\s*\n/).map((p) => p.replace(/\n/g, " ").trim()).filter((p) => p.length > 0);
    for (const p of paras) for (const piece of splitLong(p)) units.push({ text: piece, page: pg.page });
  }

  const chunks: Chunk[] = [];
  let buf: { text: string; page: number }[] = [];
  let bufLen = 0;
  let section: string | null = null;

  const flush = () => {
    if (!buf.length) return;
    const content = buf.map((u) => u.text).join("\n\n");
    chunks.push({
      idx: chunks.length,
      content,
      pageStart: buf[0].page || null,
      pageEnd: buf[buf.length - 1].page || null,
      section,
    });
    // örtüşme: son parçanın kuyruğunu taşı
    const tail = buf[buf.length - 1];
    const tailText = tail.text.length > OVERLAP ? tail.text.slice(-OVERLAP).replace(/^\S*\s/, "") : tail.text;
    buf = tailText ? [{ text: tailText, page: tail.page }] : [];
    bufLen = tailText.length;
  };

  for (const u of units) {
    // Başlık sezgisi: kısa, nokta ile bitmeyen, büyük harf ağırlıklı satır
    if (u.text.length < 90 && !/[.!?]$/.test(u.text) && /^[A-ZÇĞİÖŞÜ0-9]/.test(u.text)) section = u.text.slice(0, 120);
    if (bufLen + u.text.length > TARGET && bufLen > 0) flush();
    buf.push(u);
    bufLen += u.text.length;
  }
  if (buf.length && (chunks.length === 0 || buf.map((b) => b.text).join("").length > OVERLAP + 40)) flush();
  // İlk dolaştırmada ortaya çıkabilecek yinelenen kuyruk-only parçayı ele
  return chunks.filter((c, i) => i === 0 || c.content.length > OVERLAP);
}

export function chunkText(text: string): Chunk[] {
  return chunkPages([{ page: 0, text }]).map((c) => ({ ...c, pageStart: null, pageEnd: null }));
}

/** Kaba token tahmini (Türkçe için ~3.5 karakter/token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
