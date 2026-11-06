import Link from "next/link";
import { requireStaff } from "@/lib/auth/dal";
import { listSources, SOURCE_STATUS_LABELS, type SourceStatus } from "@/lib/queries/sources";
import { SUBSPECIALTY_LABELS, sourceStatusEnum } from "@/db/schema";
import { PageHeader, Card, CardHeader, CardTitle, CardDescription, CardContent, EmptyState, Alert, buttonClasses } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { SourceForm } from "@/components/sources/source-form";
import { SourceStatusBadge, ApprovalBadge } from "@/components/sources/source-badges";
import { SourceRowActions } from "@/components/sources/source-row-actions";

export const metadata = { title: "Kaynaklar" };

const STATUSES = sourceStatusEnum.enumValues;

export default async function SourcesPage({ searchParams }: PageProps<"/kaynaklar">) {
  await requireStaff();
  const sp = await searchParams;
  const statusRaw = typeof sp.durum === "string" ? sp.durum : "";
  const approvedRaw = typeof sp.onay === "string" ? sp.onay : "";
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as SourceStatus) : undefined;
  const approved = approvedRaw === "1" ? true : approvedRaw === "0" ? false : undefined;
  const rows = await listSources({ status, approved });

  const filterLink = (next: { durum?: string; onay?: string }) => {
    const p = new URLSearchParams();
    const d = next.durum ?? statusRaw;
    const o = next.onay ?? approvedRaw;
    if (d) p.set("durum", d);
    if (o) p.set("onay", o);
    const q = p.toString();
    return q ? `/kaynaklar?${q}` : "/kaynaklar";
  };

  return (
    <>
      <PageHeader
        title="Bilimsel Kaynaklar"
        description="Yapay zekâ asistanı yalnızca burada listelenen, indekslenmiş ve uzman onayı almış kaynaklara dayanır."
        actions={<a href="#yeni-kaynak" className={buttonClasses("primary", "md")}>Yeni kaynak</a>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,400px)]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-muted">Durum:</span>
            <Link href={filterLink({ durum: "" })} className={chip(!status)}>
              Tümü
            </Link>
            {STATUSES.map((s) => (
              <Link key={s} href={filterLink({ durum: s })} className={chip(status === s)}>
                {SOURCE_STATUS_LABELS[s]}
              </Link>
            ))}
            <span className="ml-2 text-ink-muted">Onay:</span>
            <Link href={filterLink({ onay: "" })} className={chip(approved === undefined)}>
              Tümü
            </Link>
            <Link href={filterLink({ onay: "1" })} className={chip(approved === true)}>
              Onaylı
            </Link>
            <Link href={filterLink({ onay: "0" })} className={chip(approved === false)}>
              Onaysız
            </Link>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="Kaynak bulunamadı" description="Filtreyi değiştirin veya yeni bir kaynak ekleyin." />
          ) : (
            <ul className="space-y-3">
              {rows.map((s) => (
                <li key={s.id}>
                  <Card>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/kaynaklar/${s.id}`} className="font-semibold text-ink hover:underline">
                            {s.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {s.type}
                            {s.year ? ` · ${s.year}` : ""}
                            {s.subspecialty ? ` · ${SUBSPECIALTY_LABELS[s.subspecialty]}` : ""}
                            {s.uploaderName ? ` · ${s.uploaderName}` : ""} · {formatDate(s.createdAt)} · {s.chunkCount} parça
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <SourceStatusBadge status={s.status} />
                          <ApprovalBadge approved={s.approved} />
                        </div>
                      </div>
                      {s.status === "FAILED" && s.errorMessage && (
                        <Alert tone="danger" className="py-2">
                          {s.errorMessage}
                        </Alert>
                      )}
                      <SourceRowActions
                        source={{ id: s.id, title: s.title, status: s.status, approved: s.approved, lessonCount: s.lessonCount, chunkCount: s.chunkCount }}
                        returnTo="/kaynaklar"
                      />
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div id="yeni-kaynak">
          <Card>
            <CardHeader>
              <CardTitle>Yeni kaynak ekle</CardTitle>
              <CardDescription>PDF yükleyin veya metin yapıştırın. Telif / kullanım izni açıklaması zorunludur.</CardDescription>
            </CardHeader>
            <CardContent>
              <SourceForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function chip(active: boolean) {
  return active
    ? "rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white"
    : "rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-muted hover:bg-surface-muted";
}
