"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { transitionExamAction } from "@/lib/actions/exams";
import type { ActionResult } from "@/lib/action-result";
import { Alert, SubmitButton } from "@/components/ui";
import type { ExamStatus } from "@/lib/status-labels-exams";

type Action = "SUBMIT_REVIEW" | "BACK_TO_DRAFT" | "APPROVE" | "OPEN_NOW" | "CLOSE" | "PUBLISH_RESULTS";

const BUTTONS: { action: Action; label: string; variant: "primary" | "secondary" | "outline" | "danger"; from: ExamStatus[]; confirm?: string }[] = [
  { action: "SUBMIT_REVIEW", label: "İncelemeye gönder", variant: "primary", from: ["DRAFT"] },
  { action: "BACK_TO_DRAFT", label: "Taslağa döndür", variant: "outline", from: ["IN_REVIEW"] },
  { action: "APPROVE", label: "Onayla ve zamanla", variant: "primary", from: ["IN_REVIEW"], confirm: "Sınav onaylanacak, takvime eklenecek ve katılımcılara bildirim gidecek. Devam edilsin mi?" },
  { action: "OPEN_NOW", label: "Şimdi aç", variant: "secondary", from: ["IN_REVIEW", "APPROVED"], confirm: "Sınav hemen açılacak ve katılımcılar bilgilendirilecek. Devam edilsin mi?" },
  { action: "CLOSE", label: "Kapat", variant: "danger", from: ["OPEN"], confirm: "Sınav kapatılacak; gönderilmemiş denemeler mevcut yanıtlarıyla puanlanacak. Devam edilsin mi?" },
  { action: "PUBLISH_RESULTS", label: "Sonuçları yayımla", variant: "primary", from: ["CLOSED"], confirm: "Sonuçlar katılımcılara açılacak. Devam edilsin mi?" },
];

export function ExamWorkflow({ examId, status }: { examId: string; status: ExamStatus }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const r = await transitionExamAction(prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, null);
  const visible = BUTTONS.filter((b) => b.from.includes(status));
  return (
    <div className="space-y-3">
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && state.message && <Alert tone="success">{state.message}</Alert>}
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visible.map((b) => (
            <form
              key={b.action}
              action={formAction}
              onSubmit={(e) => {
                if (b.confirm && !window.confirm(b.confirm)) e.preventDefault();
              }}
            >
              <input type="hidden" name="examId" value={examId} />
              <input type="hidden" name="action" value={b.action} />
              <SubmitButton variant={b.variant} size="sm">
                {b.label}
              </SubmitButton>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
