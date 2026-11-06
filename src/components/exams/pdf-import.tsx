"use client";

import { useActionState, useEffect, useState } from "react";
import { FileText, Sparkles, AlertTriangle } from "lucide-react";
import { parseExamPdfAction, createExamFromImportAction, type PdfParseOutput } from "@/lib/actions/exam-import";
import type { ParsedQuestion } from "@/lib/exams/pdf-questions";
import { Field, Input, Select, Textarea, SubmitButton, Alert, Badge, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { SUBSPECIALTY_LABELS, subspecialtyEnum } from "@/db/schema";
import { EXAM_TYPE_LABELS } from "@/lib/status-labels-exams";
import type { ActionResult } from "@/lib/action-result";

type EditableQ = ParsedQuestion & { include: boolean; explanation: string };

/**
 * İki adım: (1) PDF yükle ve ayrıştır (yapay zekâsız varsayılan, isteğe bağlı yapay zekâ);
 * (2) önizlemede soruları düzenle, doğru yanıtları işaretle, sınav bilgilerini gir ve oluştur.
 */
export function PdfImport({ aiEnabled }: { aiEnabled: boolean }) {
  const [parseState, parseAction, parsing] = useActionState<ActionResult<PdfParseOutput> | null, FormData>(parseExamPdfAction, null);
  const [createState, createAction] = useActionState<ActionResult | null, FormData>(createExamFromImportAction, null);
  const [qs, setQs] = useState<EditableQ[]>([]);
  const [meta, setMeta] = useState<PdfParseOutput | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"WEEKLY" | "MONTHLY">("WEEKLY");
  const [subspecialty, setSubspecialty] = useState("");
  const [duration, setDuration] = useState(10);

  useEffect(() => {
    if (!parseState?.ok || !parseState.data) return;
    const d = parseState.data;
    const t = setTimeout(() => {
      setMeta(d);
      setQs(d.questions.map((q) => ({ ...q, include: true, explanation: "" })));
      setTitle((cur) => cur || `Mini sınav: ${d.fileName.replace(/\.pdf$/i, "")}`);
      setDuration(Math.max(5, Math.min(120, d.questions.length * 1)));
    }, 0);
    return () => clearTimeout(t);
  }, [parseState]);

  const included = qs.filter((q) => q.include);
  const missing = included.filter((q) => !q.correctKey).length;
  const payload = JSON.stringify({
    title,
    type,
    subspecialty,
    durationMinutes: duration,
    sourceRef: meta ? `PDF: ${meta.fileName}` : "",
    questions: included.map((q) => ({ stem: q.stem, options: q.options, correctKey: q.correctKey ?? "", explanation: q.explanation })),
  });

  function update(i: number, patch: Partial<EditableQ>) {
    setQs((list) => list.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function updateOption(i: number, oi: number, text: string) {
    setQs((list) => list.map((q, idx) => (idx === i ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, text } : o)) } : q)));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. PDF yükle ve ayrıştır</CardTitle>
          <CardDescription>Dosya saklanmaz; yalnızca metni işlenir. &ldquo;1.&rdquo; / &ldquo;1)&rdquo; numaralı sorular ve A-E şıkları tanınır; &ldquo;Cevap: C&rdquo; satırları ve belge sonundaki cevap anahtarı okunur.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={parseAction} className="grid gap-3 sm:grid-cols-[1fr_auto]">
            {parseState && !parseState.ok && (
              <Alert tone="danger" className="sm:col-span-2">
                {parseState.error}
              </Alert>
            )}
            <Field label="Soru PDF'i" htmlFor="pdf-file" errors={parseState && !parseState.ok ? parseState.fieldErrors?.file : undefined}>
              <input
                id="pdf-file"
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                required
                className="block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700"
              />
            </Field>
            <Field label="Ayrıştırma" htmlFor="mode" hint={aiEnabled ? "Düzensiz biçimde yapay zekâyı deneyin." : "Yapay zekâ yapılandırılmamış."}>
              <Select id="mode" name="mode" defaultValue="auto">
                <option value="auto">Yapay zekâsız (varsayılan)</option>
                <option value="ai" disabled={!aiEnabled}>
                  Yapay zekâ ile
                </option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton disabled={parsing} loading={parsing}>
                <FileText className="h-4 w-4" /> Soruları çıkar
              </SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      {meta && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>2. Önizleme ve sınav bilgileri</CardTitle>
              <Badge tone="brand">{qs.length} soru</Badge>
              {meta.mode === "ai" ? <Badge tone="ai">Yapay zekâ ile ayrıştırıldı{meta.model ? ` · ${meta.model}` : ""}</Badge> : <Badge tone="neutral">Yapay zekâsız</Badge>}
              {meta.keyFound && <Badge tone="success">Cevap anahtarı bulundu</Badge>}
            </div>
            <CardDescription>
              {meta.fileName} · {Math.round(meta.chars / 1000)} bin karakter. Yanlış ayrışan soruları düzeltin ya da listeden çıkarın; doğru yanıtı olmayan sorular oluşturulamaz.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {meta.warnings.length > 0 && (
              <Alert tone="warning" title="Uyarılar">
                <ul className="list-disc pl-5">
                  {meta.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {qs.length > 0 && (
              <form action={createAction} className="space-y-5" noValidate>
                <input type="hidden" name="payload" value={payload} />
                {createState && !createState.ok && <Alert tone="danger">{createState.error}</Alert>}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Sınav başlığı" htmlFor="ex-title" className="lg:col-span-2">
                    <Input id="ex-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
                  </Field>
                  <Field label="Tür" htmlFor="ex-type">
                    <Select id="ex-type" value={type} onChange={(e) => setType(e.target.value as "WEEKLY" | "MONTHLY")}>
                      {(Object.keys(EXAM_TYPE_LABELS) as ("WEEKLY" | "MONTHLY")[]).map((t) => (
                        <option key={t} value={t}>
                          {EXAM_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Süre (dk)" htmlFor="ex-dur">
                    <Input id="ex-dur" type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 1)} />
                  </Field>
                  <Field label="Alt branş (tüm sorular)" htmlFor="ex-sub" className="lg:col-span-2">
                    <Select id="ex-sub" value={subspecialty} onChange={(e) => setSubspecialty(e.target.value)} required>
                      <option value="">Seçin</option>
                      {subspecialtyEnum.enumValues.map((s) => (
                        <option key={s} value={s}>
                          {SUBSPECIALTY_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <ol className="space-y-3">
                  {qs.map((q, i) => (
                    <li key={i} className={`rounded-2xl border p-3 ${q.include ? "border-border bg-surface" : "border-dashed border-border bg-surface-muted/50 opacity-70"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-ink">
                          <input type="checkbox" checked={q.include} onChange={(e) => update(i, { include: e.target.checked })} /> Soru {q.number}
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {q.warnings.map((w, wi) => (
                            <Badge key={wi} tone="warning">
                              <AlertTriangle className="h-3 w-3" /> {w}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Textarea value={q.stem} onChange={(e) => update(i, { stem: e.target.value })} rows={2} className="mt-2 min-h-16" aria-label={`Soru ${q.number} kökü`} />
                      <ul className="mt-2 space-y-1.5">
                        {q.options.map((o, oi) => (
                          <li key={o.key} className="flex items-center gap-2">
                            <input type="radio" name={`correct-${i}`} checked={q.correctKey === o.key} onChange={() => update(i, { correctKey: o.key })} aria-label={`Soru ${q.number} doğru yanıt ${o.key}`} />
                            <span className="w-5 text-sm font-semibold text-ink">{o.key}</span>
                            <Input value={o.text} onChange={(e) => updateOption(i, oi, e.target.value)} className="h-9 text-sm" aria-label={`Soru ${q.number} şık ${o.key}`} />
                          </li>
                        ))}
                      </ul>
                      <Input value={q.explanation} onChange={(e) => update(i, { explanation: e.target.value })} placeholder="Açıklama (isteğe bağlı; sonuç sayfasında gösterilir)" className="mt-2 h-9 text-sm" aria-label={`Soru ${q.number} açıklama`} />
                    </li>
                  ))}
                </ol>

                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton disabled={included.length === 0 || missing > 0 || !subspecialty}>
                    <Sparkles className="h-4 w-4" /> Mini sınav oluştur ({included.length} soru)
                  </SubmitButton>
                  {missing > 0 && <p className="text-sm text-amber-700">{missing} sorunun doğru yanıtı işaretlenmedi.</p>}
                  {!subspecialty && <p className="text-sm text-ink-muted">Alt branş seçin.</p>}
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
