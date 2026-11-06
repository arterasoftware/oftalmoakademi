import Link from "next/link";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { listEventsForMonth, monthParam, parseMonthParam, shiftMonth, type CalendarEventRow } from "@/lib/queries/calendar";
import { deleteCalendarEventAction } from "@/lib/actions/calendar";
import { PageHeader, Badge, Button, Card, CardContent, CardHeader, CardTitle, CardDescription, buttonClasses } from "@/components/ui";
import { CALENDAR_KIND, calendarEventLink, type CalendarKind } from "@/lib/status-labels";
import { cn, formatDateTime } from "@/lib/utils";
import { EventForm } from "./event-form";

export const metadata = { title: "Takvim" };

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function kindMeta(kind: string) {
  return CALENDAR_KIND[(kind in CALENDAR_KIND ? kind : "OTHER") as CalendarKind];
}

const dotColor: Record<CalendarKind, string> = {
  LESSON: "bg-brand-600",
  ARTICLE: "bg-sky-500",
  EXAM: "bg-amber-500",
  OTHER: "bg-slate-400",
};

export default async function TakvimPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const ref = parseMonthParam(sp.ay, now);
  const events = await listEventsForMonth(ref);
  const staff = isStaff(user.role);

  const first = new Date(ref.year, ref.month - 1, 1);
  const daysInMonth = new Date(ref.year, ref.month, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // Pazartesi başlangıçlı
  const cells: (number | null)[] = [...Array<null>(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = new Map<number, CalendarEventRow[]>();
  for (const ev of events) {
    const d = ev.startsAt.getDate();
    byDay.set(d, [...(byDay.get(d) ?? []), ev]);
  }
  const isToday = (d: number) => now.getFullYear() === ref.year && now.getMonth() + 1 === ref.month && now.getDate() === d;
  const monthTitle = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(first);
  const ay = monthParam(ref);

  return (
    <>
      <PageHeader
        title="Takvim"
        description="Ders yayınları, haftanın makalesi, sınavlar ve bölüm etkinlikleri."
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/takvim?ay=${monthParam(shiftMonth(ref, -1))}`} className={buttonClasses("outline", "sm")} aria-label="Önceki ay">
              ‹
            </Link>
            <Link href="/takvim" className={buttonClasses("ghost", "sm")}>
              Bugün
            </Link>
            <Link href={`/takvim?ay=${monthParam(shiftMonth(ref, 1))}`} className={buttonClasses("outline", "sm")} aria-label="Sonraki ay">
              ›
            </Link>
          </div>
        }
      />

      <h2 className="mb-3 text-lg font-semibold capitalize text-ink">{monthTitle}</h2>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted text-center text-xs font-medium text-ink-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const dayEvents = day ? byDay.get(day) ?? [] : [];
            return (
              <div key={i} className={cn("min-h-16 border-b border-r border-border p-1 sm:min-h-24 sm:p-1.5", day === null && "bg-surface-muted/60", (i + 1) % 7 === 0 && "border-r-0")}>
                {day !== null && (
                  <>
                    <div className={cn("mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", isToday(day) ? "bg-brand-600 font-semibold text-white" : "text-ink-muted")}>{day}</div>
                    <div className="flex flex-wrap gap-0.5 sm:hidden">
                      {dayEvents.slice(0, 4).map((ev) => (
                        <span key={ev.id} className={cn("h-1.5 w-1.5 rounded-full", dotColor[(ev.kind in dotColor ? ev.kind : "OTHER") as CalendarKind])} aria-hidden />
                      ))}
                    </div>
                    <ul className="hidden space-y-0.5 sm:block">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const link = calendarEventLink(ev.kind, ev.refId);
                        const cls = cn("block truncate rounded px-1 py-0.5 text-[11px] leading-tight", kindBg(ev.kind));
                        return (
                          <li key={ev.id}>
                            {link ? (
                              <Link href={link} className={cn(cls, "hover:underline")} title={ev.title}>
                                {ev.title}
                              </Link>
                            ) : (
                              <span className={cls} title={ev.title}>
                                {ev.title}
                              </span>
                            )}
                          </li>
                        );
                      })}
                      {dayEvents.length > 3 && <li className="px-1 text-[11px] text-ink-muted">+{dayEvents.length - 3} daha</li>}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="ay-etkinlikleri">
          <h2 id="ay-etkinlikleri" className="mb-3 text-lg font-semibold text-ink">
            Bu ayın etkinlikleri <span className="text-sm font-normal text-ink-muted">({events.length})</span>
          </h2>
          {events.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-ink-muted">Bu ayda etkinlik yok.</p>
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => {
                const meta = kindMeta(ev.kind);
                const link = calendarEventLink(ev.kind, ev.refId);
                const canDelete = staff && ev.kind === "OTHER" && (ev.createdBy === user.id || user.role === "ADMIN");
                return (
                  <li key={ev.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3">
                    <div className="w-24 shrink-0 text-xs text-ink-muted">{formatDateTime(ev.startsAt)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {link ? (
                          <Link href={link} className="text-sm font-medium text-ink hover:underline">
                            {ev.title}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-ink">{ev.title}</span>
                        )}
                      </div>
                      {ev.description && <p className="mt-1 whitespace-pre-wrap text-xs text-ink-muted">{ev.description}</p>}
                    </div>
                    {canDelete && (
                      <form action={deleteCalendarEventAction}>
                        <input type="hidden" name="id" value={ev.id} />
                        <input type="hidden" name="ay" value={ay} />
                        <Button type="submit" variant="ghost" size="sm" aria-label="Etkinliği sil">
                          Sil
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {staff && (
          <Card className="self-start">
            <CardHeader>
              <CardTitle>Etkinlik ekle</CardTitle>
              <CardDescription>Bölüm toplantısı, seminer vb. Ders/makale/sınav etkinlikleri ilgili modülden otomatik eklenir.</CardDescription>
            </CardHeader>
            <CardContent>
              <EventForm />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function kindBg(kind: string) {
  switch (kind) {
    case "LESSON":
      return "bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-100";
    case "ARTICLE":
      return "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-100";
    case "EXAM":
      return "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-100";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100";
  }
}
