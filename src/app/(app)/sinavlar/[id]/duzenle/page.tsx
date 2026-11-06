import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/dal";
import { uuidSchema } from "@/lib/validation";
import { getExamForStaff, getLessonOptions, getResidentOptions } from "@/lib/queries/exams";
import { aiAvailable } from "@/lib/ai/client";
import { deleteExamAction } from "@/lib/actions/exams";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, SubmitButton, buttonClasses } from "@/components/ui";
import { ExamForm } from "@/components/exams/exam-form";
import { ExamWorkflow } from "@/components/exams/exam-workflow";
import { QuestionEditor } from "@/components/exams/question-editor";
import { AiQuestionPanel } from "@/components/exams/ai-question-panel";
import { EXAM_STATUS_LABELS, EXAM_STATUS_TONES, EXAM_TYPE_LABELS } from "@/lib/status-labels-exams";
import { formatDateTime } from "@/lib/utils";
import { percentage } from "@/lib/exams/grading";

export const metadata = { title: "Sınavı düzenle" };

export default async function EditExamPage({ params }: PageProps<"/sinavlar/[id]/duzenle">) {
  await requireStaff();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const data = await getExamForStaff(id);
  if (!data) notFound();
  const { exam, questions, attempts, lessonTitle } = data;
  const [lessons, residents] = await Promise.all([getLessonOptions(), getResidentOptions()]);
  const editable = ["DRAFT", "IN_REVIEW", "APPROVED"].includes(exam.status);
  const lessonSub = lessons.find((l) => l.id === exam.lessonId)?.subspecialty ?? null;
  const approved = questions.filter((q) => q.status === "APPROVED").length;
  const submitted = attempts.filter((a) => a.submittedAt);

  return (
    <>
      <PageHeader
        eyebrow={EXAM_TYPE_LABELS[exam.type]}
        title={exam.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={EXAM_STATUS_TONES[exam.status]}>{EXAM_STATUS_LABELS[exam.status]}</Badge>
            <span>
              {exam.startsAt ? formatDateTime(exam.startsAt) : "Tarih belirlenmedi"}
              {exam.endsAt ? ` – ${formatDateTime(exam.endsAt)}` : ""}
            </span>
            {lessonTitle && <span>· Ders: {lessonTitle}</span>}
          </span>
        }
        actions={
          <Link href={`/sinavlar/${exam.id}`} className={buttonClasses("outline", "sm")}>
            Katılımcı görünümü
          </Link>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>İş akışı</CardTitle>
            <CardDescription>
              {questions.length} soru, {approved} onaylı. Onaylamak için tüm sorular onaylı olmalı ve başlangıç/bitiş zamanı girilmeli.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {exam.status === "IN_REVIEW" && approved < questions.length && (
              <Alert tone="warning" className="mb-3">
                {questions.length - approved} soru henüz onaylanmadı veya reddedildi. Reddedilen soruları silin ya da düzenleyip onaylayın.
              </Alert>
            )}
            <ExamWorkflow examId={exam.id} status={exam.status} />
            {exam.status === "RESULTS_PUBLISHED" && <p className="mt-3 text-sm text-ink-muted">Sonuçlar yayımlandı; sınav artık değiştirilemez.</p>}
          </CardContent>
        </Card>

        {editable && (
          <Card>
            <CardHeader>
              <CardTitle>Yapay zekâ ile soru üret</CardTitle>
              <CardDescription>Ders içeriği ve onaylı kaynaklara dayalı taslak sorular. Her soru yayımlanmadan önce öğretim üyesi tarafından onaylanmalıdır.</CardDescription>
            </CardHeader>
            <CardContent>
              <AiQuestionPanel examId={exam.id} lessons={lessons} defaultLessonId={exam.lessonId} defaultSubspecialty={lessonSub} aiEnabled={aiAvailable()} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Sorular</CardTitle>
            <CardDescription>{editable ? "Soruları ekleyin, düzenleyin ve tek tek onaylayın." : "Sınav açıldığı veya kapandığı için sorular değiştirilemez."}</CardDescription>
          </CardHeader>
          <CardContent>
            <QuestionEditor examId={exam.id} questions={questions} editable={editable} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sınav ayarları</CardTitle>
            <CardDescription>{editable ? "Zamanlama ve katılımcı kısıtı. Onaylı sınavda tarih değişikliği takvime yansır." : "Açık veya kapanmış sınavın ayarları değiştirilemez."}</CardDescription>
          </CardHeader>
          <CardContent>
            <ExamForm
              mode="edit"
              defaults={{
                id: exam.id,
                title: exam.title,
                type: exam.type,
                description: exam.description,
                lessonId: exam.lessonId,
                durationMinutes: exam.durationMinutes,
                startsAt: exam.startsAt,
                endsAt: exam.endsAt,
                resultsAt: exam.resultsAt,
                shuffleQuestions: exam.shuffleQuestions,
                participantUserIds: exam.participantUserIds,
              }}
              lessons={lessons}
              residents={residents}
              disabled={!editable}
            />
          </CardContent>
        </Card>

        {attempts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Katılım</CardTitle>
              <CardDescription>
                {attempts.length} deneme, {submitted.length} tamamlandı
                {submitted.length > 0 && ` · Ortalama ${Math.round(submitted.reduce((s, a) => s + percentage(a.score, a.total), 0) / submitted.length)}%`}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="py-1.5 pr-3">Asistan</th>
                    <th className="py-1.5 pr-3">Başlangıç</th>
                    <th className="py-1.5 pr-3">Durum</th>
                    <th className="py-1.5 pr-3 text-right">Puan</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="py-1.5 pr-3 text-ink">{a.userName}</td>
                      <td className="py-1.5 pr-3 text-ink-muted">{formatDateTime(a.startedAt)}</td>
                      <td className="py-1.5 pr-3">{a.submittedAt ? <Badge tone="success">Tamamlandı</Badge> : <Badge tone="warning">Devam ediyor</Badge>}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-ink">{a.submittedAt ? `${a.score}/${a.total} (${percentage(a.score, a.total)}%)` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {["DRAFT", "IN_REVIEW"].includes(exam.status) && (
          <form action={deleteExamAction} className="flex justify-end">
            <input type="hidden" name="examId" value={exam.id} />
            <SubmitButton variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
              Sınavı sil
            </SubmitButton>
          </form>
        )}
      </div>
    </>
  );
}
