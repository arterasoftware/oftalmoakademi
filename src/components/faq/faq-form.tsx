"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createFaqAction, updateFaqAction, type FaqFormResult } from "@/lib/actions/faq";
import { Alert, Field, Input, Select, SubmitButton, Textarea, buttonClasses } from "@/components/ui";

const SUBSPECIALTIES: { value: string; label: string }[] = [
  { value: "", label: "— Belirtilmedi —" },
  { value: "RETINA", label: "Retina" },
  { value: "KORNEA", label: "Kornea" },
  { value: "GLOKOM", label: "Glokom" },
  { value: "NOROOFTALMOLOJI", label: "Nörooftalmoloji" },
  { value: "PEDIATRIK", label: "Pediatrik Oftalmoloji" },
  { value: "UVEIT", label: "Üveit" },
  { value: "OKULOPLASTIK", label: "Oküloplastik Cerrahi" },
  { value: "KATARAKT", label: "Katarakt" },
  { value: "REFRAKSIYON", label: "Refraksiyon" },
  { value: "DIGER", label: "Diğer" },
];

export type FaqFormValues = {
  id?: string;
  question: string;
  answer: string;
  sourceId: string | null;
  sourceNote: string | null;
  subspecialty: string | null;
  published: boolean;
};

export function FaqForm({ initial, sources }: { initial?: FaqFormValues; sources: { id: string; title: string; approved: boolean }[] }) {
  const isEdit = Boolean(initial?.id);
  const [state, action] = useActionState<FaqFormResult | null, FormData>(isEdit ? updateFaqAction : createFaqAction, null);
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4" noValidate>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && (
        <Alert tone="success" title="Kaydedildi">
          <p>{state.message}</p>
          <Link href="/sss" className="mt-1 inline-block font-medium underline">
            Listeye dön
          </Link>
        </Alert>
      )}
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Soru" htmlFor="question" errors={errors?.question} hint="Asistanların sorduğu biçimde, tek cümle. Arama bu metin ve yanıt üzerinde çalışır.">
        <Input id="question" name="question" required maxLength={500} defaultValue={initial?.question ?? ""} />
      </Field>

      <Field label="Yanıt" htmlFor="answer" errors={errors?.answer} hint="Kısa ve net; madde işaretleri (-) ve **kalın** kullanılabilir. Yanıt, asistanda doğrudan bu hâliyle gösterilir.">
        <Textarea id="answer" name="answer" rows={8} required maxLength={8000} defaultValue={initial?.answer ?? ""} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dayandığı kaynak" htmlFor="sourceId" errors={errors?.sourceId} hint="İsteğe bağlı; yanıtın altında kaynak adı gösterilir.">
          <Select id="sourceId" name="sourceId" defaultValue={initial?.sourceId ?? ""}>
            <option value="">— Kaynak seçilmedi —</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {s.approved ? "" : " (onaysız)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sayfa / bölüm notu" htmlFor="sourceNote" errors={errors?.sourceNote}>
          <Input id="sourceNote" name="sourceNote" maxLength={200} placeholder="s. 12-13, Tablo 2" defaultValue={initial?.sourceNote ?? ""} />
        </Field>
      </div>

      <Field label="Alt branş" htmlFor="subspecialty" errors={errors?.subspecialty}>
        <Select id="subspecialty" name="subspecialty" defaultValue={initial?.subspecialty ?? ""}>
          {SUBSPECIALTIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>

      <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted p-3 text-sm">
        <input type="checkbox" name="published" defaultChecked={initial?.published ?? true} className="mt-0.5 h-4 w-4 rounded border-border" />
        <span>
          <span className="font-medium text-ink">Yayımla</span>
          <span className="mt-0.5 block text-xs text-ink-muted">Yayımlanan yanıtlar asistanlara SSS sayfasında ve asistan sohbetinde gösterilir. Taslaklar yalnızca öğretim üyeleri tarafından görülür.</span>
        </span>
      </label>

      <div className="flex items-center justify-end gap-2">
        <Link href="/sss" className={buttonClasses("ghost", "md")}>
          Vazgeç
        </Link>
        <SubmitButton>{isEdit ? "Güncelle" : "Kaydet"}</SubmitButton>
      </div>
    </form>
  );
}
