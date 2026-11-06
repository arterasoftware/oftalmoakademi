"use client";

import { useActionState } from "react";
import { acceptInvitationAction } from "@/lib/actions/auth";
import { Field, Input, Select, SubmitButton, Alert } from "@/components/ui";
import type { UserRole } from "@/db/schema";

export function AcceptForm({ token, role, defaultName }: { token: string; role: UserRole; defaultName: string }) {
  const [state, action] = useActionState(acceptInvitationAction, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Ad Soyad" htmlFor="name" errors={fe?.name}>
        <Input id="name" name="name" defaultValue={defaultName} autoComplete="name" required />
      </Field>
      <Field label="Unvan (isteğe bağlı)" htmlFor="title" errors={fe?.title} hint="Örn. Arş. Gör. Dr., Dr. Öğr. Üyesi, Prof. Dr.">
        <Input id="title" name="title" />
      </Field>
      {role === "RESIDENT" && (
        <Field label="Asistanlık yılı" htmlFor="residencyYear" errors={fe?.residencyYear}>
          <Select id="residencyYear" name="residencyYear" defaultValue="1">
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                {y}. yıl
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Parola" htmlFor="password" errors={fe?.password} hint="En az 12 karakter. Parola yöneticisi kullanmanız önerilir.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
      </Field>
      <Field label="Parola (tekrar)" htmlFor="passwordConfirm" errors={fe?.passwordConfirm}>
        <Input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" required />
      </Field>
      <label className="flex items-start gap-2 text-sm text-ink-muted">
        <input type="checkbox" name="kvkk" className="mt-1" required />
        <span>
          Kişisel verilerimin KVKK kapsamında eğitim platformunun işletilmesi amacıyla işlenmesine ilişkin aydınlatma metnini okudum. Olgu
          paylaşımlarında hasta kimlik bilgisi paylaşmayacağımı kabul ediyorum.
        </span>
      </label>
      {fe?.kvkk && <p className="text-sm text-red-600">{fe.kvkk[0]}</p>}
      <SubmitButton className="w-full" size="lg">
        Hesabı oluştur
      </SubmitButton>
    </form>
  );
}
