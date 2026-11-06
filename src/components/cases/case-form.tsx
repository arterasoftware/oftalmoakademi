"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createCaseAction, updateCaseAction } from "@/lib/actions/cases";
import { Field, Input, Select, Textarea, SubmitButton, Alert } from "@/components/ui";
import { AudioRecorder, fmtDur } from "@/components/audio/audio-recorder";
import { SUBSPECIALTY_LABELS, subspecialtyEnum, type Subspecialty } from "@/db/schema";
import { MAX_CASE_IMAGES, CASE_AUDIO_MAX_SEC } from "@/lib/status-labels-cases";
import type { ActionResult } from "@/lib/action-result";

export type CaseFormInitial = {
  title: string;
  subspecialty: Subspecialty;
  body: string;
  audio: { fileId: string; durationSec: number | null } | null;
  imageCount: number;
};

/**
 * Tek adımlı olgu formu: başlık + alt dal + olgu metni, görseller (birden çok), ses kaydı, kimliksizleştirme onayı.
 * Oluşturma doğrudan paylaşır ve olgu sayfasına yönlendirir; düzenleme yerinde kaydeder.
 */
export function CaseForm({ mode, caseId, initial }: { mode: "create" | "edit"; caseId?: string; initial?: CaseFormInitial }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(mode === "create" ? createCaseAction : updateCaseAction, null);
  const [previews, setPreviews] = useState<{ name: string; url: string }[]>([]);
  const [resetToken, setResetToken] = useState(0);
  const uid = useId();
  const errs = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);
  useEffect(() => {
    if (!state?.ok) return;
    const t = setTimeout(() => {
      setPreviews([]);
      setResetToken((n) => n + 1);
    }, 0);
    return () => clearTimeout(t);
  }, [state]);

  function onImagesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setPreviews(files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })));
  }

  const remaining = MAX_CASE_IMAGES - (initial?.imageCount ?? 0);

  return (
    <form action={action} className="space-y-5" noValidate>
      {caseId && <input type="hidden" name="id" value={caseId} />}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <Field label="Başlık" htmlFor={`${uid}-title`} errors={errs?.title} hint="Örn. “Tek taraflı ani ağrısız görme azalması”">
        <Input id={`${uid}-title`} name="title" required minLength={5} maxLength={200} defaultValue={initial?.title ?? ""} />
      </Field>
      <Field label="Alt dal" htmlFor={`${uid}-sub`} errors={errs?.subspecialty}>
        <Select id={`${uid}-sub`} name="subspecialty" required defaultValue={initial?.subspecialty ?? ""}>
          <option value="" disabled>
            Seçin
          </option>
          {subspecialtyEnum.enumValues.map((s) => (
            <option key={s} value={s}>
              {SUBSPECIALTY_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Olgu metni" htmlFor={`${uid}-body`} errors={errs?.body} hint="Öykü, bulgular ve tartışmak istediğiniz soru(lar). Hasta kimliğini ortaya çıkarabilecek hiçbir bilgi (ad, tarih, protokol no, kurum) yazmayın; kesin yaş yerine yaş aralığı kullanın.">
        <Textarea id={`${uid}-body`} name="body" required minLength={20} maxLength={20000} rows={12} defaultValue={initial?.body ?? ""} placeholder="60-69 yaş erkek hasta, sağ gözde 3 gündür ani ağrısız görme azalması…" />
      </Field>

      <Field label={mode === "edit" ? "Görsel ekle" : "Görseller"} htmlFor={`${uid}-images`} errors={errs?.images} hint={`Birden çok görsel seçebilirsiniz (fundus, OCT, ön segment…). JPEG, PNG, WebP, HEIC; en fazla ${MAX_CASE_IMAGES} görsel, her biri 15 MB. Üst veri (EXIF) sunucuda silinir.`}>
        <input
          id={`${uid}-images`}
          name="images"
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          disabled={remaining <= 0}
          onChange={onImagesChange}
          className="block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 disabled:opacity-60"
        />
        {remaining <= 0 && <p className="mt-1 text-xs text-ink-muted">Görsel sınırına ulaşıldı; eklemek için mevcut görsellerden silin.</p>}
        {previews.length > 0 && (
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((p) => (
              <li key={p.url} className="overflow-hidden rounded-lg border border-border bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name} className="aspect-[4/3] w-full object-cover" />
                <p className="truncate px-1.5 py-1 text-[11px] text-ink-muted">{p.name}</p>
              </li>
            ))}
          </ul>
        )}
      </Field>

      <div className="space-y-2 rounded-xl border border-border p-3">
        <p className="text-sm font-medium text-ink">Ses kaydı (isteğe bağlı)</p>
        {initial?.audio && (
          <div className="space-y-1.5 rounded-lg bg-surface-muted p-2">
            <p className="text-xs text-ink-muted">Mevcut kayıt{initial.audio.durationSec !== null ? ` · ${fmtDur(initial.audio.durationSec)}` : ""}. Yeni kayıt gönderirseniz bunun yerine geçer.</p>
            <audio controls preload="metadata" src={`/api/dosya/${initial.audio.fileId}`} className="w-full" />
            <label className="flex items-center gap-2 text-xs text-ink">
              <input type="checkbox" name="removeAudio" /> Mevcut kaydı kaldır
            </label>
          </div>
        )}
        <p className="text-xs text-ink-muted">Anamnez özeti veya muayene anlatımı; tek kayıt, en fazla 10 dakika / 25 MB.</p>
        <AudioRecorder name="audio" durationName="audioDurationSec" maxSec={CASE_AUDIO_MAX_SEC} resetToken={resetToken} inputId={`${uid}-audio`} fileErrors={errs?.audio} compact />
      </div>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="deidentified" className="mt-1" required defaultChecked={mode === "edit"} /> Metin, görseller ve ses kaydında hasta kimliğini ortaya çıkarabilecek bilgi bulunmadığını ve paylaşım için gerekli izinlerin alındığını onaylıyorum.
      </label>
      {errs?.deidentified && <p className="text-sm text-red-600">{errs.deidentified[0]}</p>}

      <SubmitButton>
        {mode === "create" ? (
          <>
            <ImagePlus className="h-4 w-4" /> Olguyu paylaş
          </>
        ) : (
          "Değişiklikleri kaydet"
        )}
      </SubmitButton>
      {mode === "create" && <p className="text-xs text-ink-muted">Paylaşınca olgu hemen tartışmaya açılır; sonradan düzenleyebilir veya silebilirsiniz.</p>}
      <span className="hidden">
        <X className="h-3 w-3" />
      </span>
    </form>
  );
}
