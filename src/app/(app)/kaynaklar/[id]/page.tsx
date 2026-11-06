import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/dal";
import { uuidSchema } from "@/lib/validation";
import { getSourceDetail, getSourceChunksPreview, getSourceLessonCount } from "@/lib/queries/sources";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { PageHeader, Card, CardHeader, CardTitle, CardDescription, CardContent, Alert, Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { SourceStatusBadge, ApprovalBadge } from "@/components/sources/source-badges";
import { SourceRowActions } from "@/components/sources/source-row-actions";
import { SearchTest } from "./search-test";

export const metadata = { title: "Kaynak" };

export default async function SourceDetailPage({ params }: PageProps<"/kaynaklar/[id]">) {
  await requireStaff();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const src = await getSourceDetail(id);
  if (!src) notFound();
  const [chunks, lessonCount] = await Promise.all([getSourceChunksPreview(id, 20), getSourceLessonCount(id)]);

  const meta: [string, string | null][] = [
    ["Tür", src.type],
    ["Yazarlar", src.authors],
    ["Yıl", src.year ? String(src.year) : null],
    ["Atıf", src.citation],
    ["DOI", src.doi],
    ["URL", src.url],
    ["Alt branş", src.subspecialty ? SUBSPECIALTY_LABELS[src.subspecialty] : null],
    ["Telif / izin", src.licenseNote],
    ["Dosya", src.file ? `${src.file.originalName} (${(src.file.size / 1024 / 1024).toFixed(2)} MB)` : null],
    ["Yükleyen", src.uploaderName],
    ["Onaylayan", src.approved ? src.approverName : null],
    ["Oluşturma", formatDateTime(src.createdAt)],
    ["Güncelleme", formatDateTime(src.updatedAt)],
  ];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/kaynaklar" className="hover:underline">
            ← Kaynaklar
          </Link>
        }
        title={src.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <SourceStatusBadge status={src.status} />
            <ApprovalBadge approved={src.approved} />
            <Badge>{src.chunkCount} parça</Badge>
          </span>
        }
        actions={
          <SourceRowActions
            source={{ id: src.id, title: src.title, status: src.status, approved: src.approved, lessonCount, chunkCount: src.chunkCount }}
            returnTo="/kaynaklar"
          />
        }
      />

      {src.status === "FAILED" && src.errorMessage && (
        <Alert tone="danger" title="İndeksleme başarısız" className="mb-4">
          {src.errorMessage}
        </Alert>
      )}
      {src.status === "READY" && !src.approved && (
        <Alert tone="warning" className="mb-4">
          Bu kaynak indekslendi ancak henüz uzman onayı almadı; yapay zekâ asistanı onaysız kaynakları kullanmaz. İçeriği gözden geçirip &quot;Onayla&quot; düğmesine basın.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Künye</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {meta
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{k}</dt>
                    <dd className="break-words whitespace-pre-wrap text-ink">
                      {k === "URL" && v ? (
                        <a href={v} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                          {v}
                        </a>
                      ) : (
                        v
                      )}
                    </dd>
                  </div>
                ))}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Arama testi</CardTitle>
              <CardDescription>İndekslemenin çalıştığını doğrulamak için bir soru yazın; yalnızca bu kaynak içinde arama yapılır.</CardDescription>
            </CardHeader>
            <CardContent>
              <SearchTest sourceId={src.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Parça önizlemesi</CardTitle>
              <CardDescription>
                İlk {chunks.length} parça gösteriliyor{src.chunkCount > chunks.length ? ` (toplam ${src.chunkCount})` : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chunks.length === 0 ? (
                <p className="text-sm text-ink-muted">Henüz parça yok. Kaynağı indeksleyin.</p>
              ) : (
                <ol className="space-y-3">
                  {chunks.map((c) => (
                    <li key={c.id} className="rounded-xl border border-border p-3 text-sm">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <span className="font-medium text-ink">#{c.idx + 1}</span>
                        {c.pageStart ? <span>s. {c.pageStart}{c.pageEnd && c.pageEnd !== c.pageStart ? `-${c.pageEnd}` : ""}</span> : null}
                        {c.section ? <span className="truncate">· {c.section}</span> : null}
                        {c.tokenCount ? <span>· ~{c.tokenCount} token</span> : null}
                      </div>
                      <p className="whitespace-pre-wrap text-ink">{c.content}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
