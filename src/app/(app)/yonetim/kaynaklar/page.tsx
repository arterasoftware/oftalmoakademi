import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { listSources, SOURCE_STATUS_LABELS, type SourceStatus } from "@/lib/queries/sources";
import { SUBSPECIALTY_LABELS, sourceStatusEnum } from "@/db/schema";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, buttonClasses } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { SourceForm } from "@/components/sources/source-form";
import { SourceStatusBadge, ApprovalBadge } from "@/components/sources/source-badges";
import { SourceRowActions } from "@/components/sources/source-row-actions";

export const metadata = { title: "Kaynaklar · Yönetim" };

const STATUSES = sourceStatusEnum.enumValues;
const BASE = "/yonetim/kaynaklar";

export default async function AdminSourcesPage({ searchParams }: PageProps<"/yonetim/kaynaklar">) {
  await requireAdmin();
  const sp = await searchParams;
  const statusRaw = typeof sp.durum === "string" ? sp.durum : "";
  const approvedRaw = typeof sp.onay === "string" ? sp.onay : "";
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as SourceStatus) : undefined;
  const approved = approvedRaw === "1" ? true : approvedRaw === "0" ? false : undefined;
  const rows = await listSources({ status, approved });

  const totals = rows.reduce(
    (acc, r) => {
      acc.chunks += r.chunkCount;
      if (r.approved && r.status === "READY") acc.active += 1;
      return acc;
    },
    { chunks: 0, active: 0 },
  );

  const filterLink = (next: { durum?: string; onay?: string }) => {
    const p = new URLSearchParams();
    const d = next.durum ?? statusRaw;
    const o = next.onay ?? approvedRaw;
    if (d) p.set("durum", d);
    if (o) p.set("onay", o);
    const q = p.toString();
    return q ? `${BASE}?${q}` : BASE;
  };

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Yapay zekâ asistanı yalnızca <strong>hazır</strong> ve <strong>uzman onaylı</strong> kaynaklara dayanır. Silinen kaynağın indeks parçaları ve ders bağlantıları da silinir; bu işlem geri alınamaz
        ve denetim kaydına yazılır.
      </Alert>

      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(320px,400px)]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
            <p className="text-xs text-ink-muted">
              {rows.length} kaynak · {totals.active} etkin (hazır + onaylı) · {totals.chunks} parça
            </p>
          </div>

          {rows.length === 0 ? (
            <EmptyState title="Kaynak bulunamadı" description="Filtreyi değiştirin veya sağdaki formdan yeni bir kaynak ekleyin." />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th className="px-4 py-2.5">Kaynak</th>
                      <th className="px-4 py-2.5">Durum</th>
                      <th className="px-4 py-2.5">Onay</th>
                      <th className="px-4 py-2.5 text-right">Parça</th>
                      <th className="px-4 py-2.5 text-right">Ders</th>
                      <th className="px-4 py-2.5">Eklenme</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((s) => (
                      <tr key={s.id} className="align-top">
                        <td className="px-4 py-3">
                          <Link href={`/kaynaklar/${s.id}`} className="font-medium text-ink hover:underline">
                            {s.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-ink-muted">
                            <Badge>{s.type}</Badge>
                            {s.year ? ` · ${s.year}` : ""}
                            {s.subspecialty ? ` · ${SUBSPECIALTY_LABELS[s.subspecialty]}` : ""}
                            {s.uploaderName ? ` · ${s.uploaderName}` : ""}
                          </p>
                          {s.status === "FAILED" && s.errorMessage && <p className="mt-1 text-xs text-red-600">{s.errorMessage}</p>}
                          <div className="mt-2">
                            <SourceRowActions
                              source={{ id: s.id, title: s.title, status: s.status, approved: s.approved, lessonCount: s.lessonCount, chunkCount: s.chunkCount }}
                              returnTo={BASE}
                              compact
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <SourceStatusBadge status={s.status} />
                        </td>
                        <td className="px-4 py-3">
                          <ApprovalBadge approved={s.approved} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{s.chunkCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{s.lessonCount}</td>
                        <td className="px-4 py-3 text-ink-muted">{formatDate(s.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>

        <div id="yeni-kaynak">
          <Card>
            <CardHeader tone="ai">
              <CardTitle>Yeni kaynak ekle</CardTitle>
              <CardDescription>PDF yükleyin veya metin yapıştırın. Kayıttan sonra indekslenir; yapay zekânın kullanabilmesi için ayrıca onaylamanız gerekir.</CardDescription>
            </CardHeader>
            <CardContent>
              <SourceForm />
            </CardContent>
          </Card>
          <p className="mt-3 text-xs text-ink-muted">
            Öğretim üyeleri de kaynak ekleyebilir:{" "}
            <Link href="/kaynaklar" className={buttonClasses("ghost", "sm", "h-auto px-1 py-0 underline")}>
              Kaynaklar sayfası
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function chip(active: boolean) {
  return active
    ? "rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white"
    : "rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-muted hover:bg-surface-muted";
}
