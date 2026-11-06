"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createSourceAction, type CreateSourceResult } from "@/lib/actions/sources";
import { Alert, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui";

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

export function SourceForm() {
  const [state, action] = useActionState<CreateSourceResult | null, FormData>(createSourceAction, null);
  const [type, setType] = useState<"PDF" | "TEXT">("PDF");
  const errors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4" noValidate>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && (
        <Alert tone={state.data && state.data.chunks > 0 ? "success" : "warning"} title="Kaynak kaydedildi">
          <p>{state.message}</p>
          {state.data && (
            <Link href={`/kaynaklar/${state.data.id}`} className="mt-1 inline-block font-medium underline">
              Kaynağı aç ve arama testini çalıştır
            </Link>
          )}
        </Alert>
      )}

      <Field label="Kaynak türü" htmlFor="type">
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as "PDF" | "TEXT")}>
          <option value="PDF">PDF dosyası</option>
          <option value="TEXT">Düz metin</option>
        </Select>
      </Field>

      {type === "PDF" ? (
        <Field label="PDF dosyası" htmlFor="file" errors={errors?.file} hint="En fazla 40 MB. Taranmış (görüntü) PDF'lerde metin çıkarılamaz; OCR'lı sürüm yükleyin.">
          <Input id="file" name="file" type="file" accept="application/pdf,.pdf" required />
        </Field>
      ) : (
        <Field label="Metin" htmlFor="rawText" errors={errors?.rawText} hint="Kılavuz özeti, ders notu veya makale metni (en az 50 karakter).">
          <Textarea id="rawText" name="rawText" rows={10} required />
        </Field>
      )}

      <Field label="Başlık" htmlFor="title" errors={errors?.title}>
        <Input id="title" name="title" required maxLength={300} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Yazarlar" htmlFor="authors" errors={errors?.authors}>
          <Input id="authors" name="authors" maxLength={500} placeholder="Soyad A, Soyad B" />
        </Field>
        <Field label="Yıl" htmlFor="year" errors={errors?.year}>
          <Input id="year" name="year" type="number" inputMode="numeric" min={1800} max={2100} />
        </Field>
      </div>

      <Field label="Atıf (zorunlu)" htmlFor="citation" errors={errors?.citation} hint="APA veya Vancouver biçiminde tam künye. Yapay zekâ yanıtlarındaki kaynak listesinde bu metin kullanılır.">
        <Textarea id="citation" name="citation" rows={2} required maxLength={1500} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="DOI" htmlFor="doi" errors={errors?.doi}>
          <Input id="doi" name="doi" maxLength={200} placeholder="10.1016/..." />
        </Field>
        <Field label="URL" htmlFor="url" errors={errors?.url}>
          <Input id="url" name="url" type="url" maxLength={1000} placeholder="https://" />
        </Field>
      </div>

      <Field label="Alt branş" htmlFor="subspecialty" errors={errors?.subspecialty}>
        <Select id="subspecialty" name="subspecialty" defaultValue="">
          {SUBSPECIALTIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Telif / kullanım izni açıklaması (zorunlu)"
        htmlFor="licenseNote"
        errors={errors?.licenseNote}
        hint="Örn. açık erişim (CC BY), kurum lisansı kapsamında, yazar izni alındı, kamu malı. Bu kaynak yalnızca kurum içi eğitim amacıyla kullanılır."
      >
        <Textarea id="licenseNote" name="licenseNote" rows={2} required maxLength={1000} />
      </Field>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">Kaydettikten sonra indeksleme hemen başlar; büyük PDF&apos;lerde birkaç saniye sürebilir.</p>
        <SubmitButton>Ekle ve indeksle</SubmitButton>
      </div>
    </form>
  );
}
