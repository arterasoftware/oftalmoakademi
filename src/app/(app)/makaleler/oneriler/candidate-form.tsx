"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FileText, Search, X } from "lucide-react";
import { addArticleCandidateAction, lookupArticleDoiAction, uploadArticlePdfAction, type ArticlePdfUpload } from "@/lib/actions/articles";
import type { ArticleMeta } from "@/lib/articles/metadata";
import { Field, Input, Select, Textarea, SubmitButton, Alert, Button, Badge } from "@/components/ui";
import { SUBSPECIALTY_LABELS, subspecialtyEnum } from "@/db/schema";

type Values = { title: string; authors: string; journal: string; publishedOn: string; doi: string; pmid: string; url: string; abstract: string; subspecialty: string };
const EMPTY: Values = { title: "", authors: "", journal: "", publishedOn: "", doi: "", pmid: "", url: "", abstract: "", subspecialty: "" };

function fmtSize(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

/**
 * Aday makale formu: DOI → "Ara" ile künye otomatik dolar; PDF yüklenirse DOI dosyadan bulunur.
 * Künye alanları açılır bölümde durur ve düzenlenebilir; başlık ve alt branş her zaman görünür.
 */
export function CandidateForm() {
  const [state, action] = useActionState(addArticleCandidateAction, null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [pdf, setPdf] = useState<ArticlePdfUpload | null>(null);
  const [lookupMsg, setLookupMsg] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const errs = state && !state.ok ? state.fieldErrors : undefined;

  // Başarılı kayıt sonrası formu sıfırla
  useEffect(() => {
    if (!state?.ok) return;
    const t = setTimeout(() => {
      setValues(EMPTY);
      setPdf(null);
      setLookupMsg(null);
      setDetailsOpen(false);
      if (fileRef.current) fileRef.current.value = "";
    }, 0);
    return () => clearTimeout(t);
  }, [state]);

  function set<K extends keyof Values>(k: K, v: string) {
    setValues((s) => ({ ...s, [k]: v }));
  }

  function applyMeta(meta: ArticleMeta) {
    setValues((s) => ({
      ...s,
      doi: meta.doi,
      title: meta.title ?? s.title,
      authors: meta.authors ?? s.authors,
      journal: meta.journal ?? s.journal,
      publishedOn: meta.publishedOn ?? s.publishedOn,
      pmid: meta.pmid ?? s.pmid,
      url: meta.url ?? s.url,
      abstract: meta.abstract ?? s.abstract,
    }));
    const src = meta.sources.map((x) => (x === "crossref" ? "Crossref" : "PubMed")).join(" + ");
    const missing = [!meta.title && "başlık", !meta.abstract && "özet"].filter(Boolean) as string[];
    setLookupMsg({
      tone: "success",
      text: `Künye ${src} üzerinden getirildi.${missing.length ? ` Bulunamayan: ${missing.join(", ")} (elle tamamlayın).` : ""}`,
    });
  }

  function lookup() {
    const doi = values.doi.trim();
    if (!doi) {
      setLookupMsg({ tone: "danger", text: "Önce DOI girin." });
      return;
    }
    setLookupMsg({ tone: "info", text: "Crossref ve PubMed sorgulanıyor…" });
    startTransition(async () => {
      const r = await lookupArticleDoiAction(doi);
      if (r.ok && r.data) applyMeta(r.data);
      else {
        setLookupMsg({ tone: "danger", text: r.ok ? "Künye bulunamadı." : r.error });
        setDetailsOpen(true);
      }
    });
  }

  function onPdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLookupMsg({ tone: "info", text: `"${file.name}" yükleniyor ve DOI aranıyor…` });
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const r = await uploadArticlePdfAction(fd);
      if (!r.ok || !r.data) {
        setLookupMsg({ tone: "danger", text: r.ok ? "PDF yüklenemedi." : r.error });
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      setPdf(r.data);
      if (r.data.meta) applyMeta(r.data.meta);
      else if (r.data.doi) {
        setValues((s) => ({ ...s, doi: r.data!.doi! }));
        setLookupMsg({ tone: "danger", text: `PDF yüklendi; DOI bulundu (${r.data.doi}) ama künye getirilemedi. Yeniden "Ara" deneyin veya elle girin.` });
        setDetailsOpen(true);
      } else {
        setLookupMsg({ tone: "info", text: "PDF yüklendi; dosyada DOI bulunamadı. DOI'yi girip Ara deyin ya da künyeyi elle doldurun." });
        setDetailsOpen(true);
      }
    });
  }

  function clearPdf() {
    setPdf(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && <Alert tone="success">{state.message}</Alert>}
      {pdf && <input type="hidden" name="pdfFileId" value={pdf.fileId} />}

      <Field label="DOI" htmlFor="doi" errors={errs?.doi} hint="Örn. 10.1016/j.ophtha.2024.01.001 veya https://doi.org/… — Ara deyince künye otomatik gelir.">
        <div className="flex gap-2">
          <Input
            id="doi"
            name="doi"
            value={values.doi}
            onChange={(e) => set("doi", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                lookup();
              }
            }}
            placeholder="10.xxxx/…"
            className="flex-1"
          />
          <Button type="button" variant="secondary" onClick={lookup} disabled={busy} loading={busy}>
            <Search className="h-4 w-4" /> Ara
          </Button>
        </div>
      </Field>

      <Field label="Tam metin PDF (isteğe bağlı)" htmlFor="pdf" errors={errs?.pdfFileId} hint="Yüklenince DOI dosyadan bulunur ve künye getirilir. En fazla 40 MB; yalnızca erişim/telif izni olan içerik.">
        {pdf ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-sm">
            <FileText className="h-4 w-4 text-brand-700" aria-hidden />
            <span className="min-w-0 truncate font-medium text-ink">{pdf.name}</span>
            <span className="text-ink-muted">{fmtSize(pdf.size)}</span>
            {pdf.doi && <Badge tone="brand">DOI bulundu</Badge>}
            <button type="button" onClick={clearPdf} className="ml-auto rounded-lg p-1 text-ink-muted hover:bg-surface hover:text-red-700" aria-label="PDF'i kaldır">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <input
            ref={fileRef}
            id="pdf"
            type="file"
            accept="application/pdf,.pdf"
            onChange={onPdfChange}
            disabled={busy}
            className="block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700"
          />
        )}
      </Field>

      {lookupMsg && (
        <Alert tone={lookupMsg.tone}>
          {lookupMsg.text}
        </Alert>
      )}

      <Field label="Başlık" htmlFor="title" errors={errs?.title}>
        <Input id="title" name="title" required maxLength={400} value={values.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Alt branş" htmlFor="subspecialty" errors={errs?.subspecialty}>
        <Select id="subspecialty" name="subspecialty" value={values.subspecialty} onChange={(e) => set("subspecialty", e.target.value)}>
          <option value="">Belirtilmedi</option>
          {subspecialtyEnum.enumValues.map((s) => (
            <option key={s} value={s}>
              {SUBSPECIALTY_LABELS[s]}
            </option>
          ))}
        </Select>
      </Field>

      <details open={detailsOpen} onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)} className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Künye ayrıntıları{" "}
          <span className="font-normal text-ink-muted">
            {values.authors || values.journal ? `· ${[values.authors && "yazarlar", values.journal && "dergi", values.publishedOn && "tarih", values.abstract && "özet"].filter(Boolean).join(", ")} dolu` : "· otomatik doldurulur, gerekirse düzenleyin"}
          </span>
        </summary>
        <div className="mt-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Yazarlar" htmlFor="authors" errors={errs?.authors}>
              <Input id="authors" name="authors" value={values.authors} onChange={(e) => set("authors", e.target.value)} placeholder="Soyad A, Soyad B, …" />
            </Field>
            <Field label="Dergi" htmlFor="journal" errors={errs?.journal}>
              <Input id="journal" name="journal" value={values.journal} onChange={(e) => set("journal", e.target.value)} />
            </Field>
            <Field label="Yayın tarihi" htmlFor="publishedOn" errors={errs?.publishedOn} hint="Örn. 2026 Mar">
              <Input id="publishedOn" name="publishedOn" maxLength={40} value={values.publishedOn} onChange={(e) => set("publishedOn", e.target.value)} />
            </Field>
            <Field label="PMID" htmlFor="pmid" errors={errs?.pmid}>
              <Input id="pmid" name="pmid" inputMode="numeric" value={values.pmid} onChange={(e) => set("pmid", e.target.value)} />
            </Field>
          </div>
          <Field label="Bağlantı (URL)" htmlFor="url" errors={errs?.url}>
            <Input id="url" name="url" type="url" value={values.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Özet (abstract)" htmlFor="abstract" errors={errs?.abstract} hint="Yapay zekâ değerlendirmesi yalnızca bu özet üzerinden yapılır.">
            <Textarea id="abstract" name="abstract" rows={6} maxLength={10000} value={values.abstract} onChange={(e) => set("abstract", e.target.value)} />
          </Field>
        </div>
      </details>

      <SubmitButton disabled={busy}>Aday olarak ekle</SubmitButton>
    </form>
  );
}
