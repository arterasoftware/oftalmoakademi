import "server-only";
import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { SUBSPECIALTY_LABELS, type Subspecialty } from "@/db/schema";
import { env } from "@/lib/env";
import { notifyRoles } from "@/lib/notifications";
import { audit } from "@/lib/audit";
import { buildSearchTerm, DEFAULT_SCAN_SETTINGS, parsePubmedXml, scoreRecord, type ArticleScanSettings, type PubmedRecord, type ScanSummary } from "./pubmed";

const SETTINGS_KEY = "article_scan";
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const UA = "OftalmoAkademi/1.0 (egitim platformu; makale taramasi)";

export async function getScanSettings(): Promise<ArticleScanSettings> {
  try {
    const db = await getDb();
    const rows = await db.select().from(schema.settings).where(sql`${schema.settings.key} = ${SETTINGS_KEY}`);
    const v = (rows[0]?.value ?? {}) as Partial<ArticleScanSettings>;
    return { ...DEFAULT_SCAN_SETTINGS, ...v, queries: { ...DEFAULT_SCAN_SETTINGS.queries, ...(v.queries ?? {}) } };
  } catch {
    return DEFAULT_SCAN_SETTINGS;
  }
}

export async function saveScanSettings(next: ArticleScanSettings, updatedBy: string | null) {
  const db = await getDb();
  await db
    .insert(schema.settings)
    .values({ key: SETTINGS_KEY, value: next, updatedBy })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: next, updatedBy, updatedAt: new Date() } });
}

/** Bir sonraki planlı tarama zamanı (kapalıysa null). */
export function nextRunAt(s: ArticleScanSettings): Date | null {
  if (!s.enabled) return null;
  if (!s.lastRunAt) return new Date();
  return new Date(new Date(s.lastRunAt).getTime() + s.intervalDays * 24 * 60 * 60 * 1000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function eutilsParams(): string {
  const e = env();
  const p = new URLSearchParams({ tool: "OftalmoAkademi" });
  if (e.NCBI_EMAIL) p.set("email", e.NCBI_EMAIL);
  if (e.NCBI_API_KEY) p.set("api_key", e.NCBI_API_KEY);
  return p.toString();
}

async function fetchWithRetry(url: string, as: "json" | "text"): Promise<unknown> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = as === "json" ? await res.json() : await res.text();
      // PubMed arama arka ucu geçici hatada 200 + ERROR alanı döndürebilir
      if (as === "json" && (body as { esearchresult?: { ERROR?: string } })?.esearchresult?.ERROR) throw new Error((body as { esearchresult: { ERROR: string } }).esearchresult.ERROR);
      return body;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("PubMed isteği başarısız");
}

async function esearch(term: string, lookbackDays: number, retmax: number): Promise<string[]> {
  const url = `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&datetype=edat&reldate=${lookbackDays}&retmax=${retmax}&term=${encodeURIComponent(term)}&${eutilsParams()}`;
  const j = (await fetchWithRetry(url, "json")) as { esearchresult?: { idlist?: string[] } };
  return (j.esearchresult?.idlist ?? []).filter((id) => /^\d{1,9}$/.test(id));
}

async function efetch(ids: string[]): Promise<PubmedRecord[]> {
  if (!ids.length) return [];
  const out: PubmedRecord[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const url = `${EUTILS}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.slice(i, i + 100).join(",")}&${eutilsParams()}`;
    out.push(...parsePubmedXml((await fetchWithRetry(url, "text")) as string));
    await sleep(env().NCBI_API_KEY ? 120 : 400);
  }
  return out;
}

// Zamanlayıcı (instrumentation) ve sunucu eylemleri farklı modül kopyalarından çalışabilir; kilit süreç genelinde tutulur.
type G = typeof globalThis & { __oaArticleScanRunning?: Promise<ScanSummary> | null };
const g = globalThis as G;

/**
 * PubMed'i alt dal sorgularıyla tarar, kuyrukta olmayan yeni yayınları SUGGESTED aday olarak ekler,
 * öğretim üyelerine bildirim gönderir. Aynı anda tek tarama çalışır; ağ hataları sorgu bazında raporlanır.
 */
export async function runArticleScan(opts: { trigger: "manual" | "schedule"; userId: string | null }): Promise<ScanSummary> {
  if (g.__oaArticleScanRunning) return g.__oaArticleScanRunning;
  g.__oaArticleScanRunning = (async () => {
    const s = await getScanSettings();
    const delay = env().NCBI_API_KEY ? 120 : 400;
    const failedQueries: string[] = [];
    const found = new Map<string, Subspecialty>(); // pmid → ilk bulunan alt dal
    const entries = (Object.entries(s.queries) as [Subspecialty, string | undefined][]).filter(([, q]) => q && q.trim());

    for (const [sub, q] of entries) {
      try {
        const ids = await esearch(buildSearchTerm(q!, { highEvidenceOnly: s.highEvidenceOnly }), s.lookbackDays, Math.max(5, s.perQuery * 4));
        for (const id of ids) if (!found.has(id)) found.set(id, sub);
      } catch (e) {
        failedQueries.push(SUBSPECIALTY_LABELS[sub]);
        console.error("[makale-tarama] esearch", sub, e instanceof Error ? e.message : e);
      }
      await sleep(delay);
    }

    const db = await getDb();
    // Zaten kayıtlı (her durumda: aday, seçili, yayımlı, reddedilmiş) PMID/DOI'leri atla
    const allIds = [...found.keys()];
    const existingPmids = new Set<string>();
    if (allIds.length) {
      const rows = await db.select({ pmid: schema.articles.pmid }).from(schema.articles).where(inArray(schema.articles.pmid, allIds));
      rows.forEach((r) => r.pmid && existingPmids.add(r.pmid));
    }
    const fresh = allIds.filter((id) => !existingPmids.has(id));
    let records: PubmedRecord[] = [];
    try {
      records = await efetch(fresh);
    } catch (e) {
      failedQueries.push("künye getirme (efetch)");
      console.error("[makale-tarama] efetch", e instanceof Error ? e.message : e);
    }
    const dois = records.map((r) => r.doi?.toLowerCase()).filter((d): d is string => Boolean(d));
    const existingDois = new Set<string>();
    if (dois.length) {
      const rows = await db.select({ doi: schema.articles.doi }).from(schema.articles).where(or(...dois.map((d) => sql`lower(${schema.articles.doi}) = ${d}`)));
      rows.forEach((r) => r.doi && existingDois.add(r.doi.toLowerCase()));
    }

    // Kuyruk sınırı: alt dal başına bekleyen (SUGGESTED) tarama adayı en fazla `perQuery`.
    // Öğretim üyesi seçtikçe/reddettikçe yer açılır; böylece tekrar taramalar kuyruğu şişirmez.
    const pendingRows = await db
      .select({ sub: schema.articles.subspecialty, c: count() })
      .from(schema.articles)
      .where(and(eq(schema.articles.origin, "pubmed_scan"), eq(schema.articles.status, "SUGGESTED")))
      .groupBy(schema.articles.subspecialty);
    const pending = new Map(pendingRows.map((r) => [r.sub, Number(r.c)]));
    const queueFull: string[] = [];

    // Alt dal başına en yüksek puanlı yeni kayıtlar (boş yer kadar)
    const bySub = new Map<Subspecialty, (PubmedRecord & { score: number })[]>();
    for (const r of records) {
      if (r.doi && existingDois.has(r.doi.toLowerCase())) continue;
      const sub = found.get(r.pmid)!;
      const list = bySub.get(sub) ?? [];
      list.push({ ...r, score: scoreRecord(r) });
      bySub.set(sub, list);
    }
    const perSubspecialty: Partial<Record<Subspecialty, number>> = {};
    const toInsert: (typeof schema.articles.$inferInsert)[] = [];
    for (const [sub, list] of bySub) {
      const room = Math.max(0, s.perQuery - (pending.get(sub) ?? 0));
      if (room === 0) {
        queueFull.push(SUBSPECIALTY_LABELS[sub]);
        continue;
      }
      const top = list.sort((a, b) => b.score - a.score).slice(0, room);
      perSubspecialty[sub] = top.length;
      for (const r of top) {
        toInsert.push({
          title: r.title.slice(0, 400),
          authors: r.authors || null,
          journal: r.journalAbbrev || r.journal || null,
          publishedOn: r.publishedOn || null,
          doi: r.doi,
          pmid: r.pmid,
          url: `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`,
          abstract: r.abstract.slice(0, 10000) || null,
          subspecialty: sub,
          status: "SUGGESTED",
          suggestedBy: null,
          origin: "pubmed_scan",
          pubTypes: r.pubTypes,
          scanScore: r.score,
          scanQuery: sub,
        });
      }
    }
    // Ekleme öncesi son denetim: arada başka bir yoldan eklenmiş PMID'leri çıkar
    if (toInsert.length) {
      const again = await db.select({ pmid: schema.articles.pmid }).from(schema.articles).where(inArray(schema.articles.pmid, toInsert.map((t) => t.pmid!)));
      const taken = new Set(again.map((r) => r.pmid));
      for (let i = toInsert.length - 1; i >= 0; i--) if (taken.has(toInsert[i].pmid!)) toInsert.splice(i, 1);
    }
    if (toInsert.length) await db.insert(schema.articles).values(toInsert);

    const summary: ScanSummary = {
      at: new Date().toISOString(),
      trigger: opts.trigger,
      added: toInsert.length,
      skippedExisting: existingPmids.size + existingDois.size,
      failedQueries,
      perSubspecialty,
      queueFull,
    };
    await saveScanSettings({ ...s, lastRunAt: summary.at, lastResult: summary }, opts.userId);
    await audit(opts.userId, "article.scan", undefined, { ...summary });

    if (toInsert.length) {
      const best = [...toInsert].sort((a, b) => (b.scanScore ?? 0) - (a.scanScore ?? 0)).slice(0, 3);
      await notifyRoles(["FACULTY", "ADMIN"], {
        type: "SYSTEM",
        title: `Makale taraması: ${toInsert.length} yeni çalışma önerisi`,
        body: best.map((b) => `${SUBSPECIALTY_LABELS[b.subspecialty as Subspecialty]}: ${b.title}`).join(" • ").slice(0, 480),
        link: "/makaleler/oneriler?kaynak=tarama",
      });
    }
    return summary;
  })();
  try {
    return await g.__oaArticleScanRunning;
  } finally {
    g.__oaArticleScanRunning = null;
  }
}

/** Planlı tarama zamanı geldiyse çalıştırır (zamanlayıcıdan çağrılır). */
export async function runScanIfDue(): Promise<ScanSummary | null> {
  const s = await getScanSettings();
  const due = nextRunAt(s);
  if (!due || due.getTime() > Date.now()) return null;
  return runArticleScan({ trigger: "schedule", userId: null });
}
