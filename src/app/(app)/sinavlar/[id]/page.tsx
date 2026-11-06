import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { uuidSchema } from "@/lib/validation";
import { canParticipate, getApprovedQuestions, getExamForParticipant, getQuestionsForAttempt, toRunnerQuestion } from "@/lib/queries/exams";
import { resultsVisible } from "@/lib/exams/grading";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, buttonClasses } from "@/components/ui";
import { ExamRunner } from "@/components/exams/exam-runner";
import { StartExamButton } from "@/components/exams/start-exam-button";
import { AttemptResult } from "@/components/exams/attempt-result";
import { EXAM_STATUS_LABELS, EXAM_STATUS_TONES, EXAM_TYPE_LABELS } from "@/lib/status-labels-exams";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Sınav" };

export default async function ExamPage({ params }: PageProps<"/sinavlar/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const data = await getExamForParticipant(id, user);
  if (!data) notFound();
  const { exam, attempt, lessonTitle } = data;
  const staff = isStaff(user.role);
  if (!staff && ["DRAFT", "IN_REVIEW"].includes(exam.status)) notFound();
  const now = new Date();

  const header = (
    <PageHeader
      eyebrow={EXAM_TYPE_LABELS[exam.type]}
      title={exam.title}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <Badge tone={EXAM_STATUS_TONES[exam.status]}>{EXAM_STATUS_LABELS[exam.status]}</Badge>
          <span>
            {exam.startsAt ? formatDateTime(exam.startsAt) : "Tarih belirlenmedi"}
            {exam.endsAt ? ` – ${formatDateTime(exam.endsAt)}` : ""} · {exam.durationMinutes} dk
          </span>
        </span>
      }
      actions={
        staff ? (
          <Link href={`/sinavlar/${exam.id}/duzenle`} className={buttonClasses("secondary", "sm")}>
            Düzenle
          </Link>
        ) : undefined
      }
    />
  );

  /* ---------------- Personel önizlemesi: deneme oluşturulmaz ---------------- */
  if (staff) {
    const qs = await getApprovedQuestions(exam.id);
    return (
      <>
        {header}
        <Alert tone="info" className="mb-4">
          Önizleme modu: personel sınava katılamaz ve deneme oluşturulmaz. Katılımcılar yalnızca onaylı soruları, doğru anahtar olmadan görür.
        </Alert>
        {exam.description && <p className="mb-4 whitespace-pre-wrap text-sm text-ink-muted">{exam.description}</p>}
        <Card>
          <CardHeader>
            <CardTitle>Onaylı sorular ({qs.length})</CardTitle>
            <CardDescription>Katılımcıya sunulacak soru seti. Doğru seçenek yeşil ile işaretlidir.</CardDescription>
          </CardHeader>
          <CardContent>
            {qs.length === 0 ? (
              <p className="text-sm text-ink-muted">Henüz onaylı soru yok.</p>
            ) : (
              <ol className="space-y-3">
                {qs.map((q, i) => (
                  <li key={q.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-ink">Soru {i + 1}</span>
                      <Badge>{SUBSPECIALTY_LABELS[q.subspecialty]}</Badge>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{q.stem}</p>
                    <ul className="mt-2 space-y-1">
                      {q.options.map((o) => (
                        <li key={o.key} className={o.key === q.correctKey ? "text-sm font-medium text-emerald-700 dark:text-emerald-300" : "text-sm text-ink"}>
                          {o.key}) {o.text}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  /* ---------------- Asistan ---------------- */
  if (!canParticipate(exam, user)) {
    return (
      <>
        {header}
        <Alert tone="warning">Bu sınavın katılımcısı değilsiniz.</Alert>
      </>
    );
  }

  // Tamamlanmış deneme: sonuç veya bekleme bilgisi
  if (attempt?.submittedAt) {
    if (resultsVisible(exam, now)) {
      const qs = await getQuestionsForAttempt(attempt);
      return (
        <>
          {header}
          <AttemptResult attempt={attempt} questions={qs} lessonId={exam.lessonId} lessonTitle={lessonTitle} />
        </>
      );
    }
    return (
      <>
        {header}
        <Card>
          <CardContent className="space-y-2">
            <p className="text-base font-medium text-ink">Sınavı tamamladınız.</p>
            <p className="text-sm text-ink-muted">
              {Object.keys(attempt.answers ?? {}).length}/{attempt.total ?? attempt.questionOrder.length} soru yanıtlandı · Gönderim: {formatDateTime(attempt.submittedAt)}
            </p>
            <p className="text-sm text-ink-muted">
              {exam.resultsAt && exam.resultsAt > now ? `Sonuçlar ${formatDateTime(exam.resultsAt)} tarihinde açıklanacak.` : "Sonuçlar öğretim üyesi tarafından yayımlandığında bildirim alacaksınız."}
            </p>
          </CardContent>
        </Card>
      </>
    );
  }

  if (exam.status === "OPEN") {
    if (attempt) {
      // Devam eden deneme: güvenli DTO (doğru anahtar/açıklama yok)
      const qs = await getQuestionsForAttempt(attempt);
      return (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h1 className="truncate text-lg font-semibold text-ink">{exam.title}</h1>
            <Badge tone="success">Devam ediyor</Badge>
          </div>
          <ExamRunner
            attemptId={attempt.id}
            questions={qs.map(toRunnerQuestion)}
            initialAnswers={attempt.answers ?? {}}
            initialFlagged={attempt.flagged ?? []}
            deadlineAt={attempt.deadlineAt.toISOString()}
          />
        </>
      );
    }
    const qs = await getApprovedQuestions(exam.id);
    return (
      <>
        {header}
        <Card>
          <CardHeader>
            <CardTitle>Sınava başlamadan önce</CardTitle>
            <CardDescription>Başladığınızda süre işlemeye başlar ve sınav tek seferde tamamlanır.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {exam.description && <p className="whitespace-pre-wrap text-sm text-ink">{exam.description}</p>}
            <ul className="space-y-1 text-sm text-ink-muted">
              <li>• {qs.length} soru, {exam.durationMinutes} dakika</li>
              {exam.endsAt && <li>• Sınav {formatDateTime(exam.endsAt)} tarihinde kapanır; süreniz bu zamanı aşamaz.</li>}
              <li>• Yanıtlarınız her seçimde otomatik kaydedilir; sayfayı kapatsanız bile süre işler.</li>
              <li>• Süre bittiğinde mevcut yanıtlarınız otomatik gönderilir.</li>
              {lessonTitle && <li>• İlgili ders: {lessonTitle}</li>}
            </ul>
            <StartExamButton examId={exam.id} />
          </CardContent>
        </Card>
      </>
    );
  }

  if (exam.status === "APPROVED") {
    return (
      <>
        {header}
        <Card>
          <CardContent className="space-y-2">
            <p className="text-base font-medium text-ink">{exam.startsAt ? `Sınav ${formatDateTime(exam.startsAt)} tarihinde açılacak.` : "Sınav henüz zamanlanmadı."}</p>
            {exam.description && <p className="whitespace-pre-wrap text-sm text-ink-muted">{exam.description}</p>}
            <p className="text-sm text-ink-muted">Süre: {exam.durationMinutes} dakika{lessonTitle ? ` · İlgili ders: ${lessonTitle}` : ""}</p>
          </CardContent>
        </Card>
      </>
    );
  }

  // CLOSED / RESULTS_PUBLISHED, deneme yok
  return (
    <>
      {header}
      <Alert tone="info">Bu sınav kapandı ve katılım kaydınız bulunmuyor.</Alert>
    </>
  );
}
