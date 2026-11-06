"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { approveAllQuestionsAction, deleteQuestionAction, reviewQuestionAction, saveQuestionAction } from "@/lib/actions/exams";
import type { ActionResult } from "@/lib/action-result";
import type { Question, QuestionType, Subspecialty } from "@/db/schema";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { AiBadge, Alert, Badge, Button, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui";
import { DIFFICULTY_LABELS, OPTION_KEYS, QUESTION_STATUS_LABELS, QUESTION_STATUS_TONES, QUESTION_TYPE_LABELS } from "@/lib/status-labels-exams";

type SaveResult = ActionResult<{ id: string }>;

const TYPE_HINTS: Record<QuestionType, string> = {
  MULTIPLE_CHOICE: "3-5 seçenek, tek doğru yanıt.",
  MULTI_SELECT: "3-5 seçenek, birden fazla doğru yanıt; tümü doğru işaretlenirse puan alınır.",
  TRUE_FALSE: "Bir ifade; yanıt Doğru veya Yanlış.",
  MATCHING: "3-8 çift; katılımcı sol öğeleri karışık verilen sağ öğelerle eşleştirir. Tüm çiftler doğruysa puan alınır.",
};

function QuestionForm({ examId, question, onDone }: { examId: string; question?: Question; onDone: () => void }) {
  const router = useRouter();
  const [state, formAction] = useActionState<SaveResult | null, FormData>(async (prev, fd) => {
    const r = await saveQuestionAction(prev, fd);
    if (r.ok) {
      router.refresh();
      onDone();
    }
    return r;
  }, null);
  const [type, setType] = useState<QuestionType>(question?.type ?? "MULTIPLE_CHOICE");
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const opt = (k: string) => question?.options.find((o) => o.key === k)?.text ?? "";
  const prefix = question?.id ?? "yeni";
  const multiDefaults = new Set(question?.type === "MULTI_SELECT" ? question.correctKey.split(",") : []);
  const pairsDefault = (question?.pairs ?? []).map((p) => `${p.left} | ${p.right}`).join("\n");

  return (
    <form action={formAction} className="space-y-3" noValidate>
      <input type="hidden" name="examId" value={examId} />
      {question && <input type="hidden" name="questionId" value={question.id} />}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Soru türü" htmlFor={`${prefix}-type`} hint={TYPE_HINTS[type]}>
        <Select id={`${prefix}-type`} name="type" value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
          {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={type === "TRUE_FALSE" ? "İfade" : "Soru kökü"} htmlFor={`${prefix}-stem`} errors={fe?.stem}>
        <Textarea id={`${prefix}-stem`} name="stem" defaultValue={question?.stem ?? ""} required maxLength={5000} />
      </Field>

      {(type === "MULTIPLE_CHOICE" || type === "MULTI_SELECT") && (
        <div className="grid gap-3 sm:grid-cols-2">
          {OPTION_KEYS.map((k) => (
            <div key={k} className="flex items-end gap-2">
              <Field label={`Seçenek ${k}${k === "D" || k === "E" ? " (isteğe bağlı)" : ""}`} htmlFor={`${prefix}-opt-${k}`} errors={fe?.[`option${k}`]} className="flex-1">
                <Input id={`${prefix}-opt-${k}`} name={`option${k}`} defaultValue={opt(k)} maxLength={1000} />
              </Field>
              {type === "MULTI_SELECT" && (
                <label className="mb-2.5 flex items-center gap-1 whitespace-nowrap text-xs text-ink-muted">
                  <input type="checkbox" name="correctKeys" value={k} defaultChecked={multiDefaults.has(k)} /> doğru
                </label>
              )}
            </div>
          ))}
          {type === "MULTIPLE_CHOICE" && (
            <Field label="Doğru seçenek" htmlFor={`${prefix}-correct`} errors={fe?.correctKey}>
              <Select id={`${prefix}-correct`} name="correctKey" defaultValue={question?.type === "MULTIPLE_CHOICE" ? question.correctKey : "A"}>
                {OPTION_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {type === "MULTI_SELECT" && fe?.correctKeys && <p className="text-sm text-red-600 sm:col-span-2">{fe.correctKeys[0]}</p>}
        </div>
      )}

      {type === "TRUE_FALSE" && (
        <Field label="Doğru yanıt" htmlFor={`${prefix}-tf`} errors={fe?.correctKey}>
          <Select id={`${prefix}-tf`} name="correctKey" defaultValue={question?.type === "TRUE_FALSE" ? question.correctKey : "A"}>
            <option value="A">Doğru</option>
            <option value="B">Yanlış</option>
          </Select>
        </Field>
      )}

      {type === "MATCHING" && (
        <Field label="Eşleştirme çiftleri" htmlFor={`${prefix}-pairs`} errors={fe?.pairsText} hint="Her satıra bir çift: sol öğe | sağ öğe. Örn. 'Prostaglandin analoğu | Uveoskleral dışa akımı artırır'">
          <Textarea id={`${prefix}-pairs`} name="pairsText" defaultValue={pairsDefault} rows={5} maxLength={8000} placeholder={"Sol öğe 1 | Sağ öğe 1\nSol öğe 2 | Sağ öğe 2\nSol öğe 3 | Sağ öğe 3"} />
        </Field>
      )}

      <Field label="Açıklama" htmlFor={`${prefix}-explanation`} errors={fe?.explanation} hint="Doğru yanıtın gerekçesi ve çeldiricilerin neden yanlış olduğu.">
        <Textarea id={`${prefix}-explanation`} name="explanation" defaultValue={question?.explanation ?? ""} required maxLength={5000} className="min-h-20" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Alt branş" htmlFor={`${prefix}-sub`} errors={fe?.subspecialty}>
          <Select id={`${prefix}-sub`} name="subspecialty" defaultValue={question?.subspecialty ?? "DIGER"}>
            {(Object.keys(SUBSPECIALTY_LABELS) as Subspecialty[]).map((k) => (
              <option key={k} value={k}>
                {SUBSPECIALTY_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Zorluk" htmlFor={`${prefix}-diff`} errors={fe?.difficulty}>
          <Select id={`${prefix}-diff`} name="difficulty" defaultValue={String(question?.difficulty ?? 2)}>
            {[1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Kaynak atfı" htmlFor={`${prefix}-src`} errors={fe?.sourceRef}>
          <Input id={`${prefix}-src`} name="sourceRef" defaultValue={question?.sourceRef ?? ""} maxLength={500} placeholder="örn. Kanski, 9. baskı, s. 412" />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Vazgeç
        </Button>
        <SubmitButton>{question ? "Soruyu kaydet" : "Soruyu ekle"}</SubmitButton>
      </div>
      {question && <p className="text-xs text-ink-muted">Kaydedilen soru yeniden onay bekler.</p>}
    </form>
  );
}

/** Personel için soru gövdesi ve doğru yanıt(lar)ın türe göre gösterimi. */
export function QuestionAnswerKey({ question }: { question: Question }) {
  if (question.type === "MATCHING") {
    return (
      <table className="mt-3 w-full text-sm">
        <tbody>
          {(question.pairs ?? []).map((p, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1.5 pr-3 font-medium text-ink">{p.left}</td>
              <td className="py-1.5 text-ink-muted">→ {p.right}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const correct = new Set(question.correctKey.split(","));
  return (
    <ol className="mt-3 space-y-1.5">
      {question.options.map((o) => (
        <li
          key={o.key}
          className={
            correct.has(o.key)
              ? "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
              : "rounded-lg border border-border px-3 py-1.5 text-sm text-ink"
          }
        >
          <span className="mr-2 font-semibold">{o.key})</span>
          <span className="whitespace-pre-wrap">{o.text}</span>
        </li>
      ))}
    </ol>
  );
}

function QuestionCard({ examId, question, index, editable }: { examId: string; question: Question; index: number; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-2xl border border-border bg-surface p-4 shadow-sm" id={`soru-${question.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-ink">Soru {index + 1}</span>
        <Badge tone={QUESTION_STATUS_TONES[question.status]}>{QUESTION_STATUS_LABELS[question.status]}</Badge>
        <Badge tone="neutral">{QUESTION_TYPE_LABELS[question.type]}</Badge>
        {question.aiGenerated && <AiBadge />}
        <Badge>{SUBSPECIALTY_LABELS[question.subspecialty]}</Badge>
        <Badge tone="info">{DIFFICULTY_LABELS[question.difficulty] ?? question.difficulty}</Badge>
      </div>
      {editing ? (
        <div className="mt-3">
          <QuestionForm examId={examId} question={question} onDone={() => setEditing(false)} />
        </div>
      ) : (
        <>
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{question.stem}</p>
          {question.imageFileId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/dosya/${question.imageFileId}`} alt="Soru görseli" className="mt-3 max-h-72 rounded-xl border border-border object-contain" />
          )}
          <QuestionAnswerKey question={question} />
          <div className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-ink-muted">
            <span className="font-medium text-ink">Açıklama: </span>
            <span className="whitespace-pre-wrap">{question.explanation}</span>
            {question.sourceRef && <p className="mt-1 text-xs">Kaynak: {question.sourceRef}</p>}
          </div>
          {editable && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                Düzenle
              </Button>
              {question.status !== "APPROVED" && (
                <form action={reviewQuestionAction}>
                  <input type="hidden" name="examId" value={examId} />
                  <input type="hidden" name="questionId" value={question.id} />
                  <input type="hidden" name="decision" value="APPROVED" />
                  <SubmitButton size="sm" variant="secondary">
                    Onayla
                  </SubmitButton>
                </form>
              )}
              {question.status !== "REJECTED" && (
                <form action={reviewQuestionAction}>
                  <input type="hidden" name="examId" value={examId} />
                  <input type="hidden" name="questionId" value={question.id} />
                  <input type="hidden" name="decision" value="REJECTED" />
                  <SubmitButton size="sm" variant="ghost">
                    Reddet
                  </SubmitButton>
                </form>
              )}
              <form
                action={deleteQuestionAction}
                onSubmit={(e) => {
                  if (!window.confirm("Bu soru silinecek. Emin misiniz?")) e.preventDefault();
                }}
              >
                <input type="hidden" name="examId" value={examId} />
                <input type="hidden" name="questionId" value={question.id} />
                <SubmitButton size="sm" variant="ghost" className="text-red-600 hover:text-red-700">
                  Sil
                </SubmitButton>
              </form>
            </div>
          )}
        </>
      )}
    </li>
  );
}

export function QuestionEditor({ examId, questions, editable }: { examId: string; questions: Question[]; editable: boolean }) {
  const [adding, setAdding] = useState(false);
  const draftCount = questions.filter((q) => q.status === "DRAFT").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          {questions.length} soru · {questions.filter((q) => q.status === "APPROVED").length} onaylı
          {draftCount > 0 && ` · ${draftCount} taslak`}
        </p>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {draftCount > 0 && (
              <form
                action={approveAllQuestionsAction}
                onSubmit={(e) => {
                  if (!window.confirm(`${draftCount} taslak soru onaylanacak. Her soruyu incelediğinizi onaylıyor musunuz?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="examId" value={examId} />
                <SubmitButton size="sm" variant="secondary">
                  Tümünü onayla
                </SubmitButton>
              </form>
            )}
            {!adding && (
              <Button type="button" size="sm" onClick={() => setAdding(true)}>
                Yeni soru
              </Button>
            )}
          </div>
        )}
      </div>
      {adding && (
        <div className="rounded-2xl border border-brand-200 bg-surface p-4 shadow-sm dark:border-brand-900">
          <p className="mb-3 text-sm font-semibold text-ink">Yeni soru</p>
          <QuestionForm examId={examId} onDone={() => setAdding(false)} />
        </div>
      )}
      {questions.length === 0 && !adding ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-ink-muted">Henüz soru yok. Elle ekleyin veya yapay zekâ ile taslak üretin.</p>
      ) : (
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <QuestionCard key={q.id} examId={examId} question={q} index={i} editable={editable} />
          ))}
        </ol>
      )}
    </div>
  );
}
