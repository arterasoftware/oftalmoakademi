import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/dal";
import { getResidentReport } from "@/lib/queries/reports";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { uuidSchema } from "@/lib/validation";
import { PageHeader, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, buttonClasses, Alert } from "@/components/ui";
import { PercentBar, Delta, Stat } from "@/components/reports/bars";
import { formatDate, formatDateTime, relativeTime, truncate } from "@/lib/utils";

export const metadata = { title: "Asistan raporu" };

const TARGET_PATH: Record<string, string> = { LESSON: "/dersler", ARTICLE: "/makaleler", CASE: "/olgular" };
const CASE_STATUS_TR: Record<string, string> = { PUBLISHED: "Tartışmaya açık", HIDDEN: "Gizlendi" };

export default async function ResidentReportPage({ params }: PageProps<"/asistanlar/[id]">) {
  await requireStaff();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const r = await getResidentReport(id);
  if (!r) notFound();
  const p = r.progress;

  // Aylık sınav eğilimi (eski -> yeni)
  const monthly = [...p.attempts].filter((a) => a.examType === "MONTHLY" && a.percentage !== null).reverse();
  const weak = p.accuracy.filter((a) => a.total >= 3 && a.percentage < 60);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/asistanlar" className="hover:underline">
            ← Asistanlar
          </Link>
        }
        title={`${r.user.title ? r.user.title + " " : ""}${r.user.name}`}
        description={`${r.user.residencyYear ? `${r.user.residencyYear}. yıl asistanı · ` : ""}${r.user.email} · Kayıt ${formatDate(r.user.createdAt)} · Son giriş ${r.user.lastLoginAt ? relativeTime(r.user.lastLoginAt) : "hiç"}`}
        actions={
          <a href={`/api/raporlar/asistanlar.csv?asistan=${r.user.id}`} className={buttonClasses("outline", "sm")}>
            Sınav geçmişini CSV indir
          </a>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tamamlanan sınav" value={p.overall.exams} />
        <Stat label="Ortalama başarı" value={p.overall.averagePercentage === null ? "—" : `%${p.overall.averagePercentage}`} />
        <Stat label="Son aylık sınav" value={p.trend ? `%${p.trend.last.percentage}` : "—"} sub={p.trend ? truncate(p.trend.last.examTitle, 30) : undefined} />
        <Stat label="Yorum / Olgu" value={`${p.commentCount} / ${p.caseCount}`} />
      </div>

      {weak.length > 0 && (
        <Alert tone="warning" title="Destek gerektiren alanlar" className="mb-6">
          {weak.map((w) => `${SUBSPECIALTY_LABELS[w.subspecialty]} (%${w.percentage}, ${w.total} soru)`).join(" · ")}. Bu alanlarda ek ders veya olgu
          tartışması planlanabilir.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Aylık sınav eğilimi</CardTitle>
            <CardDescription>
              {p.trend?.delta !== null && p.trend?.delta !== undefined ? (
                <>
                  Son iki aylık sınav: <Delta value={p.trend.delta} />
                </>
              ) : (
                "Eğilim için en az iki aylık sınav gerekir."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {monthly.length === 0 && <p className="text-sm text-ink-muted">Aylık sınav verisi yok.</p>}
            {monthly.map((a) => (
              <PercentBar key={a.attemptId} label={`${formatDate(a.submittedAt)} · ${truncate(a.examTitle, 40)}`} value={a.percentage} compare={r.examCohortAverage[a.examId]} hint={r.examCohortAverage[a.examId] !== null && r.examCohortAverage[a.examId] !== undefined ? `kohort %${r.examCohortAverage[a.examId]}` : undefined} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alt branş doğruluğu</CardTitle>
            <CardDescription>Çubuk: asistan; dikey çizgi: kohort ortalaması.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {p.accuracy.length === 0 && <p className="text-sm text-ink-muted">Puanlanmış sınav verisi yok.</p>}
            {p.accuracy.map((a) => (
              <PercentBar key={a.subspecialty} label={SUBSPECIALTY_LABELS[a.subspecialty]} value={a.percentage} compare={r.cohortSubspecialty[a.subspecialty] ?? null} hint={`${a.correct}/${a.total}`} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <CardTitle>Sınav geçmişi</CardTitle>
          <CardDescription>Asistana henüz açıklanmamış sonuçlar burada yine de görünür; asistan kendi profilinde bunları sonuç yayımlanana kadar göremez.</CardDescription>
        </CardHeader>
        {p.attempts.length === 0 ? (
          <CardContent>
            <p className="text-sm text-ink-muted">Henüz tamamlanmış sınav yok.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2">Sınav</th>
                  <th className="px-3 py-2">Tür</th>
                  <th className="px-3 py-2">Tarih</th>
                  <th className="px-3 py-2">Puan</th>
                  <th className="px-3 py-2">Yüzde</th>
                  <th className="px-3 py-2">Kohort</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {p.attempts.map((a) => (
                  <tr key={a.attemptId}>
                    <td className="px-4 py-2.5">
                      <Link href={`/sinavlar/${a.examId}/duzenle`} className="font-medium text-ink hover:underline">
                        {a.examTitle}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={a.examType === "MONTHLY" ? "brand" : "neutral"}>{a.examType === "MONTHLY" ? "Aylık" : "Haftalık"}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">{formatDateTime(a.submittedAt)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{a.score === null ? "puanlanmadı" : `${a.score}/${a.total}`}</td>
                    <td className="px-3 py-2.5 tabular-nums">{a.percentage === null ? "—" : `%${a.percentage}`}</td>
                    <td className="px-3 py-2.5 tabular-nums text-ink-muted">
                      {r.examCohortAverage[a.examId] === null || r.examCohortAverage[a.examId] === undefined ? "—" : `%${r.examCohortAverage[a.examId]}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Son yorumlar</CardTitle>
            <CardDescription>Tartışmalara katılım (son 10).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {r.recentComments.length === 0 && <p className="text-sm text-ink-muted">Henüz yorum yok.</p>}
            {r.recentComments.map((c) => (
              <Link key={c.id} href={`${TARGET_PATH[c.targetType] ?? "/panel"}/${c.targetId}#yorum-${c.id}`} className="block rounded-xl border border-border px-3 py-2 hover:bg-surface-muted">
                <p className="text-sm text-ink">{truncate(c.body, 160)}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{relativeTime(c.createdAt)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Paylaştığı olgular</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {r.cases.length === 0 && <p className="text-sm text-ink-muted">Henüz olgu paylaşmamış.</p>}
            {r.cases.map((c) => (
              <Link key={c.id} href={`/olgular/${c.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 hover:bg-surface-muted">
                <span className="text-sm font-medium text-ink">{c.title}</span>
                <Badge>{CASE_STATUS_TR[c.status] ?? c.status}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
