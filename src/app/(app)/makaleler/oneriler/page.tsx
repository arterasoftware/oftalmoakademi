import Link from "next/link";
import { requireStaff } from "@/lib/auth/dal";
import { Radar } from "lucide-react";
import { listArticleCandidates, countCandidatesByOrigin } from "@/lib/queries/articles";
import { getScanSettings, nextRunAt } from "@/lib/articles/scan";
import { notablePubTypes, PUB_TYPE_LABELS } from "@/lib/articles/pubmed";
import { ScanPanel } from "./scan-panel";
import { aiAvailable } from "@/lib/ai/client";
import { PageHeader, Alert, Badge, AiBadge, Card, CardContent, CardHeader, CardTitle, CardDescription, EmptyState } from "@/components/ui";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { ARTICLE_STATUS } from "@/lib/status-labels";
import { CandidateForm } from "./candidate-form";
import { EvaluateButton } from "./evaluate-button";
import { ArticleWorkflow } from "../article-workflow";

export const metadata = { title: "Makale önerileri" };

type SP = Record<string, string | string[] | undefined>;

export default async function OnerilerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const kaynak = (Array.isArray(sp.kaynak) ? sp.kaynak[0] : sp.kaynak) ?? "";
  const origin = kaynak === "tarama" ? "pubmed_scan" : kaynak === "elle" ? "manual" : undefined;
  const ai = aiAvailable();
  const [candidates, counts, scan] = await Promise.all([listArticleCandidates({ origin }), countCandidatesByOrigin(), getScanSettings()]);
  const next = nextRunAt(scan);
  const unscored = candidates.filter((c) => c.status === "SUGGESTED" && !c.aiQualityNotes).length;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/makaleler" className="hover:underline">
            Makaleler
          </Link>
        }
        title="Makale önerileri"
        description="Aday makaleleri ekleyin, yapay zekâ ile puanlayın, Journal Club için seçin."
      />

      <Alert tone="info" className="mb-4">
        DOI girip <strong>Ara</strong> deyince künye Crossref/PubMed&apos;den otomatik gelir; PDF yüklerseniz DOI dosyadan bulunur. Tam metin yalnızca
        erişim/telif izinleri çerçevesinde yüklenmeli ve kurum içinde paylaşılmalıdır; yapay zekâ değerlendirmesi özet (abstract) üzerinden yapılır.
      </Alert>
      {!ai && (
        <Alert tone="warning" className="mb-4">
          Yapay zekâ yapılandırılmamış (ANTHROPIC_API_KEY eksik). Değerlendirme ve özet düğmeleri devre dışı.
        </Alert>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="h-4 w-4" /> Otomatik PubMed taraması
          </CardTitle>
          <CardDescription>Alt dallarda yeni yayımlanan önemli çalışmalar arka planda taranır ve size öneri olarak sunulur.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScanPanel settings={scan} nextRun={next ? next.toISOString() : null} isAdmin={user.role === "ADMIN"} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <Card className="scroll-mt-20 self-start" id="ekle">
          <CardHeader tone="brand">
            <CardTitle>Aday makale ekle</CardTitle>
            <CardDescription>DOI veya PDF ile; künye otomatik doldurulur.</CardDescription>
          </CardHeader>
          <CardContent>
            <CandidateForm />
          </CardContent>
        </Card>

        <section className="space-y-4" aria-labelledby="kuyruk">
          <div className="flex flex-col gap-2">
            <h2 id="kuyruk" className="text-lg font-semibold text-ink">
              Aday kuyruğu <span className="text-sm font-normal text-ink-muted">({candidates.length})</span>
            </h2>
            <nav className="flex flex-wrap gap-1.5 text-sm" aria-label="Aday kaynağı">
              {[
                { k: "", label: `Tümü (${counts.all})` },
                { k: "tarama", label: `PubMed taraması (${counts.scan})` },
                { k: "elle", label: `Elle eklenen (${counts.manual})` },
              ].map((t) => (
                <Link
                  key={t.k}
                  href={t.k ? `/makaleler/oneriler?kaynak=${t.k}` : "/makaleler/oneriler"}
                  aria-current={kaynak === t.k ? "page" : undefined}
                  className={`rounded-full border px-3 py-1 ${kaynak === t.k ? "border-brand-300 bg-brand-50 font-medium text-brand-800 dark:bg-brand-950 dark:text-brand-200" : "border-border text-ink-muted hover:bg-surface-muted"}`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            <EvaluateButton aiEnabled={ai} unscored={unscored} />
          </div>

          {candidates.length === 0 ? (
            <EmptyState title="Aday yok" description={origin === "pubmed_scan" ? "Taramadan gelen bekleyen aday yok. Yukarıdan \"Şimdi tara\" diyebilirsiniz." : "Soldaki formdan ilk adayı ekleyin."} />
          ) : (
            <ul className="space-y-3">
              {candidates.map((a) => {
                const st = ARTICLE_STATUS[a.status];
                const q = a.aiQualityNotes;
                return (
                  <li key={a.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {a.subspecialty && <Badge>{SUBSPECIALTY_LABELS[a.subspecialty]}</Badge>}
                      {q && (
                        <Badge tone={q.score >= 70 ? "success" : q.score >= 40 ? "warning" : "neutral"} title="Yapay zekâ uygunluk puanı">
                          Puan {q.score}/100
                        </Badge>
                      )}
                      {!q && a.scanScore !== null && (
                        <Badge tone={a.scanScore >= 70 ? "success" : a.scanScore >= 45 ? "warning" : "neutral"} title="Yapay zekâsız tarama puanı (yayın türü + dergi + özet)">
                          Tarama puanı {a.scanScore}
                        </Badge>
                      )}
                      {!q && a.scanScore === null && a.status === "SUGGESTED" && <Badge>Puanlanmadı</Badge>}
                      {a.origin === "pubmed_scan" && (
                        <Badge tone="info">
                          <Radar className="h-3 w-3" /> PubMed taraması
                        </Badge>
                      )}
                      {notablePubTypes(a.pubTypes)
                        .slice(0, 2)
                        .map((t) => (
                          <Badge key={t} tone="brand">
                            {PUB_TYPE_LABELS[t]}
                          </Badge>
                        ))}
                    </div>
                    <Link href={`/makaleler/${a.id}`} className="mt-2 block text-base font-semibold leading-snug text-ink hover:underline">
                      {a.title}
                    </Link>
                    <p className="mt-1 text-sm text-ink-muted">
                      {[a.authors, a.journal, a.publishedOn].filter(Boolean).join(" · ")}
                      {a.suggestedByName && <span> · Ekleyen: {a.suggestedByName}</span>}
                    </p>
                    {a.origin === "pubmed_scan" && a.abstract && <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{a.abstract}</p>}
                    {a.origin === "pubmed_scan" && a.pmid && (
                      <a href={`https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-brand-700 underline dark:text-brand-300">
                        PubMed&apos;de aç (PMID {a.pmid})
                      </a>
                    )}
                    {a.aiRationale && (
                      <div className="mt-3 rounded-xl bg-surface-muted p-3 text-sm">
                        <div className="mb-1 flex items-center gap-2">
                          <AiBadge label="Yapay zekâ değerlendirmesi" />
                        </div>
                        <p className="whitespace-pre-wrap text-ink">{a.aiRationale}</p>
                        {q && (
                          <dl className="mt-2 grid gap-1 text-xs text-ink-muted sm:grid-cols-2">
                            <div>
                              <dt className="font-medium text-ink">Tasarım</dt>
                              <dd className="whitespace-pre-wrap">{q.design}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-ink">Klinik önem</dt>
                              <dd className="whitespace-pre-wrap">{q.clinicalImportance}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-ink">Yenilik</dt>
                              <dd className="whitespace-pre-wrap">{q.novelty}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-ink">Sınırlılıklar</dt>
                              <dd className="whitespace-pre-wrap">{q.limitations}</dd>
                            </div>
                          </dl>
                        )}
                      </div>
                    )}
                    <div className="mt-3">
                      <ArticleWorkflow articleId={a.id} status={a.status} hasAbstract={Boolean(a.abstract)} aiEnabled={ai} compact />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
