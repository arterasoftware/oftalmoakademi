/**
 * PubMed taraması için saf yardımcılar (ağ yok, test edilebilir):
 * arama terimi kurma, efetch XML ayrıştırma ve yapay zekâsız önem puanı.
 */
import type { Subspecialty } from "@/db/schema";

/* -------------------------------------------------------------------------- */
/*  Ayarlar                                                                    */
/* -------------------------------------------------------------------------- */

export type ArticleScanSettings = {
  /** Zamanlanmış tarama açık mı? (elle "Şimdi tara" her zaman çalışır) */
  enabled: boolean;
  /** Kaç günde bir otomatik tarama */
  intervalDays: number;
  /** PubMed'e son kaç günde eklenen yayınlar */
  lookbackDays: number;
  /** Her alt dal için kuyrukta bekleyebilecek en fazla tarama adayı (seçilen/reddedilen yer açar) */
  perQuery: number;
  /** Yalnızca yüksek kanıt düzeyi (RKÇ, meta-analiz, sistematik derleme, kılavuz) */
  highEvidenceOnly: boolean;
  /** Alt dal → PubMed sorgusu (boş bırakılan alt dal taranmaz) */
  queries: Partial<Record<Subspecialty, string>>;
  lastRunAt?: string | null;
  lastResult?: ScanSummary | null;
};

export type ScanSummary = {
  at: string;
  trigger: "manual" | "schedule";
  added: number;
  skippedExisting: number;
  failedQueries: string[];
  perSubspecialty: Partial<Record<Subspecialty, number>>;
  /** Bekleyen tarama adayı sınırı dolu olduğu için atlanan alt dallar */
  queueFull?: string[];
};

export const DEFAULT_SCAN_QUERIES: Partial<Record<Subspecialty, string>> = {
  RETINA: '(retina[tiab] OR macular[tiab] OR "diabetic retinopathy"[tiab] OR "retinal vein occlusion"[tiab] OR "retinal detachment"[tiab])',
  KORNEA: '(cornea*[tiab] OR keratoconus[tiab] OR keratitis[tiab] OR "dry eye"[tiab])',
  GLOKOM: "(glaucoma[tiab] OR \"intraocular pressure\"[tiab])",
  NOROOFTALMOLOJI: '("optic neuritis"[tiab] OR "optic neuropathy"[tiab] OR papilledema[tiab] OR "idiopathic intracranial hypertension"[tiab])',
  PEDIATRIK: '(amblyopia[tiab] OR strabismus[tiab] OR "retinopathy of prematurity"[tiab] OR (myopia[tiab] AND child*[tiab]))',
  UVEIT: "(uveitis[tiab] OR scleritis[tiab])",
  OKULOPLASTIK: '(eyelid[tiab] OR "thyroid eye disease"[tiab] OR blepharoptosis[tiab] OR orbital[tiab] OR "lacrimal"[tiab])',
  KATARAKT: '(cataract[tiab] OR "intraocular lens"[tiab])',
  REFRAKSIYON: '("refractive surgery"[tiab] OR "laser in situ keratomileusis"[tiab] OR "small incision lenticule extraction"[tiab] OR "phakic intraocular lens"[tiab])',
};

export const DEFAULT_SCAN_SETTINGS: ArticleScanSettings = {
  enabled: true,
  intervalDays: 7,
  lookbackDays: 30,
  perQuery: 3,
  highEvidenceOnly: true,
  queries: DEFAULT_SCAN_QUERIES,
  lastRunAt: null,
  lastResult: null,
};

const HIGH_EVIDENCE_FILTER =
  '(randomized controlled trial[pt] OR meta-analysis[pt] OR systematic review[pt] OR practice guideline[pt] OR guideline[pt])';

/** Alt dal sorgusuna dil/özet/kanıt düzeyi filtrelerini ekler. */
export function buildSearchTerm(query: string, opts: { highEvidenceOnly: boolean }): string {
  const parts = [`(${query.trim()})`, "english[la]", "hasabstract"];
  if (opts.highEvidenceOnly) parts.push(HIGH_EVIDENCE_FILTER);
  else parts.push("(clinical trial[pt] OR comparative study[pt] OR multicenter study[pt] OR " + HIGH_EVIDENCE_FILTER.slice(1));
  return parts.join(" AND ");
}

/* -------------------------------------------------------------------------- */
/*  efetch XML ayrıştırma                                                      */
/* -------------------------------------------------------------------------- */

export type PubmedRecord = {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  journalAbbrev: string;
  publishedOn: string;
  abstract: string;
  doi: string | null;
  pubTypes: string[];
};

export function stripXml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m ? stripXml(m[1]) : undefined;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function formatPubDate(block: string): string {
  const y = tag(block, "Year");
  const mRaw = tag(block, "Month");
  if (y) {
    const m = mRaw ? (/^\d+$/.test(mRaw) ? Number(mRaw) : MONTHS[mRaw.slice(0, 3).toLowerCase()]) : undefined;
    return m && m >= 1 && m <= 12 ? `${y} ${MONTHS_TR[m - 1]}` : y;
  }
  return tag(block, "MedlineDate") ?? "";
}

/** efetch (db=pubmed, retmode=xml) çıktısındaki her PubmedArticle için künye çıkarır. */
export function parsePubmedXml(xml: string): PubmedRecord[] {
  const out: PubmedRecord[] = [];
  for (const m of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)) {
    // Kaynakça (ReferenceList) başka makalelerin DOI'lerini içerir; ayrıştırmadan önce atılır.
    const block = m[1].replace(/<ReferenceList>[\s\S]*?<\/ReferenceList>/g, "");
    const pmid = /<PMID[^>]*>(\d+)<\/PMID>/.exec(block)?.[1];
    const title = tag(block, "ArticleTitle");
    if (!pmid || !title) continue;
    const abstract = [...block.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)]
      .map((a) => {
        const label = /Label="([^"]+)"/.exec(a[1])?.[1];
        const text = stripXml(a[2]);
        return label ? `${label.charAt(0)}${label.slice(1).toLowerCase()}: ${text}` : text;
      })
      .filter(Boolean)
      .join("\n");
    const authorsList = [...block.matchAll(/<Author\b[^>]*>([\s\S]*?)<\/Author>/g)].map((a) => {
      const last = tag(a[1], "LastName");
      const ini = tag(a[1], "Initials");
      return last ? `${last}${ini ? ` ${ini}` : ""}` : (tag(a[1], "CollectiveName") ?? "");
    });
    const authors = authorsList.filter(Boolean);
    const journalBlock = /<Journal>([\s\S]*?)<\/Journal>/.exec(block)?.[1] ?? "";
    const pubDateBlock = /<PubDate>([\s\S]*?)<\/PubDate>/.exec(journalBlock)?.[1] ?? "";
    const doi =
      /<ELocationID[^>]*EIdType="doi"[^>]*>([^<]+)<\/ELocationID>/.exec(block)?.[1] ?? /<ArticleId IdType="doi">([^<]+)<\/ArticleId>/.exec(block)?.[1] ?? null;
    const pubTypes = [...block.matchAll(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/g)].map((p) => stripXml(p[1]));
    out.push({
      pmid,
      title: title.replace(/\.$/, ""),
      authors: authors.length > 6 ? `${authors.slice(0, 6).join(", ")} ve ark.` : authors.join(", "),
      journal: tag(journalBlock, "Title") ?? "",
      journalAbbrev: tag(journalBlock, "ISOAbbreviation") ?? "",
      publishedOn: formatPubDate(pubDateBlock),
      abstract,
      doi: doi ? doi.trim() : null,
      pubTypes: Array.from(new Set(pubTypes)),
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Yapay zekâsız önem puanı                                                   */
/* -------------------------------------------------------------------------- */

const PUB_TYPE_WEIGHT: [RegExp, number][] = [
  [/^meta-analysis$/i, 40],
  [/^systematic review$/i, 38],
  [/^(practice )?guideline$/i, 36],
  [/^randomized controlled trial$/i, 35],
  [/^clinical trial, phase iii$/i, 30],
  [/^(clinical trial|controlled clinical trial|clinical trial, phase ii)$/i, 25],
  [/^(multicenter study|comparative study|observational study)$/i, 15],
  [/^review$/i, 10],
];

/** Dergi kısaltması (ISO) → katman puanı. Küçük harfle karşılaştırılır. */
const JOURNAL_TIERS: [number, string[]][] = [
  [35, ["n engl j med", "lancet", "jama", "bmj", "nat med"]],
  [30, ["ophthalmology", "jama ophthalmol", "prog retin eye res", "cochrane database syst rev"]],
  [22, ["am j ophthalmol", "br j ophthalmol", "ophthalmol retina", "ophthalmol glaucoma", "retina", "invest ophthalmol vis sci", "surv ophthalmol", "j cataract refract surg", "ocul surf", "eclinicalmedicine", "lancet digit health"]],
  [14, ["eye (lond)", "acta ophthalmol", "graefes arch clin exp ophthalmol", "cornea", "j glaucoma", "j refract surg", "transl vis sci technol", "asia pac j ophthalmol (phila)", "ocul immunol inflamm", "j aapos", "ophthalmic plast reconstr surg", "j neuroophthalmol"]],
];

export const PUB_TYPE_LABELS: Record<string, string> = {
  "Meta-Analysis": "Meta-analiz",
  "Systematic Review": "Sistematik derleme",
  "Randomized Controlled Trial": "Randomize kontrollü çalışma",
  "Practice Guideline": "Klinik kılavuz",
  Guideline: "Kılavuz",
  "Clinical Trial": "Klinik çalışma",
  "Clinical Trial, Phase III": "Faz III çalışma",
  "Clinical Trial, Phase II": "Faz II çalışma",
  "Multicenter Study": "Çok merkezli",
  "Comparative Study": "Karşılaştırmalı çalışma",
  "Observational Study": "Gözlemsel çalışma",
  Review: "Derleme",
};

/** Etiketlenecek (gösterilecek) yayın türleri, önem sırasıyla. */
export function notablePubTypes(types: string[] | null | undefined): string[] {
  const order = Object.keys(PUB_TYPE_LABELS);
  return (types ?? []).filter((t) => t in PUB_TYPE_LABELS).sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function journalTier(abbrev: string): number {
  const j = abbrev.trim().toLowerCase();
  for (const [pts, names] of JOURNAL_TIERS) if (names.includes(j)) return pts;
  return /ophthalmol|retina|cornea|glaucoma|eye|vis(ion)? /i.test(abbrev) ? 8 : 4;
}

/** 0-100 arası puan: yayın türü (≤40) + dergi (≤35) + özet (10) + çok merkezli (5) + kılavuz/RKÇ birlikteliği. */
export function scoreRecord(r: Pick<PubmedRecord, "pubTypes" | "journalAbbrev" | "abstract">): number {
  let typeScore = 5;
  for (const t of r.pubTypes) for (const [re, w] of PUB_TYPE_WEIGHT) if (re.test(t)) typeScore = Math.max(typeScore, w);
  let score = typeScore + journalTier(r.journalAbbrev);
  if (r.abstract.length > 400) score += 10;
  else if (r.abstract.length > 0) score += 5;
  if (r.pubTypes.some((t) => /^multicenter study$/i.test(t))) score += 5;
  return Math.max(0, Math.min(100, score));
}

/** Öneri gerekçesi (insan okunur, yapay zekâsız). */
export function scanReason(a: { pubTypes?: string[] | null; journal?: string | null; scanQuery?: string | null }, subLabel?: string): string {
  const types = notablePubTypes(a.pubTypes).slice(0, 2).map((t) => PUB_TYPE_LABELS[t]);
  return [types.join(", ") || null, a.journal || null, subLabel ? `${subLabel} taraması` : null].filter(Boolean).join(" · ");
}
