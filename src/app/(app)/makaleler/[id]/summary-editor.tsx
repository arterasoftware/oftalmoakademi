"use client";

import { useActionState, useState } from "react";
import { saveArticleSummaryAction } from "@/lib/actions/articles";
import { Alert, Button, Field, SubmitButton, Textarea } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import type { ArticleSummary } from "@/db/schema";

/**
 * Türkçe özeti elle yazma / YZ taslağını düzeltme formu (personel).
 * Yapay zekâ olmadan da makale yayımlanabilsin diye var; liste alanları satır satır girilir.
 */
export function SummaryEditor({ articleId, initial }: { articleId: string; initial: ArticleSummary | null }) {
  const [open, setOpen] = useState(!initial);
  const [state, action] = useActionState<ActionResult | null, FormData>(saveArticleSummaryAction, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  const joined = (xs?: string[]) => (xs ?? []).join("\n");

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">
          {initial?.source === "manual" ? "Özet öğretim üyesi tarafından yazıldı." : "Özet yapay zekâ taslağıdır; yayımlamadan önce düzeltebilirsiniz."}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Özeti düzenle
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-border bg-surface p-4" noValidate>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink">{initial ? "Türkçe özeti düzenle" : "Türkçe özeti elle yaz"}</h3>
          <p className="text-xs text-ink-muted">Liste alanlarında her satır bir madde. Kaydedince özet &quot;öğretim üyesi&quot; etiketiyle gösterilir.</p>
        </div>
        {initial && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Kapat
          </Button>
        )}
      </div>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && <Alert tone="success">{state.message}</Alert>}
      <input type="hidden" name="id" value={articleId} />

      <Field label="Yapılandırılmış özet (amaç, yöntem, bulgular, sonuç)" htmlFor="structuredSummaryTr" errors={errors?.structuredSummaryTr}>
        <Textarea id="structuredSummaryTr" name="structuredSummaryTr" rows={6} required maxLength={6000} defaultValue={initial?.structuredSummaryTr ?? ""} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Arka plan" htmlFor="background" errors={errors?.background}>
          <Textarea id="background" name="background" rows={4} maxLength={3000} defaultValue={initial?.background ?? ""} />
        </Field>
        <Field label="Yöntem" htmlFor="methods" errors={errors?.methods}>
          <Textarea id="methods" name="methods" rows={4} maxLength={3000} defaultValue={initial?.methods ?? ""} />
        </Field>
      </div>
      <Field label="Temel bulgular (her satır bir madde)" htmlFor="keyFindings" errors={errors?.keyFindings}>
        <Textarea id="keyFindings" name="keyFindings" rows={4} maxLength={3000} defaultValue={joined(initial?.keyFindings)} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Güçlü yönler" htmlFor="strengths" errors={errors?.strengths}>
          <Textarea id="strengths" name="strengths" rows={3} maxLength={2000} defaultValue={joined(initial?.strengths)} />
        </Field>
        <Field label="Zayıf yönler / sınırlılıklar" htmlFor="weaknesses" errors={errors?.weaknesses}>
          <Textarea id="weaknesses" name="weaknesses" rows={3} maxLength={2000} defaultValue={joined(initial?.weaknesses)} />
        </Field>
      </div>
      <Field label="Klinik çıkarımlar" htmlFor="clinicalImplications" errors={errors?.clinicalImplications}>
        <Textarea id="clinicalImplications" name="clinicalImplications" rows={3} maxLength={3000} defaultValue={initial?.clinicalImplications ?? ""} />
      </Field>
      <Field label="Tartışma soruları (her satır bir soru, en az 1)" htmlFor="discussionQuestions" errors={errors?.discussionQuestions}>
        <Textarea id="discussionQuestions" name="discussionQuestions" rows={4} required maxLength={3000} defaultValue={joined(initial?.discussionQuestions)} />
      </Field>
      <div className="flex justify-end">
        <SubmitButton>Özeti kaydet</SubmitButton>
      </div>
    </form>
  );
}
