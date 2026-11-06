"use client";

import { useActionState } from "react";
import { testRetrieveAction, type SearchTestResult } from "@/lib/actions/sources";
import { Alert, Field, Input, SubmitButton, Badge } from "@/components/ui";

export function SearchTest({ sourceId }: { sourceId: string }) {
  const [state, action] = useActionState<SearchTestResult | null, FormData>(testRetrieveAction, null);
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
        <input type="hidden" name="id" value={sourceId} />
        <Field label="Sorgu" htmlFor="q" className="flex-1" hint="Bu kaynak içinde hibrit arama (tam metin + varsa embedding) çalıştırır.">
          <Input id="q" name="q" placeholder="Örn. primer açık açılı glokomda hedef göz içi basıncı" required minLength={2} maxLength={500} />
        </Field>
        <SubmitButton variant="secondary">Ara</SubmitButton>
      </form>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && state.data && (
        <div className="space-y-2">
          {state.data.note && <Alert tone="warning">{state.data.note}</Alert>}
          {state.data.hits.length === 0 ? (
            <p className="text-sm text-ink-muted">Eşleşen parça bulunamadı.</p>
          ) : (
            <ol className="space-y-2">
              {state.data.hits.map((h, i) => (
                <li key={h.chunkId} className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <Badge tone="brand">#{i + 1}</Badge>
                    {h.pageStart ? <span>s. {h.pageStart}{h.pageEnd && h.pageEnd !== h.pageStart ? `-${h.pageEnd}` : ""}</span> : null}
                    {h.section ? <span className="truncate">· {h.section}</span> : null}
                    <span>· skor {h.score.toFixed(4)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-ink">{h.content.length > 700 ? h.content.slice(0, 700) + "…" : h.content}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
