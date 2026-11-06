"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { articleWorkflowAction } from "@/lib/actions/articles";
import { SubmitButton, Alert } from "@/components/ui";
import type { Article } from "@/db/schema";

function PendingNote({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return pending ? (
    <span className="text-xs text-ink-muted" role="status">
      {text}
    </span>
  ) : null;
}

/**
 * Personel için makale akış düğmeleri. `compact` liste satırlarında (Seç / Reddet),
 * tam sürüm detay sayfasında (özet üret / yayımla / reddet).
 */
export function ArticleWorkflow({
  articleId,
  status,
  hasAbstract,
  hasSummary = true,
  aiEnabled,
  compact,
}: {
  articleId: string;
  status: Article["status"];
  hasAbstract: boolean;
  /** Türkçe özet var mı? Yoksa yayımlamadan önce onay istenir. */
  hasSummary?: boolean;
  aiEnabled: boolean;
  compact?: boolean;
}) {
  const [state, action] = useActionState(articleWorkflowAction, null);
  return (
    <div className={compact ? "" : "rounded-2xl border border-border bg-surface-muted p-4"}>
      {state && !state.ok && (
        <Alert tone="danger" className="mb-2">
          {state.error}
        </Alert>
      )}
      {state && state.ok && state.message && !compact && (
        <Alert tone="success" className="mb-2">
          {state.message}
        </Alert>
      )}
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={articleId} />
        {status === "SUGGESTED" && (
          <SubmitButton size="sm" name="op" value="select">
            Seç
          </SubmitButton>
        )}
        {!compact && (status === "SELECTED" || status === "PUBLISHED") && (
          <SubmitButton
            size="sm"
            variant="secondary"
            name="op"
            value="summarize"
            disabled={!aiEnabled || !hasAbstract}
            title={!hasAbstract ? "Önce özet (abstract) gerekir" : !aiEnabled ? "Yapay zekâ yapılandırılmamış; özeti aşağıdaki formla elle yazın" : undefined}
          >
            ✦ Türkçe özet ve tartışma soruları üret (YZ)
          </SubmitButton>
        )}
        {!compact && status === "SELECTED" && (
          <SubmitButton
            size="sm"
            name="op"
            value="publish"
            onClick={(e) => {
              if (!hasSummary && !window.confirm("Bu makalenin Türkçe özeti ve tartışma soruları yok. Asistanlar yalnızca künye ve özgün özeti görür. Yine de yayımlansın mı?")) e.preventDefault();
            }}
          >
            Yayımla
          </SubmitButton>
        )}
        {(status === "SUGGESTED" || status === "SELECTED") && (
          <SubmitButton size="sm" variant="outline" name="op" value="reject">
            Reddet
          </SubmitButton>
        )}
        {!compact && <PendingNote text="İşleniyor… Yapay zekâ üretimi bir dakikaya kadar sürebilir." />}
      </form>
    </div>
  );
}
