"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createExamAction, updateExamSettingsAction } from "@/lib/actions/exams";
import type { ActionResult } from "@/lib/action-result";
import { Alert, Field, Input, Select, SubmitButton, Textarea, Hint } from "@/components/ui";
import { EXAM_TYPE_LABELS } from "@/lib/status-labels-exams";
import { toLocalInputValue } from "@/lib/exams/format";
import { SUBSPECIALTY_LABELS } from "@/db/schema";

export type ExamFormDefaults = {
  id?: string;
  title?: string;
  type?: "WEEKLY" | "MONTHLY";
  description?: string | null;
  lessonId?: string | null;
  durationMinutes?: number;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  resultsAt?: Date | string | null;
  shuffleQuestions?: boolean;
  participantUserIds?: string[] | null;
};

export type LessonOption = { id: string; title: string; subspecialty: keyof typeof SUBSPECIALTY_LABELS };
export type ResidentOption = { id: string; name: string; residencyYear: number | null };

export function ExamForm({
  mode,
  defaults,
  lessons,
  residents,
  disabled,
}: {
  mode: "create" | "edit";
  defaults?: ExamFormDefaults;
  lessons: LessonOption[];
  residents: ResidentOption[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const action = mode === "create" ? createExamAction : updateExamSettingsAction;
  const [state, formAction] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const r = await action(prev, fd);
    if (r.ok && mode === "edit") router.refresh();
    return r;
  }, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const type = defaults?.type ?? "WEEKLY";
  const selected = new Set(defaults?.participantUserIds ?? []);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {defaults?.id && <input type="hidden" name="examId" value={defaults.id} />}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <fieldset disabled={disabled} className="space-y-4">
        <Field label="Başlık" htmlFor="title" errors={fe?.title}>
          <Input id="title" name="title" defaultValue={defaults?.title ?? ""} required maxLength={200} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sınav türü" htmlFor="type" errors={fe?.type}>
            <Select id="type" name="type" defaultValue={type}>
              {(Object.keys(EXAM_TYPE_LABELS) as ("WEEKLY" | "MONTHLY")[]).map((k) => (
                <option key={k} value={k}>
                  {EXAM_TYPE_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Süre (dakika)" htmlFor="durationMinutes" errors={fe?.durationMinutes} hint="Haftalık için 10, aylık için 60 dakika önerilir.">
            <Input id="durationMinutes" name="durationMinutes" type="number" min={1} max={600} inputMode="numeric" defaultValue={defaults?.durationMinutes ?? (type === "MONTHLY" ? 60 : 10)} />
          </Field>
        </div>
        <Field label="Açıklama" htmlFor="description" errors={fe?.description}>
          <Textarea id="description" name="description" defaultValue={defaults?.description ?? ""} maxLength={5000} className="min-h-20" />
        </Field>
        <Field label="İlgili ders (isteğe bağlı)" htmlFor="lessonId" errors={fe?.lessonId} hint="Haftalık mini sınavı bir derse bağlayın; yapay zekâ soru üretiminde dersin içeriği ve kaynakları kullanılır.">
          <Select id="lessonId" name="lessonId" defaultValue={defaults?.lessonId ?? ""}>
            <option value="">— Ders seçilmedi —</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title} · {SUBSPECIALTY_LABELS[l.subspecialty]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Başlangıç" htmlFor="startsAt" errors={fe?.startsAt}>
            <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={toLocalInputValue(defaults?.startsAt)} />
          </Field>
          <Field label="Bitiş" htmlFor="endsAt" errors={fe?.endsAt}>
            <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={toLocalInputValue(defaults?.endsAt)} />
          </Field>
          <Field label="Sonuçların açıklanması" htmlFor="resultsAt" errors={fe?.resultsAt} hint="Boşsa sonuçlar elle yayımlanır.">
            <Input id="resultsAt" name="resultsAt" type="datetime-local" defaultValue={toLocalInputValue(defaults?.resultsAt)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="shuffleQuestions" defaultChecked={defaults?.shuffleQuestions ?? true} className="h-4 w-4 rounded border-border" />
          Soruları her katılımcı için karıştır
        </label>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Katılımcılar</p>
          <Hint>Hiçbiri seçilmezse tüm aktif asistanlar katılabilir.</Hint>
          {residents.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Aktif asistan bulunmuyor.</p>
          ) : (
            <div className="mt-2 grid max-h-56 gap-1.5 overflow-y-auto rounded-xl border border-border p-3 sm:grid-cols-2">
              {residents.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="participants" value={r.id} defaultChecked={selected.has(r.id)} className="h-4 w-4 rounded border-border" />
                  <span className="truncate">
                    {r.name}
                    {r.residencyYear ? <span className="text-ink-muted"> · {r.residencyYear}. yıl</span> : null}
                  </span>
                </label>
              ))}
            </div>
          )}
          {fe?.participants && <p className="mt-1 text-sm text-red-600">{fe.participants[0]}</p>}
        </div>
        <div className="flex justify-end">
          <SubmitButton>{mode === "create" ? "Taslak oluştur" : "Ayarları kaydet"}</SubmitButton>
        </div>
      </fieldset>
    </form>
  );
}
