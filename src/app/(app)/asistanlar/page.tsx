import Link from "next/link";
import { requireStaff } from "@/lib/auth/dal";
import { getCohortReport } from "@/lib/queries/reports";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { PageHeader, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, EmptyState, buttonClasses } from "@/components/ui";
import { PercentBar, Delta, Stat } from "@/components/reports/bars";
import { formatDate, relativeTime } from "@/lib/utils";

export const metadata = { title: "Asistan Gelişim Raporları" };

const YEARS = [1, 2, 3, 4, 5];

export default async function ResidentsReportPage({ searchParams }: PageProps<"/asistanlar">) {
  await requireStaff();
  const sp = await searchParams;
  const yil = typeof sp.yil === "string" && /^[1-5]$/.test(sp.yil) ? Number(sp.yil) : undefined;
  const report = await getCohortReport({ residencyYear: yil });

  return (
    <>
      <PageHeader
        title="Asistan Gelişim Raporları"
        description="Sınav performansı, alt branş bazlı güçlü/zayıf alanlar ve akademik katılım. Sonuçlar asistanlara açıklanmamış olsa da burada görünür."
        actions={
          <a href={`/api/raporlar/asistanlar.csv${yil ? `?yil=${yil}` : ""}`} className={buttonClasses("outline", "sm")}>
            CSV indir
          </a>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-muted">Asistanlık yılı:</span>
        <Link href="/asistanlar" className={buttonClasses(yil ? "ghost" : "secondary", "sm")}>
          Tümü
        </Link>
        {YEARS.map((y) => (
          <Link key={y} href={`/asistanlar?yil=${y}`} className={buttonClasses(yil === y ? "secondary" : "ghost", "sm")}>
            {y}. yıl
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Aktif asistan" value={report.activeResidentCount} />
        <Stat label="Kohort ortalaması" value={report.cohortAverage === null ? "—" : `%${report.cohortAverage}`} sub="puanlanmış tüm sınavlar" />
        <Stat label="Sınav" value={report.exams.length} sub="açık/kapanmış" />
        <Stat
          label="En zayıf alt branş"
          value={report.subspecialtyAccuracy[0] ? SUBSPECIALTY_LABELS[report.subspecialtyAccuracy[0].subspecialty] : "—"}
          sub={report.subspecialtyAccuracy[0] ? `%${report.subspecialtyAccuracy[0].percentage} doğruluk` : undefined}
        />
      </div>

      <Card className="mb-6 overflow-hidden">
        <CardHeader>
          <CardTitle>Asistanlar</CardTitle>
          <CardDescription>Ayrıntılı rapor için ada tıklayın. Eğilim: son iki aylık sınav arasındaki puan farkı.</CardDescription>
        </CardHeader>
        {report.residents.length === 0 ? (
          <CardContent>
            <EmptyState title="Bu filtrede asistan yok" />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2">Asistan</th>
                  <th className="px-3 py-2">Yıl</th>
                  <th className="px-3 py-2">Sınav</th>
                  <th className="px-3 py-2">Ortalama</th>
                  <th className="px-3 py-2">Son aylık</th>
                  <th className="px-3 py-2">Eğilim</th>
                  <th className="px-3 py-2">Zayıf alan</th>
                  <th className="px-3 py-2">Yorum / Olgu</th>
                  <th className="px-3 py-2">Son giriş</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.residents.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-muted/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/asistanlar/${r.id}`} className="font-medium text-brand-700 hover:underline">
                        {r.title ? `${r.title} ` : ""}
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">{r.residencyYear ?? "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{r.examsTaken}</td>
                    <td className="px-3 py-2.5">
                      {r.averagePercentage === null ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <Badge tone={r.averagePercentage >= 75 ? "success" : r.averagePercentage >= 60 ? "warning" : "danger"}>%{r.averagePercentage}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{r.lastMonthly ? `%${r.lastMonthly.percentage}` : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <Delta value={r.trendDelta} />
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">
                      {r.weakest ? `${SUBSPECIALTY_LABELS[r.weakest.subspecialty]} (%${r.weakest.percentage})` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-ink-muted">
                      {r.commentCount} / {r.caseCount}
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">{r.lastLoginAt ? relativeTime(r.lastLoginAt) : "hiç"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sınav bazlı kohort sonuçları</CardTitle>
            <CardDescription>Katılım ve ortalama; düşük katılımlı sınavlar için hatırlatma yapabilirsiniz.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.exams.length === 0 && <p className="text-sm text-ink-muted">Henüz açılmış sınav yok.</p>}
            {report.exams.map((e) => (
              <div key={e.examId} className="rounded-xl border border-border px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/sinavlar/${e.examId}/duzenle`} className="text-sm font-medium text-ink hover:underline">
                    {e.title}
                  </Link>
                  <Badge tone={e.type === "MONTHLY" ? "brand" : "neutral"}>{e.type === "MONTHLY" ? "Aylık" : "Haftalık"}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  Katılım {e.submitted}/{e.participants} · Ortalama {e.average === null ? "—" : `%${e.average}`} · En yüksek {e.highest ?? "—"} · En düşük{" "}
                  {e.lowest ?? "—"}
                  {e.endsAt && ` · Bitiş ${formatDate(e.endsAt)}`}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alt branş bazlı kohort doğruluğu</CardTitle>
            <CardDescription>En düşükten yükseğe; ders planlamasında öncelik için.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.subspecialtyAccuracy.length === 0 && <p className="text-sm text-ink-muted">Puanlanmış sınav verisi yok.</p>}
            {report.subspecialtyAccuracy.map((s) => (
              <PercentBar key={s.subspecialty} label={SUBSPECIALTY_LABELS[s.subspecialty]} value={s.percentage} hint={`${s.correct}/${s.total} soru`} />
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
