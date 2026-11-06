import Link from "next/link";
import { requireUser, ROLE_LABELS } from "@/lib/auth/dal";
import { logoutAction } from "@/lib/actions/auth";
import { getUserProgress } from "@/lib/queries/progress";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, SubmitButton } from "@/components/ui";
import { PasswordForm } from "@/components/profile/password-form";
import { MfaDisableForm, MfaSetup } from "@/components/profile/mfa-setup";
import { EXAM_TYPE_LABELS } from "@/lib/status-labels-exams";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { formatDateTime, initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata = { title: "Profilim" };

export default async function ProfilePage() {
  const user = await requireUser();
  const progress = await getUserProgress(user.id);

  return (
    <>
      <PageHeader
        title="Profilim"
        description="Hesap bilgileriniz, gelişiminiz ve güvenlik ayarları."
        actions={
          <form action={logoutAction}>
            <SubmitButton variant="outline" size="sm">
              Çıkış yap
            </SubmitButton>
          </form>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-600 text-xl font-semibold text-white">{initials(user.name)}</div>
            <dl className="grid flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">Ad Soyad</dt>
                <dd className="font-medium text-ink">
                  {user.title ? `${user.title} ` : ""}
                  {user.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">Rol</dt>
                <dd className="text-ink">
                  <Badge tone="brand">{ROLE_LABELS[user.role]}</Badge>
                  {user.role === "RESIDENT" && user.residencyYear ? <span className="ml-2">{user.residencyYear}. yıl asistanı</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">E-posta</dt>
                <dd className="break-all text-ink">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">Son giriş</dt>
                <dd className="text-ink">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <section aria-labelledby="gelisim">
          <h2 id="gelisim" className="mb-3 text-lg font-semibold text-ink">
            Gelişimim
          </h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Tamamlanan sınav" value={String(progress.overall.exams)} />
            <Stat label="Ortalama başarı" value={progress.overall.averagePercentage === null ? "—" : `${progress.overall.averagePercentage}%`} />
            <Stat label="Yorum" value={String(progress.commentCount)} />
            <Stat label="Paylaşılan olgu" value={String(progress.caseCount)} />
          </div>

          {progress.trend && (
            <Card className="mt-3">
              <CardContent className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium text-ink">Aylık sınav eğilimi:</span>
                <span className="text-ink">
                  {progress.trend.last.examTitle} · {progress.trend.last.percentage}%
                </span>
                {progress.trend.previous && progress.trend.delta !== null ? (
                  <Badge tone={progress.trend.delta > 0 ? "success" : progress.trend.delta < 0 ? "danger" : "neutral"}>
                    {progress.trend.delta > 0 ? "▲" : progress.trend.delta < 0 ? "▼" : "•"} {Math.abs(progress.trend.delta)} puan (önceki: {progress.trend.previous.percentage}%)
                  </Badge>
                ) : (
                  <span className="text-ink-muted">Karşılaştırma için en az iki aylık sınav gerekir.</span>
                )}
              </CardContent>
            </Card>
          )}

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sınav geçmişi</CardTitle>
                <CardDescription>Gönderdiğiniz denemeler; sonuçlar yayımlandıkça puanlar görünür.</CardDescription>
              </CardHeader>
              <CardContent>
                {progress.attempts.length === 0 ? (
                  <p className="text-sm text-ink-muted">Henüz tamamlanmış sınavınız yok.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {progress.attempts.map((a) => (
                      <li key={a.attemptId} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <Link href={`/sinavlar/${a.examId}`} className="block truncate font-medium text-ink hover:underline">
                            {a.examTitle}
                          </Link>
                          <p className="text-xs text-ink-muted">
                            {EXAM_TYPE_LABELS[a.examType]} · {formatDateTime(a.submittedAt)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {a.resultsPending ? (
                            <Badge tone="warning">Sonuç bekleniyor</Badge>
                          ) : (
                            <>
                              <p className="font-semibold tabular-nums text-ink">{a.percentage}%</p>
                              <p className="text-xs tabular-nums text-ink-muted">
                                {a.score}/{a.total}
                              </p>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Alt branş doğruluğu</CardTitle>
                <CardDescription>Yayımlanmış sonuçlardan toplam doğru/toplam oranı.</CardDescription>
              </CardHeader>
              <CardContent>
                {progress.accuracy.length === 0 ? (
                  <p className="text-sm text-ink-muted">Henüz veri yok.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {progress.accuracy.map((s) => (
                      <li key={s.subspecialty}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-ink">{SUBSPECIALTY_LABELS[s.subspecialty] ?? s.subspecialty}</span>
                          <span className="tabular-nums text-ink-muted">
                            {s.correct}/{s.total} · {s.percentage}%
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={s.percentage} aria-valuemin={0} aria-valuemax={100}>
                          <div className={cn("h-full rounded-full", s.percentage >= 70 ? "bg-emerald-500" : s.percentage >= 50 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${s.percentage}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="guvenlik">
          <h2 id="guvenlik" className="mb-3 text-lg font-semibold text-ink">
            Güvenlik
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Parola</CardTitle>
                <CardDescription>Parolanızı değiştirince diğer cihazlardaki oturumlar kapatılır.</CardDescription>
              </CardHeader>
              <CardContent>
                <PasswordForm />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>İki adımlı doğrulama (MFA)</CardTitle>
                <CardDescription>Girişte parolaya ek olarak tek kullanımlık kod istenir.</CardDescription>
              </CardHeader>
              <CardContent>{user.mfaEnabled ? <MfaDisableForm /> : <MfaSetup />}</CardContent>
            </Card>
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      </CardContent>
    </Card>
  );
}
