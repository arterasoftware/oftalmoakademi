import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { getArticleDetail } from "@/lib/queries/articles";
import { aiAvailable } from "@/lib/ai/client";
import { uuidSchema } from "@/lib/validation";
import { PageHeader, Badge, AiBadge, Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { ARTICLE_STATUS } from "@/lib/status-labels";
import { formatDate } from "@/lib/utils";
import { Discussion } from "@/components/discussion/discussion";
import { ArticleWorkflow } from "../article-workflow";
import { SummaryEditor } from "./summary-editor";
import { removeArticlePdfAction } from "@/lib/actions/articles";

export const metadata = { title: "Makale" };

function Bullets({ items }: { items: string[] }) {
  if (!items?.length) return <p className="text-sm text-ink-muted">—</p>;
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink sm:text-base">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function Para({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink sm:text-base">{text || "—"}</p>;
}

export default async function MakaleDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const article = await getArticleDetail(id, user);
  if (!article) notFound();

  const staff = isStaff(user.role);
  const st = ARTICLE_STATUS[article.status];
  const s = article.summary;
  const pubmed = article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(article.pmid)}/` : null;
  const doiUrl = article.doi ? `https://doi.org/${encodeURI(article.doi)}` : null;
  const externalUrl = article.url && /^https?:\/\//i.test(article.url) ? article.url : null;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/makaleler" className="hover:underline">
            Makaleler
          </Link>
        }
        title={article.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {staff && <Badge tone={st.tone}>{st.label}</Badge>}
            {article.weekOf && <Badge tone="brand">{formatDate(article.weekOf)} haftası</Badge>}
            {article.subspecialty && <Badge>{SUBSPECIALTY_LABELS[article.subspecialty]}</Badge>}
          </span>
        }
      />

      {staff && (
        <div className="mb-5 space-y-3">
          {article.aiRationale && (
            <Alert tone="info" title="Yapay zekâ öneri gerekçesi">
              <p className="whitespace-pre-wrap">{article.aiRationale}</p>
              {article.aiQualityNotes && <p className="mt-1 text-xs">Uygunluk puanı: {article.aiQualityNotes.score}/100</p>}
            </Alert>
          )}
          <ArticleWorkflow articleId={article.id} status={article.status} hasAbstract={Boolean(article.abstract)} hasSummary={Boolean(s)} aiEnabled={aiAvailable()} />
          {(article.status === "SELECTED" || article.status === "PUBLISHED") && <SummaryEditor articleId={article.id} initial={s ?? null} />}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Künye</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-ink">
          {article.authors && <p>{article.authors}</p>}
          <p className="text-ink-muted">{[article.journal, article.publishedOn].filter(Boolean).join(", ")}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-brand-700 dark:text-brand-300">
            {doiUrl && (
              <li>
                <a href={doiUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  DOI: {article.doi}
                </a>
              </li>
            )}
            {pubmed && (
              <li>
                <a href={pubmed} target="_blank" rel="noopener noreferrer" className="underline">
                  PubMed (PMID {article.pmid})
                </a>
              </li>
            )}
            {externalUrl && (
              <li>
                <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  Dergi sayfası
                </a>
              </li>
            )}
            {article.pdfFileId && (
              <li>
                <a href={`/api/dosya/${article.pdfFileId}`} target="_blank" rel="noopener noreferrer" className="underline">
                  Tam metin (PDF)
                </a>
              </li>
            )}
          </ul>
          {article.pdfFileId && staff && (
            <form action={removeArticlePdfAction} className="text-xs text-ink-muted">
              <input type="hidden" name="id" value={article.id} />
              <button type="submit" className="underline hover:text-red-700">
                PDF&apos;i kaldır
              </button>
            </form>
          )}
          {article.abstract && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-ink">Özet (abstract, özgün dil)</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{article.abstract}</p>
            </details>
          )}
          <p className="pt-2 text-xs text-ink-muted">
            Tam metin yalnızca erişim/telif izinleri çerçevesinde kullanılır; değerlendirme özet (abstract) üzerinden yapılmıştır.
          </p>
        </CardContent>
      </Card>

      {s ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">Türkçe değerlendirme</h2>
            {s.source === "manual" ? (
              <Badge tone="brand">Öğretim üyesi özeti</Badge>
            ) : (
              <AiBadge label={article.status === "PUBLISHED" ? "Yapay zekâ özeti · öğretim üyesi seçimi" : "Yapay zekâ taslağı"} />
            )}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Yapılandırılmış özet</CardTitle>
            </CardHeader>
            <CardContent>
              <Para text={s.structuredSummaryTr} />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Arka plan</CardTitle>
              </CardHeader>
              <CardContent>
                <Para text={s.background} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Yöntem</CardTitle>
              </CardHeader>
              <CardContent>
                <Para text={s.methods} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Temel bulgular</CardTitle>
            </CardHeader>
            <CardContent>
              <Bullets items={s.keyFindings} />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Güçlü yönler</CardTitle>
              </CardHeader>
              <CardContent>
                <Bullets items={s.strengths} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Zayıf yönler / sınırlılıklar</CardTitle>
              </CardHeader>
              <CardContent>
                <Bullets items={s.weaknesses} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Klinik çıkarımlar</CardTitle>
            </CardHeader>
            <CardContent>
              <Para text={s.clinicalImplications} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tartışma soruları</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink sm:text-base">
                {s.discussionQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      ) : (
        staff && (
          <Alert tone="warning" className="mt-4">
            Henüz Türkçe özet yok. {article.status === "SUGGESTED" ? "Önce makaleyi seçin." : "Yukarıdaki formla elle yazın veya yapay zekâ ile üretip düzeltin."}
          </Alert>
        )
      )}

      {article.status === "PUBLISHED" && <Discussion targetType="ARTICLE" targetId={article.id} path={`/makaleler/${article.id}`} />}
    </>
  );
}
