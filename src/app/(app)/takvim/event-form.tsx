"use client";

import { useActionState } from "react";
import { addCalendarEventAction } from "@/lib/actions/calendar";
import { Field, Input, Textarea, SubmitButton, Alert } from "@/components/ui";

export function EventForm() {
  const [state, action] = useActionState(addCalendarEventAction, null);
  const errs = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-3" noValidate key={state?.ok ? "ok" : "form"}>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && <Alert tone="success">{state.message}</Alert>}
      <Field label="Başlık" htmlFor="ev-title" errors={errs?.title}>
        <Input id="ev-title" name="title" required maxLength={200} placeholder="Örn. Vaka toplantısı" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Başlangıç" htmlFor="ev-start" errors={errs?.startsAt}>
          <Input id="ev-start" name="startsAt" type="datetime-local" required />
        </Field>
        <Field label="Bitiş (isteğe bağlı)" htmlFor="ev-end" errors={errs?.endsAt}>
          <Input id="ev-end" name="endsAt" type="datetime-local" />
        </Field>
      </div>
      <Field label="Açıklama" htmlFor="ev-desc" errors={errs?.description}>
        <Textarea id="ev-desc" name="description" rows={3} maxLength={2000} className="min-h-20" />
      </Field>
      <SubmitButton size="sm">Etkinlik ekle</SubmitButton>
    </form>
  );
}
