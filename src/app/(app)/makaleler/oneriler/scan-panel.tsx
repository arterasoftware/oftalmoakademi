"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Radar, Settings2 } from "lucide-react";
import { runScanNowAction, saveScanSettingsAction } from "@/lib/actions/article-scan";
import type { ArticleScanSettings } from "@/lib/articles/pubmed";
import { Alert, Badge, Field, Input, SubmitButton, Textarea } from "@/components/ui";
import { SUBSPECIALTY_LABELS, subspecialtyEnum } from "@/db/schema";
import { formatDateTime } from "@/lib/utils";

function ScanPending() {
  const { pending } = useFormStatus();
  return pending ? (
    <span className="text-xs text-ink-muted" role="status">
      PubMed taranıyor… alt dal başına bir istek, 10-30 sn sürebilir.
    </span>
  ) : null;
}

/**
 * Otomatik PubMed taraması: durum, "Şimdi tara" (personel) ve ayarlar (yalnızca yönetici).
 * Tarama yapay zekâ kullanmaz; adaylar yayın türü + dergi + özet ile puanlanır.
 */
export function ScanPanel({ settings, nextRun, isAdmin }: { settings: ArticleScanSettings; nextRun: string | null; isAdmin: boolean }) {
  const [runState, runAction] = useActionState(runScanNowAction, null);
  const [setState, setAction] = useActionState(saveScanSettingsAction, null);
  const last = settings.lastResult;
  const fe = setState && !setState.ok ? setState.fieldErrors : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={settings.enabled ? "success" : "neutral"}>{settings.enabled ? `Otomatik: ${settings.intervalDays} günde bir` : "Otomatik tarama kapalı"}</Badge>
        <span className="text-ink-muted">
          Son tarama: {settings.lastRunAt ? formatDateTime(new Date(settings.lastRunAt)) : "henüz yok"}
          {last ? ` · ${last.added} yeni aday${last.trigger === "schedule" ? " (planlı)" : ""}` : ""}
          {nextRun && settings.enabled ? ` · Sıradaki: ${formatDateTime(new Date(nextRun))}` : ""}
        </span>
      </div>
      {last && last.failedQueries.length > 0 && <Alert tone="warning">Son taramada ulaşılamayan aramalar: {last.failedQueries.join(", ")}.</Alert>}

      <form action={runAction} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton variant="secondary" size="sm">
            <Radar className="h-4 w-4" /> Şimdi tara
          </SubmitButton>
          <ScanPending />
        </div>
        {runState && !runState.ok && <Alert tone="danger">{runState.error}</Alert>}
        {runState && runState.ok && <Alert tone="success">{runState.message}</Alert>}
      </form>
      <p className="text-xs text-ink-muted">
        Son {settings.lookbackDays} günde PubMed&apos;e eklenen{settings.highEvidenceOnly ? " RKÇ, meta-analiz, sistematik derleme ve kılavuzlar" : " klinik çalışmalar"} taranır; her alt dal için
        kuyrukta en fazla {settings.perQuery} bekleyen tarama adayı tutulur (seçtikçe veya reddettikçe yenisi gelir) ve öğretim üyelerine bildirim gider. Puan yapay
        zekâsızdır (yayın türü, dergi, özet).
      </p>

      {isAdmin && (
        <details className="rounded-xl border border-border p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
            <Settings2 className="h-4 w-4" /> Tarama ayarları (yönetici)
          </summary>
          <form action={setAction} className="mt-3 space-y-3" noValidate>
            {setState && !setState.ok && <Alert tone="danger">{setState.error}</Alert>}
            {setState && setState.ok && <Alert tone="success">{setState.message}</Alert>}
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Otomatik tarama açık
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="highEvidenceOnly" defaultChecked={settings.highEvidenceOnly} /> Yalnızca yüksek kanıt düzeyi
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Aralık (gün)" htmlFor="intervalDays" errors={fe?.intervalDays}>
                <Input id="intervalDays" name="intervalDays" type="number" min={1} max={60} defaultValue={settings.intervalDays} />
              </Field>
              <Field label="Geriye bakış (gün)" htmlFor="lookbackDays" errors={fe?.lookbackDays}>
                <Input id="lookbackDays" name="lookbackDays" type="number" min={7} max={180} defaultValue={settings.lookbackDays} />
              </Field>
              <Field label="Alt dal başına bekleyen aday sınırı" htmlFor="perQuery" errors={fe?.perQuery}>
                <Input id="perQuery" name="perQuery" type="number" min={1} max={10} defaultValue={settings.perQuery} />
              </Field>
            </div>
            <p className="text-xs text-ink-muted">PubMed sorgu sözdizimi (ör. glaucoma[tiab] OR &quot;intraocular pressure&quot;[tiab]). Boş bırakılan alt dal taranmaz.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {subspecialtyEnum.enumValues.map((sub) => (
                <Field key={sub} label={SUBSPECIALTY_LABELS[sub]} htmlFor={`q_${sub}`}>
                  <Textarea id={`q_${sub}`} name={`q_${sub}`} rows={2} maxLength={1000} defaultValue={settings.queries[sub] ?? ""} className="min-h-14 font-mono text-[12px]" />
                </Field>
              ))}
            </div>
            <SubmitButton size="sm">Ayarları kaydet</SubmitButton>
          </form>
        </details>
      )}
    </div>
  );
}
