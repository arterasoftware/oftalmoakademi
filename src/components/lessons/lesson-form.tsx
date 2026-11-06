"use client";

import { useActionState } from "react";
import { createLessonAction, updateLessonAction } from "@/lib/actions/lessons";
import { Field, Input, Select, Textarea, SubmitButton, Alert } from "@/components/ui";
import { SUBSPECIALTY_LABELS, subspecialtyEnum, type Subspecialty } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";

export type LessonFormInitial = { title: string; subspecialty: Subspecialty; description: string; scheduledFor: string; notes: string };

/**
 * Ders bilgileri (+ düzenlemede ders notu). Oluşturma taslak açar ve düzenleme sayfasına yönlendirir;
 * materyaller düzenleme sayfasında eklenir.
 */
export function LessonForm({ mode, lessonId, initial, notesSlot }: { mode: "create" | "edit"; lessonId?: string; initial?: LessonFormInitial; notesSlot?: React.ReactNode }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(mode === "create" ? createLessonAction : updateLessonAction, null);
  const errs = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4" noValidate>
      {lessonId && <input type="hidden" name="id" value={lessonId} />}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      <Field label="Başlık" htmlFor="title" errors={errs?.title}>
        <Input id="title" name="title" required maxLength={200} defaultValue={initial?.title ?? ""} placeholder="Örn. Diyabetik maküla ödemi: tanı ve tedavi" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Alt branş" htmlFor="subspecialty" errors={errs?.subspecialty}>
          <Select id="subspecialty" name="subspecialty" required defaultValue={initial?.subspecialty ?? ""}>
            <option value="" disabled>
              Seçin
            </option>
            {subspecialtyEnum.enumValues.map((s) => (
              <option key={s} value={s}>
                {SUBSPECIALTY_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Planlanan tarih (isteğe bağlı)" htmlFor="scheduledFor" errors={errs?.scheduledFor} hint="Takvimde bu tarihte görünür.">
          <Input id="scheduledFor" name="scheduledFor" type="datetime-local" defaultValue={initial?.scheduledFor ?? ""} />
        </Field>
      </div>
      <Field label="Kısa açıklama (isteğe bağlı)" htmlFor="description" errors={errs?.description} hint="Asistan bu derste ne öğrenecek? 1-3 cümle.">
        <Textarea id="description" name="description" rows={2} maxLength={2000} defaultValue={initial?.description ?? ""} />
      </Field>
      {mode === "edit" && notesSlot}
      <SubmitButton>{mode === "create" ? "Dersi oluştur ve materyal ekle" : "Kaydet"}</SubmitButton>
    </form>
  );
}
