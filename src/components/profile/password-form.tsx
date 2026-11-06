"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/lib/actions/auth";
import { Alert, Field, Input, SubmitButton } from "@/components/ui";

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-3" noValidate>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && <Alert tone="success">{state.message}</Alert>}
      <Field label="Mevcut parola" htmlFor="pw-current" errors={fe?.current}>
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Yeni parola" htmlFor="pw-next" errors={fe?.next} hint="En az 12 karakter.">
          <Input id="pw-next" name="next" type="password" autoComplete="new-password" required minLength={12} />
        </Field>
        <Field label="Yeni parola (tekrar)" htmlFor="pw-confirm" errors={fe?.nextConfirm}>
          <Input id="pw-confirm" name="nextConfirm" type="password" autoComplete="new-password" required minLength={12} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton variant="secondary">Parolayı güncelle</SubmitButton>
      </div>
    </form>
  );
}
