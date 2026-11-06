import "server-only";

/**
 * DOI'den makale künyesi: Crossref (birincil, anahtarsız) + PubMed E-utilities (PMID ve özet).
 * Her iki servis de ücretsizdir; hata/zaman aşımı sessizce atlanır, bulunan alanlar döner.
 */
export type ArticleMeta = {
  doi: string;
  title?: string;
  authors?: string;
  journal?: string;
  publishedOn?: string;
  abstract?: string;
  pmid?: string;
  url?: string;
  /** Hangi servislerden veri geldi */
  sources: ("crossref" | "pubmed")[];
};

const UA = "OftalmoAkademi/1.0 (egitim platformu; kaynak kunyesi sorgusu)";
const TIMEOUT_MS = 10_000;
const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

/** "https://doi.org/10.x/y", "doi:10.x/y", "DOI 10.x/y" → "10.x/y" */
export function normalizeDoi(input: string): string | null {
  const s = input.trim().replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").trim();
  const m = /^(10\.\d{4,9}\/\S+)$/i.exec(s);
  if (!m) return null;
  return m[1].replace(/[.,;:)\]]+$/, "");
}

/** Metin içinden ilk DOI'yi çıkarır (PDF ilk sayfaları için). */
export function extractDoiFromText(text: string): string | null {
  const m = /\b(10\.\d{4,9}\/[^\s"'<>()[\]{}]+)/i.exec(text);
  if (!m) return null;
  return m[1].replace(/[.,;:]+$/, "");
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** JATS/HTML etiketlerini ve temel varlıkları temizler. */
function stripTags(s: string): string {
  return s
    .replace(/<\/?jats:[^>]+>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDateParts(parts: unknown): string | undefined {
  if (!Array.isArray(parts) || !Array.isArray(parts[0])) return undefined;
  const [y, m] = parts[0] as unknown[];
  if (typeof y !== "number") return undefined;
  return typeof m === "number" && m >= 1 && m <= 12 ? `${y} ${MONTHS_TR[m - 1]}` : String(y);
}

type CrossrefWork = {
  title?: string[];
  author?: { family?: string; given?: string; name?: string }[];
  "container-title"?: string[];
  "short-container-title"?: string[];
  issued?: { "date-parts"?: unknown };
  "published-print"?: { "date-parts"?: unknown };
  "published-online"?: { "date-parts"?: unknown };
  abstract?: string;
  URL?: string;
};

function initials(given: string): string {
  return given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

async function fromCrossref(doi: string): Promise<Partial<ArticleMeta> | null> {
  const json = (await fetchJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`)) as { message?: CrossrefWork } | null;
  const w = json?.message;
  if (!w) return null;
  const authors = (w.author ?? [])
    .map((a) => (a.family ? `${a.family}${a.given ? " " + initials(a.given) : ""}` : a.name ?? ""))
    .filter(Boolean)
    .join(", ");
  const out: Partial<ArticleMeta> = {
    title: w.title?.[0] ? stripTags(w.title[0]) : undefined,
    authors: authors || undefined,
    journal: w["container-title"]?.[0] ?? w["short-container-title"]?.[0],
    publishedOn: formatDateParts(w["published-print"]?.["date-parts"] ?? w.issued?.["date-parts"] ?? w["published-online"]?.["date-parts"]),
    abstract: w.abstract ? stripTags(w.abstract) : undefined,
    url: w.URL,
  };
  return out;
}

async function pubmedId(doi: string): Promise<string | null> {
  const json = (await fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(doi)}[doi]`)) as {
    esearchresult?: { idlist?: string[] };
  } | null;
  const id = json?.esearchresult?.idlist?.[0];
  return id && /^\d{1,9}$/.test(id) ? id : null;
}

function xmlTag(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return m ? stripTags(m[1]) : undefined;
}

async function fromPubmed(pmid: string): Promise<Partial<ArticleMeta>> {
  const xml = await fetchText(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=${pmid}`);
  if (!xml) return {};
  const abstractParts = [...xml.matchAll(/<AbstractText(?:\s[^>]*Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/gi)].map(
    (m) => `${m[1] ? m[1] + ": " : ""}${stripTags(m[2])}`,
  );
  const authors = [...xml.matchAll(/<Author\b[^>]*>([\s\S]*?)<\/Author>/gi)]
    .map((m) => {
      const last = xmlTag(m[1], "LastName");
      const ini = xmlTag(m[1], "Initials");
      return last ? `${last}${ini ? " " + ini : ""}` : (xmlTag(m[1], "CollectiveName") ?? "");
    })
    .filter(Boolean)
    .join(", ");
  const pubDate = /<PubDate>([\s\S]*?)<\/PubDate>/i.exec(xml)?.[1] ?? "";
  const year = xmlTag(pubDate, "Year");
  const month = xmlTag(pubDate, "Month");
  return {
    title: xmlTag(xml, "ArticleTitle"),
    journal: xmlTag(xml, "Title"),
    authors: authors || undefined,
    publishedOn: year ? `${year}${month ? " " + month : ""}` : undefined,
    abstract: abstractParts.length ? abstractParts.join("\n") : undefined,
  };
}

/** DOI ile künye getirir. Hiçbir servis yanıt vermezse null döner. */
export async function lookupDoi(rawDoi: string): Promise<ArticleMeta | null> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) return null;
  const [cr, pmid] = await Promise.all([fromCrossref(doi), pubmedId(doi)]);
  const pm = pmid ? await fromPubmed(pmid) : null;
  if (!cr && !pm) return null;
  const sources: ArticleMeta["sources"] = [];
  if (cr) sources.push("crossref");
  if (pm) sources.push("pubmed");
  const pick = (k: keyof Partial<ArticleMeta>) => (cr?.[k] as string | undefined) || (pm?.[k] as string | undefined) || undefined;
  return {
    doi,
    title: pick("title"),
    authors: pick("authors"),
    journal: pick("journal"),
    publishedOn: pick("publishedOn"),
    // Özet için PubMed daha güvenilir (Crossref çoğu dergide özet vermez)
    abstract: pm?.abstract || cr?.abstract || undefined,
    pmid: pmid ?? undefined,
    url: cr?.url ?? `https://doi.org/${doi}`,
    sources,
  };
}

/** PDF'in ilk sayfalarının metnini döndürür (DOI/başlık tespiti için). Ayrıştırılamazsa boş dize. */
export async function extractPdfText(data: Uint8Array, maxPages = 3): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(data);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [String(text)];
    return pages.slice(0, maxPages).join("\n");
  } catch {
    return "";
  }
}
