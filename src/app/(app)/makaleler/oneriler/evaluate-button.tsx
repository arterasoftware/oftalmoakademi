"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { evaluateCandidatesAction } from "@/lib/actions/articles";
import { SubmitButton, Alert } from "@/components/ui";

function Pending() {
  const { pending } = useFormStatus();
  return pending ? (
    <span className="text-xs text-ink-muted" role="status">
      Adaylar değerlendiriliyor… bir dakikaya kadar sürebilir.
    </span>
  ) : null;
}

export function EvaluateButton({ aiEnabled, unscored }: { aiEnabled: boolean; unscored: number }) {
  const [state, action] = useActionState(evaluateCandidatesAction, null);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton variant="secondary" disabled={!aiEnabled || unscored === 0} title={unscored === 0 ? "Puanlanmamış aday yok" : undefined}>
          ✦ Yapay zekâ ile değerlendir ve öner ({unscored})
        </SubmitButton>
        <Pending />
      </div>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && <Alert tone="success">{state.message}</Alert>}
    </form>
  );
}
