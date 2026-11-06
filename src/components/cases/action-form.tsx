"use client";

import * as React from "react";
import { useActionState, useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * Basit iş akışı formu: gizli alanlar + isteğe bağlı giriş alanları + gönder düğmesi.
 * Hata/success mesajını `ActionResult` üzerinden gösterir; sunucu `revalidatePath` ile sayfayı yeniler.
 */
export function ActionForm({
  action,
  hidden,
  children,
  submitLabel,
  variant = "primary",
  size = "md",
  className,
  confirm,
  onSuccess,
}: {
  action: FormAction;
  hidden: Record<string, string>;
  children?: React.ReactNode;
  submitLabel: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** Doluysa gönderimden önce onay istenir. */
  confirm?: string;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      onSuccess?.();
    }
  }, [state, onSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className ?? "space-y-3"}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {children}
      <SubmitButton variant={variant} size={size}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

export function fieldErrors(state: ActionResult | null, name: string): string[] | undefined {
  return state && !state.ok ? state.fieldErrors?.[name] : undefined;
}
