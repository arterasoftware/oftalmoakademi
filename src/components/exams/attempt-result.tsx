import Link from "next/link";
import type { ExamAttempt, Question } from "@/db/schema";
import { SUBSPECIALTY_LABELS, type Subspecialty } from "@/db/schema";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { isAnswered, isCorrect, parseMatchingAnswer, percentage, TRUE_FALSE_OPTIONS } from "@/lib/exams/grading";
import { QUESTION_TYPE_LABELS } from "@/lib/status-labels-exams";
import { cn } from "@/lib/utils";

/**
 * Sonuç görünümü (sunucu bileşeni). Yalnızca sonuçlar görünür olduğunda çağrılır;
 * doğru anahtar ve açıklama burada gösterilir.
 */
export function AttemptResult({ attempt, questions, lessonId, lessonTitle }: { attempt: ExamAttempt; questions: Question[]; lessonId: string | null; lessonTitle: string | null }) {
  const pct = percentage(attempt.score, attempt.total);
  const breakdown = Object.entries(attempt.breakdown ?? {}).sort((a, b) => b[1].total - a[1].total);
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Puan</p>
            <p className="text-3xl font-semibold text-ink">
              {attempt.score ?? 0}
              <span className="text-base font-normal text-ink-muted">/{attempt.total ?? 0}</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Başarı</p>
            <p className={cn("text-3xl font-semibold", pct >= 70 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-600")}>{pct}%</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Yanıtlanan</p>
            <p className="text-3xl font-semibold text-ink">
              {Object.keys(attempt.answers ?? {}).length}
              <span className="text-base font-normal text-ink-muted">/{attempt.total ?? 0}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {breakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alt branş dağılımı</CardTitle>
            <CardDescription>Her alt branştaki doğru/toplam oranınız.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="py-1.5 pr-3">Alt branş</th>
                  <th className="py-1.5 pr-3 text-right">Doğru</th>
                  <th className="py-1.5 pr-3 text-right">Toplam</th>
                  <th className="py-1.5 pr-3 text-right">Oran</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map(([k, v]) => (
                  <tr key={k} className="border-t border-border">
                    <td className="py-1.5 pr-3 text-ink">{SUBSPECIALTY_LABELS[k as Subspecialty] ?? k}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{v.correct}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{v.total}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{percentage(v.correct, v.total)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="soru-inceleme">
        <h2 id="soru-inceleme" className="mb-3 text-lg font-semibold text-ink">
          Soru incelemesi
        </h2>
        {lessonId && (
          <p className="mb-3 text-sm text-ink-muted">
            İlgili ders:{" "}
            <Link href={`/dersler/${lessonId}`} className="text-brand-700 underline-offset-2 hover:underline">
              {lessonTitle ?? "Dersi aç"}
            </Link>
          </p>
        )}
        <ol className="space-y-3">
          {questions.map((q, i) => {
            const mine = attempt.answers?.[q.id];
            const answered = isAnswered(q, mine);
            const correct = isCorrect(q, mine);
            const options = q.type === "TRUE_FALSE" ? TRUE_FALSE_OPTIONS : q.options;
            const correctKeys = new Set(q.correctKey.split(","));
            const mineKeys = new Set((mine ?? "").split(","));
            const mineMatch = parseMatchingAnswer(mine);
            return (
              <li key={q.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">Soru {i + 1}</span>
                  {answered ? <Badge tone={correct ? "success" : "danger"}>{correct ? "Doğru" : "Yanlış"}</Badge> : <Badge tone="warning">Boş</Badge>}
                  <Badge tone="neutral">{QUESTION_TYPE_LABELS[q.type]}</Badge>
                  <Badge>{SUBSPECIALTY_LABELS[q.subspecialty]}</Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{q.stem}</p>
                {q.imageFileId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/dosya/${q.imageFileId}`} alt="Soru görseli" className="mt-3 max-h-72 rounded-xl border border-border object-contain" />
                )}
                {q.type === "MATCHING" ? (
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-ink-muted">
                        <th className="py-1 pr-3">Öğe</th>
                        <th className="py-1 pr-3">Sizin eşleştirmeniz</th>
                        <th className="py-1">Doğru eşleşme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(q.pairs ?? []).map((p, pi) => {
                        const chosen = mineMatch[String(pi)];
                        const ok = chosen === p.right;
                        return (
                          <tr key={pi} className="border-t border-border">
                            <td className="py-1.5 pr-3 text-ink">{p.left}</td>
                            <td className={cn("py-1.5 pr-3", ok ? "text-emerald-700" : chosen ? "text-red-700" : "text-ink-muted")}>{chosen ?? "—"}</td>
                            <td className="py-1.5 text-emerald-700">{p.right}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <ul className="mt-3 space-y-1.5">
                    {options.map((o) => {
                      const isCorrectOpt = correctKeys.has(o.key);
                      const isMine = mineKeys.has(o.key);
                      return (
                        <li
                          key={o.key}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-sm",
                            isCorrectOpt
                              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
                              : isMine
                                ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
                                : "border-border text-ink",
                          )}
                        >
                          <span className="mr-2 font-semibold">{o.key})</span>
                          <span className="whitespace-pre-wrap">{o.text}</span>
                          {isMine && <span className="ml-2 text-xs">(sizin yanıtınız)</span>}
                          {isCorrectOpt && <span className="ml-2 text-xs">(doğru yanıt)</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                  <span className="font-medium text-ink">Açıklama: </span>
                  <span className="whitespace-pre-wrap">{q.explanation}</span>
                  {q.sourceRef && <p className="mt-1 text-xs">Kaynak: {q.sourceRef}</p>}
                  {q.lessonId && (
                    <p className="mt-1 text-xs">
                      <Link href={`/dersler/${q.lessonId}`} className="text-brand-700 underline-offset-2 hover:underline">
                        İlgili dersi aç
                      </Link>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
