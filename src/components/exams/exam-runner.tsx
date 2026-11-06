"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { saveAnswerAction, submitAttemptAction, toggleFlagAction } from "@/lib/actions/exams";
import type { RunnerQuestion } from "@/lib/queries/exams";
import { Alert, Button, Card, CardContent } from "@/components/ui";
import { formatRemaining } from "@/lib/exams/format";
import { cn } from "@/lib/utils";

/**
 * Sınav çözme arayüzü. Soru DTO'sunda doğru anahtar/açıklama bulunmaz.
 * Sayaç yalnızca görseldir; süre sunucuda `deadlineAt` ile uygulanır.
 */
export function ExamRunner({
  attemptId,
  questions,
  initialAnswers,
  initialFlagged,
  deadlineAt,
}: {
  attemptId: string;
  questions: RunnerQuestion[];
  initialAnswers: Record<string, string>;
  initialFlagged: string[];
  deadlineAt: string;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set(initialFlagged));
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [remaining, setRemaining] = useState(() => new Date(deadlineAt).getTime() - Date.now());
  const [submitting, startSubmit] = useTransition();
  const submittedRef = useRef(false);

  const doSubmit = useCallback(
    (auto: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      startSubmit(async () => {
        const r = await submitAttemptAction(attemptId);
        if (!r.ok) {
          submittedRef.current = false;
          setError(r.error);
          return;
        }
        if (auto) setError(null);
        router.refresh();
      });
    },
    [attemptId, router],
  );

  // Geri sayım (görsel). Süre bitince mevcut yanıtlarla gönderilir; sunucu zaten süreyi uygular.
  useEffect(() => {
    const t = setInterval(() => {
      const left = new Date(deadlineAt).getTime() - Date.now();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(t);
        doSubmit(true);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadlineAt, doSubmit]);

  const q = questions[index];
  const hasAnswer = (x: RunnerQuestion) => {
    const a = answers[x.id];
    if (!a) return false;
    if (x.type === "MATCHING") {
      try {
        return Object.keys(JSON.parse(a) as object).length > 0;
      } catch {
        return false;
      }
    }
    return a.trim().length > 0;
  };
  const answeredCount = questions.filter(hasAnswer).length;
  const unanswered = questions.filter((x) => !hasAnswer(x));
  const flaggedList = questions.filter((x) => flagged.has(x.id));

  async function choose(key: string) {
    if (!q || submittedRef.current) return;
    setAnswers((a) => ({ ...a, [q.id]: key }));
    setSaving(true);
    const r = await saveAnswerAction(attemptId, q.id, key);
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      if (/süre doldu|tamamlandı/i.test(r.error)) router.refresh();
    } else setError(null);
  }

  async function toggleFlag() {
    if (!q) return;
    const next = !flagged.has(q.id);
    setFlagged((s) => {
      const copy = new Set(s);
      if (next) copy.add(q.id);
      else copy.delete(q.id);
      return copy;
    });
    const r = await toggleFlagAction(attemptId, q.id, next);
    if (!r.ok) setError(r.error);
  }

  const low = remaining <= 60_000;

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 -mx-4 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur lg:top-0 lg:mx-0 lg:rounded-xl lg:border">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-muted">
            {answeredCount}/{questions.length} yanıtlandı
            {saving && <span className="ml-2 text-xs">kaydediliyor…</span>}
          </span>
          <span className={cn("font-mono text-base font-semibold tabular-nums", low ? "text-red-600" : "text-ink")} aria-live={low ? "assertive" : "off"}>
            {formatRemaining(remaining)}
          </span>
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {review ? (
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-lg font-semibold text-ink">Cevapları gözden geçir</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-ink">Yanıtlanmamış ({unanswered.length})</p>
                {unanswered.length === 0 ? (
                  <p className="text-sm text-ink-muted">Tüm sorular yanıtlandı.</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {unanswered.map((x) => (
                      <li key={x.id}>
                        <button
                          type="button"
                          className="rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-surface-muted"
                          onClick={() => {
                            setIndex(questions.indexOf(x));
                            setReview(false);
                          }}
                        >
                          Soru {questions.indexOf(x) + 1}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-ink">İşaretli ({flaggedList.length})</p>
                {flaggedList.length === 0 ? (
                  <p className="text-sm text-ink-muted">İşaretli soru yok.</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {flaggedList.map((x) => (
                      <li key={x.id}>
                        <button
                          type="button"
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                          onClick={() => {
                            setIndex(questions.indexOf(x));
                            setReview(false);
                          }}
                        >
                          Soru {questions.indexOf(x) + 1}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setReview(false)}>
                Sorulara dön
              </Button>
              <Button
                type="button"
                loading={submitting}
                onClick={() => {
                  const msg =
                    unanswered.length > 0
                      ? `${unanswered.length} soru yanıtlanmadı. Sınavı yine de tamamlamak istiyor musunuz? Bu işlem geri alınamaz.`
                      : "Sınav tamamlanacak ve yanıtlar değerlendirilecek. Bu işlem geri alınamaz. Devam edilsin mi?";
                  if (window.confirm(msg)) doSubmit(false);
                }}
              >
                Sınavı tamamla
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : q ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink-muted">
                  Soru {index + 1} / {questions.length}
                </p>
                <button
                  type="button"
                  onClick={toggleFlag}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm",
                    flagged.has(q.id) ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-100" : "text-ink-muted hover:bg-surface-muted",
                  )}
                  aria-pressed={flagged.has(q.id)}
                >
                  <Flag className="h-4 w-4" /> {flagged.has(q.id) ? "İşaretli" : "İşaretle"}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-base leading-relaxed text-ink">{q.stem}</p>
              {q.imageFileId && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/dosya/${q.imageFileId}`} alt="Soru görseli" className="max-h-96 rounded-xl border border-border object-contain" />
              )}
              <AnswerInput q={q} value={answers[q.id]} onChange={choose} />
              <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                  <ChevronLeft className="h-4 w-4" /> Önceki
                </Button>
                {index < questions.length - 1 ? (
                  <Button type="button" size="sm" onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}>
                    Sonraki <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={() => setReview(true)}>
                    <ListChecks className="h-4 w-4" /> Gözden geçir
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <aside className="space-y-3">
            <Card>
              <CardContent>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Sorular</p>
                <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-4">
                  {questions.map((x, i) => {
                    const answered = hasAnswer(x);
                    const isFlagged = flagged.has(x.id);
                    const current = i === index;
                    return (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => setIndex(i)}
                        aria-label={`Soru ${i + 1}${answered ? ", yanıtlandı" : ""}${isFlagged ? ", işaretli" : ""}`}
                        aria-current={current ? "true" : undefined}
                        className={cn(
                          "relative h-9 rounded-lg border text-sm font-medium",
                          current ? "ring-2 ring-brand-500 ring-offset-1" : "",
                          answered ? "border-brand-600 bg-brand-600 text-white" : "border-border bg-surface text-ink hover:bg-surface-muted",
                        )}
                      >
                        {i + 1}
                        {isFlagged && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 space-y-1 text-xs text-ink-muted">
                  <p>
                    <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand-600 align-middle" /> Yanıtlandı
                  </p>
                  <p>
                    <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500 align-middle" /> İşaretli
                  </p>
                </div>
              </CardContent>
            </Card>
            <Button type="button" variant="secondary" className="w-full" onClick={() => setReview(true)}>
              Cevapları gözden geçir
            </Button>
          </aside>
        </div>
      ) : (
        <Alert tone="warning">Bu sınavda soru bulunamadı.</Alert>
      )}
    </div>
  );
}


/** Soru türüne göre yanıt girişi. Değer her zaman string olarak kaydedilir (bkz. grading.ts). */
function AnswerInput({ q, value, onChange }: { q: RunnerQuestion; value: string | undefined; onChange: (v: string) => void }) {
  if (q.type === "MULTI_SELECT") {
    const selected = new Set((value ?? "").split(",").filter(Boolean));
    return (
      <div>
        <p className="mb-2 text-xs text-ink-muted">Birden fazla doğru yanıt olabilir; uygun olanların tümünü işaretleyin.</p>
        <ul className="space-y-2" role="group" aria-label="Seçenekler">
          {q.options.map((o) => {
            const on = selected.has(o.key);
            return (
              <li key={o.key}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => {
                    const next = new Set(selected);
                    if (on) next.delete(o.key);
                    else next.add(o.key);
                    onChange(Array.from(next).sort().join(","));
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    on ? "border-brand-500 bg-brand-50 text-brand-900 dark:bg-brand-950 dark:text-brand-100" : "border-border bg-surface text-ink hover:bg-surface-muted",
                  )}
                >
                  <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md border text-xs font-semibold", on ? "border-brand-600 bg-brand-600 text-white" : "border-border")}>{on ? "✓" : o.key}</span>
                  <span className="whitespace-pre-wrap pt-0.5">{o.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (q.type === "MATCHING" && q.matching) {
    let current: Record<string, string> = {};
    try {
      current = value ? (JSON.parse(value) as Record<string, string>) : {};
    } catch {
      current = {};
    }
    const used = new Set(Object.values(current));
    return (
      <div>
        <p className="mb-2 text-xs text-ink-muted">Soldaki her öğe için sağ sütundan uygun karşılığı seçin.</p>
        <ul className="space-y-2">
          {q.matching.left.map((left, i) => (
            <li key={i} className="grid gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 sm:grid-cols-2 sm:items-center">
              <span className="text-sm text-ink">
                <span className="mr-2 font-semibold">{i + 1}.</span>
                {left}
              </span>
              <select
                aria-label={`${left} için eşleşme`}
                value={current[String(i)] ?? ""}
                onChange={(e) => {
                  const next = { ...current };
                  if (e.target.value) next[String(i)] = e.target.value;
                  else delete next[String(i)];
                  onChange(JSON.stringify(next));
                }}
                className="block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <option value="">Seçin…</option>
                {q.matching!.right.map((r, j) => (
                  <option key={j} value={r} disabled={used.has(r) && current[String(i)] !== r}>
                    {String.fromCharCode(65 + j)}) {r}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // MULTIPLE_CHOICE ve TRUE_FALSE
  return (
    <ul className="space-y-2" role="radiogroup" aria-label="Seçenekler">
      {q.options.map((o) => {
        const selected = value === o.key;
        return (
          <li key={o.key}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.key)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                selected ? "border-brand-500 bg-brand-50 text-brand-900 dark:bg-brand-950 dark:text-brand-100" : "border-border bg-surface text-ink hover:bg-surface-muted",
              )}
            >
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold", selected ? "border-brand-600 bg-brand-600 text-white" : "border-border")}>{o.key}</span>
              <span className="whitespace-pre-wrap pt-0.5">{o.text}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
