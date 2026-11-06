"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions/auth";
import { Field, Input, SubmitButton, Alert } from "@/components/ui";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <Field label="E-posta" htmlFor="email" errors={state && !state.ok ? state.fieldErrors?.email : undefined}>
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus />
      </Field>
      <Field label="Parola" htmlFor="password" errors={state && !state.ok ? state.fieldErrors?.password : undefined}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg">
        Giriş yap
      </SubmitButton>
      <p className="text-center text-xs text-ink-muted">Hesabınız yok mu? Üyelik yalnızca yönetici davetiyle açılır.</p>
    </form>
  );
}
