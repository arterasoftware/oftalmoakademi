"use client";

import { useActionState, useState } from "react";
import { createInvitationAction, type InviteResult } from "@/lib/actions/admin";
import { Alert, Button, Field, Input, Select, SubmitButton } from "@/components/ui";

export function InviteForm() {
  const [state, action] = useActionState<InviteResult | null, FormData>(createInvitationAction, null);
  const [copied, setCopied] = useState(false);
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      {state && state.ok && state.data && (
        <Alert tone="success" title={`Davet oluşturuldu: ${state.data.email}`}>
          <p className="text-xs">
            E-posta gönderimi bu sürümde yapılandırılmadığı için bağlantıyı kullanıcıya güvenli bir kanaldan siz iletmelisiniz. Bağlantı yalnızca şimdi gösterilir ve 7 gün geçerlidir.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="block flex-1 overflow-x-auto rounded-lg bg-surface px-2 py-1.5 text-xs text-ink">{state.data.link}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => copy(state.data!.link)}>
              {copied ? "Kopyalandı" : "Kopyala"}
            </Button>
          </div>
        </Alert>
      )}
      <form action={action} className="grid gap-4 sm:grid-cols-3" noValidate>
        {state && !state.ok && (
          <div className="sm:col-span-3">
            <Alert tone="danger">{state.error}</Alert>
          </div>
        )}
        <Field label="E-posta" htmlFor="inv-email" errors={errors?.email}>
          <Input id="inv-email" name="email" type="email" required inputMode="email" autoComplete="off" />
        </Field>
        <Field label="Ad Soyad (isteğe bağlı)" htmlFor="inv-name" errors={errors?.name}>
          <Input id="inv-name" name="name" maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Rol" htmlFor="inv-role" errors={errors?.role}>
          <Select id="inv-role" name="role" defaultValue="RESIDENT">
            <option value="RESIDENT">Asistan Hekim</option>
            <option value="FACULTY">Öğretim Üyesi</option>
            <option value="ADMIN">Yönetici</option>
          </Select>
        </Field>
        <div className="sm:col-span-3">
          <SubmitButton>Davet oluştur</SubmitButton>
        </div>
      </form>
    </div>
  );
}
