"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { startAttemptAction } from "@/lib/actions/exams";
import type { ActionResult } from "@/lib/action-result";
import { Alert, SubmitButton } from "@/components/ui";

export function StartExamButton({ examId, label = "Başla" }: { examId: string; label?: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const r = await startAttemptAction(prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, null);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="examId" value={examId} />
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <SubmitButton size="lg" className="w-full sm:w-auto">
        {label}
      </SubmitButton>
    </form>
  );
}
