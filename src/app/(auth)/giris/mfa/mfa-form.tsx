"use client";

import { useActionState } from "react";
import { mfaVerifyAction, logoutAction } from "@/lib/actions/auth";
import { Field, Input, SubmitButton, Alert, Button } from "@/components/ui";

export function MfaForm() {
  const [state, action] = useActionState(mfaVerifyAction, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Doğrulama kodu" htmlFor="code">
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required className="text-center text-lg tracking-widest" />
      </Field>
      <SubmitButton className="w-full" size="lg">
        Doğrula
      </SubmitButton>
      <Button type="submit" variant="ghost" className="w-full" formAction={logoutAction} formNoValidate>
        Vazgeç ve çıkış yap
      </Button>
    </form>
  );
}
