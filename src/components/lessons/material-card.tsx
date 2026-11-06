"use client";

import { useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon, Box, Video, Link2, Mic, ChevronDown, ChevronUp } from "lucide-react";
import { ModelViewer } from "./model-viewer";
import type { MaterialView } from "@/lib/queries/materials";
import { cn } from "@/lib/utils";

const ICONS = { PDF: FileText, IMAGE: ImageIcon, MODEL3D: Box, VIDEO: Video, LINK: Link2, AUDIO: Mic } as const;
const LABELS = { PDF: "PDF", IMAGE: "Görsel", MODEL3D: "3B model", VIDEO: "Video", LINK: "Bağlantı", AUDIO: "Ses kaydı" } as const;

function fmtSize(n: number | null) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

/** Ders materyali kartı: türüne göre satır içi görüntüleyici (aç/kapa). */
export function MaterialCard({ m, defaultOpen = false }: { m: MaterialView; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = ICONS[m.kind];
  const fileUrl = m.fileId ? `/api/dosya/${m.fileId}` : null;
  const canOpenInline = m.kind !== "LINK" && (fileUrl || m.embedUrl);

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{m.title}</p>
          <p className="text-xs text-ink-muted">
            {LABELS[m.kind]}
            {m.size ? ` · ${fmtSize(m.size)}` : ""}
            {m.originalName ? ` · ${m.originalName}` : ""}
          </p>
          {m.description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{m.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {(m.kind === "LINK" || (m.kind === "VIDEO" && m.url && !m.embedUrl)) && m.url && (
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-surface-muted">
              Aç <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {fileUrl && (
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-muted">
              Yeni sekme
            </a>
          )}
          {canOpenInline && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-ink hover:bg-surface-muted" aria-expanded={open}>
              {open ? "Kapat" : "Görüntüle"} {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {open && canOpenInline && (
        <div className={cn("border-t border-border p-2 sm:p-3")}>
          {m.kind === "PDF" && fileUrl && <iframe src={fileUrl} title={m.title} className="h-[70vh] w-full rounded-xl bg-white" />}
          {m.kind === "IMAGE" && fileUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt={m.title} className="mx-auto max-h-[75vh] w-auto rounded-xl" />
          )}
          {m.kind === "MODEL3D" && fileUrl && <ModelViewer src={fileUrl} alt={m.title} />}
          {m.kind === "VIDEO" && fileUrl && <video src={fileUrl} controls playsInline className="w-full rounded-xl bg-black" preload="metadata" />}
          {m.kind === "AUDIO" && fileUrl && <audio src={fileUrl} controls preload="metadata" className="w-full" />}
          {m.kind === "VIDEO" && !fileUrl && m.embedUrl && (
            <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
              <iframe src={m.embedUrl} title={m.title} className="h-full w-full" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
