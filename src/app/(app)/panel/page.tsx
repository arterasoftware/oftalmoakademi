import Link from "next/link";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { getHomeData } from "@/lib/queries/home";
import { listUpcomingEvents } from "@/lib/queries/calendar";
import { PageHeader, Alert, Badge, Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { CALENDAR_KIND, calendarEventLink, type CalendarKind } from "@/lib/status-labels";
import { formatDate, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Ana Sayfa" };

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 6) return "İyi geceler";
  if (h < 12) return "Günaydın";
  if (h < 18) return "İyi günler";
  return "İyi akşamlar";
}

function LinkRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-mx-2 block rounded-xl px-2 py-2 transition-colors hover:bg-surface-muted">
      {children}
    </Link>
  );
}

export default async function PanelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const welcome = sp.hosgeldiniz === "1";
  const staff = isStaff(user.role);
  const [data, upcoming] = await Promise.all([getHomeData(user), listUpcomingEvents(14, 5)]);

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.title ? `${user.title} ` : ""}${user.name}`}
        description={
          data.unread > 0 ? (
            <Link href="/bildirimler" className="hover:underline">
              {data.unread} okunmamış bildiriminiz var.
            </Link>
          ) : (
            "Bu hafta eğitim programında neler var?"
          )
        }
      />

      {welcome && (
        <Alert tone="success" title="OftalmoAkademi'ye hoş geldiniz" className="mb-5">
          Hesabınız hazır. Dersler, haftanın makalesi, olgu tartışmaları ve sınavlar bu sayfadan takip edilir. Profil sayfanızdan iki adımlı doğrulamayı etkinleştirmenizi öneririz.
        </Alert>
      )}

      {staff && data.pending && (
        <Card className="mb-5 border-amber-200 dark:border-amber-900">
          <CardHeader>
            <CardTitle>Onay bekleyenler</CardTitle>
            <CardDescription>İnceleme kuyruğundaki içerikler.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <PendingTile href="/sinavlar" label="Sınav" n={data.pending.exams} />
            <PendingTile href="/makaleler/oneriler" label="Makale önerisi" n={data.pending.articles} />
          </CardContent>
        </Card>
      )}

      <h2 className="mb-3 text-lg font-semibold text-ink">Bu hafta</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Son ders</CardTitle>
          </CardHeader>
          <CardContent>
            {data.latestLesson ? (
              <LinkRow href={`/dersler/${data.latestLesson.id}`}>
                <Badge tone="brand">{SUBSPECIALTY_LABELS[data.latestLesson.subspecialty]}</Badge>
                <p className="mt-1.5 font-medium text-ink">{data.latestLesson.title}</p>
                <p className="text-xs text-ink-muted">
                  {data.latestLesson.authorName} · {formatDate(data.latestLesson.publishedAt)}
                </p>
              </LinkRow>
            ) : (
              <p className="text-sm text-ink-muted">Henüz yayımlanmış ders yok.</p>
            )}
            <Link href="/dersler" className="mt-2 inline-block text-sm text-brand-700 hover:underline dark:text-brand-300">
              Tüm dersler →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Haftanın makalesi</CardTitle>
          </CardHeader>
          <CardContent>
            {data.weekArticle ? (
              <LinkRow href={`/makaleler/${data.weekArticle.id}`}>
                <div className="flex flex-wrap gap-1.5">
                  {data.weekArticle.weekOf && <Badge tone="brand">{formatDate(data.weekArticle.weekOf)} haftası</Badge>}
                  {data.weekArticle.hasSummary && <Badge tone="ai">Türkçe özet</Badge>}
                </div>
                <p className="mt-1.5 font-medium text-ink">{data.weekArticle.title}</p>
                {data.weekArticle.journal && <p className="text-xs text-ink-muted">{data.weekArticle.journal}</p>}
              </LinkRow>
            ) : (
              <p className="text-sm text-ink-muted">Bu hafta için makale henüz yayımlanmadı.</p>
            )}
            <Link href="/makaleler" className="mt-2 inline-block text-sm text-brand-700 hover:underline dark:text-brand-300">
              Tüm makaleler →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sınavlar</CardTitle>
            <CardDescription>Açık ve önümüzdeki 14 gün içinde başlayacak sınavlar.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.exams.length === 0 ? (
              <p className="text-sm text-ink-muted">Yaklaşan sınav yok.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.exams.map((e) => (
                  <li key={e.id}>
                    <LinkRow href={`/sinavlar/${e.id}`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={e.status === "OPEN" ? "success" : "info"}>{e.status === "OPEN" ? "Açık" : "Zamanlandı"}</Badge>
                        <Badge>{e.type === "WEEKLY" ? "Haftalık" : "Aylık"}</Badge>
                      </div>
                      <p className="mt-1 font-medium text-ink">{e.title}</p>
                      <p className="text-xs text-ink-muted">
                        {e.startsAt ? `${formatDateTime(e.startsAt)}` : "Başlangıç belirtilmedi"}
                        {e.endsAt ? ` – ${formatDateTime(e.endsAt)}` : ""} · {e.durationMinutes} dk
                      </p>
                    </LinkRow>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/sinavlar" className="mt-2 inline-block text-sm text-brand-700 hover:underline dark:text-brand-300">
              Tüm sınavlar →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Son olgular</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentCases.length === 0 ? (
              <p className="text-sm text-ink-muted">Henüz yayımlanmış olgu yok.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentCases.map((c) => (
                  <li key={c.id}>
                    <LinkRow href={`/olgular/${c.id}`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="brand">{SUBSPECIALTY_LABELS[c.subspecialty]}</Badge>
                        <Badge tone="warning">Tartışma açık</Badge>
                      </div>
                      <p className="mt-1 font-medium text-ink">{c.title}</p>
                      {c.publishedAt && (
                        <p className="text-xs text-ink-muted">
                          {c.authorName ? `${c.authorName} · ` : ""}
                          {formatDate(c.publishedAt)}
                        </p>
                      )}
                    </LinkRow>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/olgular" className="mt-2 inline-block text-sm text-brand-700 hover:underline dark:text-brand-300">
              Tüm olgular →
            </Link>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Yaklaşan etkinlikler</CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-muted">Önümüzdeki iki haftada planlanmış etkinlik yok.</p>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((ev) => {
                  const meta = CALENDAR_KIND[(ev.kind in CALENDAR_KIND ? ev.kind : "OTHER") as CalendarKind];
                  const link = calendarEventLink(ev.kind, ev.refId);
                  const inner = (
                    <div className="flex flex-wrap items-center gap-2 py-2">
                      <span className="w-32 shrink-0 text-xs text-ink-muted">{formatDateTime(ev.startsAt)}</span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-sm font-medium text-ink">{ev.title}</span>
                    </div>
                  );
                  return <li key={ev.id}>{link ? <Link href={link} className="block hover:underline">{inner}</Link> : inner}</li>;
                })}
              </ul>
            )}
            <Link href="/takvim" className="mt-2 inline-block text-sm text-brand-700 hover:underline dark:text-brand-300">
              Takvim →
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function PendingTile({ href, label, n }: { href: string; label: string; n: number }) {
  return (
    <Link href={href} className="rounded-xl border border-border bg-surface-muted p-3 text-center transition-colors hover:bg-surface">
      <div className={`text-2xl font-semibold ${n > 0 ? "text-amber-700 dark:text-amber-300" : "text-ink"}`}>{n}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </Link>
  );
}
