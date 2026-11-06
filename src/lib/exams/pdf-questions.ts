/**
 * Sınav sorusu PDF'inden (metin) çoktan seçmeli soruları ayrıştırır — yapay zekâ kullanılmaz.
 *
 * Tanınan biçimler:
 *  - Soru kökü: satır başında "1.", "1)", "1-" (numaralar ardışık olmalı; ilk numara serbest)
 *  - Şıklar: satır başında "A)", "A.", "a)"; bir satırda birden çok şık ("A) … B) … C) …") da bölünür
 *  - Doğru yanıt: soru içinde "Cevap: C" / "Yanıt: C" satırı, ya da belge sonunda "Cevap Anahtarı" bölümü ("1-C", "1. C", "1) C")
 *  - Şıkkın yanındaki yıldız ("*C) …") doğru yanıt sayılır
 * Çok satırlı kök ve şık metinleri birleştirilir; satır sonu tireleri kaldırılır.
 */

export type ParsedOption = { key: string; text: string };
export type ParsedQuestion = {
  number: number;
  stem: string;
  options: ParsedOption[];
  correctKey: string | null;
  /** Bu soruya özgü uyarılar (şık azlığı, yanıt eksik vb.) */
  warnings: string[];
};
export type ParseResult = {
  questions: ParsedQuestion[];
  warnings: string[];
  keyFound: boolean;
};

const Q_START = /^\s*(\d{1,3})\s*[.)\-–]\s+(.*\S)?\s*$/u;
const OPT_START = /^\s*(\*?)\s*([A-Ea-e])\s*[.)]\s+(.*\S)?\s*$/u;
const INLINE_OPT = /(?:^|\s)(\*?)([A-E])\s*[.)]\s+/g;
const ANSWER_LINE = /^\s*(?:cevap|yan[ıi]t|do[ğg]ru\s*(?:cevap|yan[ıi]t)|answer)\s*[:：\-]\s*\(?([A-Ea-e])\)?\s*$/iu;
const KEY_HEADER = /^\s*(?:cevap|yan[ıi]t)\s*anahtar[ıi]|^\s*cevaplar\s*:?\s*$|^\s*answer\s*key/iu;
const KEY_PAIR = /(\d{1,3})\s*[-–.):]\s*\(?([A-Ea-e])\)?(?![\p{L}])/gu;

function cleanLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim());
}

/** Satır sonu tiresiyle bölünmüş sözcükleri birleştirerek parçaları ekler. */
function append(base: string, add: string): string {
  if (!base) return add;
  if (/[\p{L}]-$/u.test(base)) return base.slice(0, -1) + add;
  return `${base} ${add}`;
}

/** Bir satırda birden fazla şık varsa ayırır; yoksa null. */
function splitInlineOptions(line: string): { stemPart: string; opts: { star: boolean; key: string; text: string }[] } | null {
  const matches = [...line.matchAll(INLINE_OPT)];
  if (matches.length < 2) return null;
  const opts: { star: boolean; key: string; text: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : line.length;
    opts.push({ star: m[1] === "*", key: m[2].toUpperCase(), text: line.slice(start, end).trim() });
  }
  // Ardışık harf denetimi (A, B, C…): değilse sahte eşleşme sayılır
  for (let i = 0; i < opts.length; i++) if (opts[i].key !== String.fromCharCode(65 + i)) return null;
  return { stemPart: line.slice(0, matches[0].index!).trim(), opts };
}

export function parseAnswerKey(lines: string[]): { key: Map<number, string>; startIndex: number } {
  const startIndex = lines.findIndex((l) => KEY_HEADER.test(l));
  const key = new Map<number, string>();
  if (startIndex < 0) return { key, startIndex };
  const tail = lines.slice(startIndex + 1).join(" ");
  for (const m of tail.matchAll(KEY_PAIR)) {
    const n = Number(m[1]);
    if (!key.has(n)) key.set(n, m[2].toUpperCase());
  }
  return { key, startIndex };
}

export function parseQuestionsFromText(text: string): ParseResult {
  const allLines = cleanLines(text);
  const { key: answerKey, startIndex } = parseAnswerKey(allLines);
  const lines = startIndex >= 0 ? allLines.slice(0, startIndex) : allLines;

  const questions: ParsedQuestion[] = [];
  let cur: ParsedQuestion | null = null;
  let lastOpt: ParsedOption | null = null;

  const finish = () => {
    if (!cur) return;
    cur.stem = cur.stem.trim();
    if (cur.stem.length >= 5 && cur.options.length >= 2) questions.push(cur);
    cur = null;
    lastOpt = null;
  };

  for (const line of lines) {
    if (!line) continue;
    const q = Q_START.exec(line);
    if (q) {
      const n = Number(q[1]);
      const curQ = cur as ParsedQuestion | null; // kapanış içinde atandığı için TS daraltmasını aş
      const expected: number | null = curQ ? curQ.number + 1 : questions.length ? questions[questions.length - 1].number + 1 : null;
      if (expected === null || n === expected) {
        finish();
        cur = { number: n, stem: q[2] ?? "", options: [], correctKey: null, warnings: [] };
        const inline = q[2] ? splitInlineOptions(q[2]) : null;
        if (inline) {
          cur.stem = inline.stemPart;
          for (const o of inline.opts) {
            cur.options.push({ key: o.key, text: o.text });
            if (o.star) cur.correctKey = o.key;
          }
          lastOpt = cur.options[cur.options.length - 1] ?? null;
        }
        continue;
      }
    }
    if (!cur) continue;

    const ans = ANSWER_LINE.exec(line);
    if (ans) {
      cur.correctKey = ans[1].toUpperCase();
      lastOpt = null;
      continue;
    }
    const inline = splitInlineOptions(line);
    if (inline && cur.options.length === 0) {
      if (inline.stemPart) cur.stem = append(cur.stem, inline.stemPart);
      for (const o of inline.opts) {
        cur.options.push({ key: o.key, text: o.text });
        if (o.star) cur.correctKey = o.key;
      }
      lastOpt = cur.options[cur.options.length - 1] ?? null;
      continue;
    }
    const o = OPT_START.exec(line);
    if (o) {
      const k = o[2].toUpperCase();
      const expectedKey = String.fromCharCode(65 + cur.options.length);
      if (k === expectedKey) {
        lastOpt = { key: k, text: o[3] ?? "" };
        cur.options.push(lastOpt);
        if (o[1] === "*") cur.correctKey = k;
        continue;
      }
    }
    // devam satırı
    if (lastOpt) lastOpt.text = append(lastOpt.text, line);
    else cur.stem = append(cur.stem, line);
  }
  finish();

  const warnings: string[] = [];
  for (const q of questions) {
    if (q.correctKey === null && answerKey.has(q.number)) q.correctKey = answerKey.get(q.number)!;
    if (q.correctKey && !q.options.some((o) => o.key === q.correctKey)) {
      q.warnings.push(`Doğru yanıt ${q.correctKey} şıklar arasında yok.`);
      q.correctKey = null;
    }
    if (q.options.length < 4) q.warnings.push(`Yalnızca ${q.options.length} şık bulundu.`);
    if (q.options.some((o) => !o.text.trim())) q.warnings.push("Boş şık metni var.");
    if (q.correctKey === null) q.warnings.push("Doğru yanıt belirlenemedi; işaretleyin.");
  }
  if (questions.length === 0) warnings.push("Belgede numaralı soru ve A-E şıkları tanınamadı. Taranmış (görüntü) PDF olabilir ya da biçim farklı olabilir.");
  const missing = questions.filter((q) => q.correctKey === null).length;
  if (missing) warnings.push(`${missing} sorunun doğru yanıtı belirlenemedi; önizlemede işaretleyin.`);
  if (answerKey.size > 0 && questions.some((q) => !answerKey.has(q.number))) warnings.push("Cevap anahtarında bazı soru numaraları eksik.");
  return { questions, warnings, keyFound: answerKey.size > 0 };
}
