import Link from "next/link";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { listExamsForUser, type ExamListItem } from "@/lib/queries/exams";
import { resultsVisible, percentage } from "@/lib/exams/grading";
import { Badge, Card, CardContent, EmptyState, PageHeader, buttonClasses } from "@/components/ui";
import { EXAM_STATUS_LABELS, EXAM_STATUS_TONES, EXAM_TYPE_LABELS, type ExamType } from "@/lib/status-labels-exams";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Sınavlar" };

function ResidentHint({ e, now }: { e: ExamListItem; now: Date }) {
  const a = e.attempt;
  if (e.status === "APPROVED") return <p className="text-sm text-ink-muted">{e.startsAt ? `${formatDateTime(e.startsAt)} tarihinde açılacak` : "Zamanlanıyor"}</p>;
  if (e.status === "OPEN") {
    if (a?.submittedAt)
      return (
        <p className="text-sm text-ink-muted">
          Sınavı tamamladınız.{" "}
          {e.resultsAt && e.resultsAt > now ? `Sonuçlar ${formatDateTime(e.resultsAt)} tarihinde açıklanacak.` : "Sonuçlar öğretim üyesi tarafından yayımlandığında bildirim alacaksınız."}
        </p>
      );
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/sinavlar/${e.id}`} className={buttonClasses("primary", "sm")}>
          {a ? "Devam et" : "Sınava başla"}
        </Link>
        <span className="text-sm text-ink-muted">
          {e.endsAt ? `${formatDateTime(e.endsAt)} tarihine kadar · ` : ""}
          {e.durationMinutes} dk
        </span>
      </div>
    );
  }
  // CLOSED / RESULTS_PUBLISHED
  if (!a) return <p className="text-sm text-ink-muted">Bu sınava katılmadınız.</p>;
  if (resultsVisible(e, now)) {
    return (
      <p className="text-sm text-ink">
        Sonuç: <span className="font-semibold">{a.score ?? 0}/{a.total ?? 0}</span> ({percentage(a.score, a.total)}%) ·{" "}
        <Link href={`/sinavlar/${e.id}`} className="text-brand-700 underline-offset-2 hover:underline">
          İncele
        </Link>
      </p>
    );
  }
  return <p className="text-sm text-ink-muted">{e.resultsAt && e.resultsAt > now ? `Sonuçlar ${formatDateTime(e.resultsAt)} tarihinde açıklanacak` : "Sonuçlar henüz açıklanmadı"}</p>;
}

function ExamRow({ e, staff, now }: { e: ExamListItem; staff: boolean; now: Date }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={staff ? `/sinavlar/${e.id}/duzenle` : `/sinavlar/${e.id}`} className="text-base font-semibold text-ink hover:underline">
              {e.title}
            </Link>
            <Badge tone={EXAM_STATUS_TONES[e.status]}>{EXAM_STATUS_LABELS[e.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {e.startsAt ? formatDateTime(e.startsAt) : "Tarih belirlenmedi"}
            {e.endsAt ? ` – ${formatDateTime(e.endsAt)}` : ""} · {e.durationMinutes} dk
            {e.lessonTitle ? ` · Ders: ${e.lessonTitle}` : ""}
          </p>
          {staff ? (
            <p className="mt-1 text-sm text-ink-muted">
              {e.questionCount} soru ({e.approvedQuestionCount} onaylı)
              {e.participantUserIds?.length ? ` · ${e.participantUserIds.length} katılımcı` : " · Tüm asistanlar"}
            </p>
          ) : (
            <div className="mt-2">
              <ResidentHint e={e} now={now} />
            </div>
          )}
        </div>
        {staff && (
          <div className="flex shrink-0 gap-2">
            <Link href={`/sinavlar/${e.id}`} className={buttonClasses("outline", "sm")}>
              Görüntüle
            </Link>
            <Link href={`/sinavlar/${e.id}/duzenle`} className={buttonClasses("secondary", "sm")}>
              Düzenle
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function ExamsPage() {
  const user = await requireUser();
  const staff = isStaff(user.role);
  const exams = await listExamsForUser(user);
  const now = new Date();
  const groups: ExamType[] = ["WEEKLY", "MONTHLY"];

  return (
    <>
      <PageHeader
        title="Sınavlar"
        description={staff ? "Haftalık mini sınavlar ve aylık asistan sınavlarını hazırlayın, onaylayın ve sonuçları yayımlayın." : "Açık sınavlara katılın, sonuçlarınızı ve soru incelemelerini görün."}
        actions={
          staff ? (
            <>
              <Link href="/sinavlar/pdf" className={buttonClasses("outline", "md")}>
                PDF&apos;ten sınav
              </Link>
              <Link href="/sinavlar/yeni" className={buttonClasses("primary", "md")}>
                Yeni sınav
              </Link>
            </>
          ) : undefined
        }
      />
      {exams.length === 0 ? (
        <EmptyState title="Henüz sınav yok" description={staff ? "İlk sınavı oluşturmak için 'Yeni sınav' düğmesini kullanın." : "Zamanlanan sınavlar burada görünecek."} />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => {
            const list = exams.filter((e) => e.type === g);
            return (
              <section key={g} aria-labelledby={`grup-${g}`}>
                <h2 id={`grup-${g}`} className="mb-3 text-lg font-semibold text-ink">
                  {EXAM_TYPE_LABELS[g]} <span className="text-sm font-normal text-ink-muted">({list.length})</span>
                </h2>
                {list.length === 0 ? (
                  <p className="text-sm text-ink-muted">Bu türde sınav yok.</p>
                ) : (
                  <div className="space-y-3">
                    {list.map((e) => (
                      <ExamRow key={e.id} e={e} staff={staff} now={now} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
