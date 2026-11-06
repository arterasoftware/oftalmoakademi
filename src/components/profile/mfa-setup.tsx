"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmMfaSetupAction, disableMfaAction } from "@/lib/actions/auth";
import { startMfaSetupAction } from "@/lib/actions/profile";
import type { ActionResult } from "@/lib/action-result";
import { Alert, Button, Field, Input, SubmitButton } from "@/components/ui";

type Setup = { qrDataUrl: string; base32: string; secretEnc: string };

/** MFA kapalıyken: kurulum sihirbazı (QR -> kod -> kurtarma kodları). */
export function MfaSetup() {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, startTransition] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);
  const [state, action] = useActionState<ActionResult<{ recoveryCodes: string[] }> | null, FormData>(confirmMfaSetupAction, null);

  if (state?.ok && state.data) {
    return (
      <div className="space-y-3">
        <Alert tone="success" title="İki adımlı doğrulama etkinleştirildi.">
          Aşağıdaki kurtarma kodlarını güvenli bir yere kaydedin. Her kod bir kez kullanılabilir ve bu ekran bir daha gösterilmez.
        </Alert>
        <ul className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-muted p-3 font-mono text-sm text-ink sm:grid-cols-4">
          {state.data.recoveryCodes.map((c) => (
            <li key={c} className="select-all">
              {c}
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="h-4 w-4 rounded border-border" />
          Kurtarma kodlarını kaydettim.
        </label>
        <Button type="button" disabled={!acknowledged} onClick={() => router.refresh()}>
          Tamam
        </Button>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">Hesabınızı bir doğrulama uygulamasıyla (Google Authenticator, Microsoft Authenticator, 1Password vb.) koruyun.</p>
        {startError && <Alert tone="danger">{startError}</Alert>}
        <Button
          type="button"
          variant="secondary"
          loading={starting}
          onClick={() =>
            startTransition(async () => {
              const r = await startMfaSetupAction();
              if (!r.ok) setStartError(r.error);
              else if (r.data) {
                setStartError(null);
                setSetup(r.data);
              }
            })
          }
        >
          İki adımlı doğrulamayı etkinleştir
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="secretEnc" value={setup.secretEnc} />
      <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
        <li>Doğrulama uygulamanızda QR kodu tarayın veya anahtarı elle girin.</li>
        <li>Uygulamanın gösterdiği 6 haneli kodu aşağıya yazın.</li>
      </ol>
      <div className="flex flex-col items-start gap-4 sm:flex-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qrDataUrl} alt="MFA kurulum QR kodu" width={220} height={220} className="rounded-xl border border-border bg-white p-2" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Elle giriş anahtarı</p>
            <code className="mt-1 block break-all rounded-lg bg-surface-muted px-3 py-2 font-mono text-sm text-ink select-all">{setup.base32}</code>
          </div>
          {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
          <Field label="Doğrulama kodu" htmlFor="mfa-code">
            <Input id="mfa-code" name="code" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={6} required autoFocus />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton>Etkinleştir</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
              Vazgeç
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

/** MFA açıkken: parola ile kapatma. */
export function MfaDisableForm() {
  const router = useRouter();
  const [state, action] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const r = await disableMfaAction(prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, null);
  return (
    <form
      action={action}
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        if (!window.confirm("İki adımlı doğrulama kapatılacak; hesabınız yalnızca parola ile korunacak. Devam edilsin mi?")) e.preventDefault();
      }}
    >
      <Alert tone="success">İki adımlı doğrulama etkin.</Alert>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <Field label="Kapatmak için parolanızı girin" htmlFor="mfa-disable-pw">
        <Input id="mfa-disable-pw" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="outline">İki adımlı doğrulamayı kapat</SubmitButton>
      </div>
    </form>
  );
}
