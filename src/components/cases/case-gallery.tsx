"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { CaseImageDto } from "@/lib/queries/cases";

/** Olgu görsel galerisi + basit ışık kutusu (lightbox). Görseller yalnızca yetkili /api/dosya/[id] ucundan sunulur. */
export function CaseGallery({ images }: { images: CaseImageDto[] }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? null : (i + 1) % images.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? null : (i - 1 + images.length) % images.length));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, images.length]);

  if (images.length === 0) return <p className="text-sm text-ink-muted">Bu olguya görsel eklenmemiş.</p>;
  const current = open !== null ? images[open] : null;

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img, i) => (
          <li key={img.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group block w-full overflow-hidden rounded-xl border border-border bg-surface-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-label={`Görsel ${i + 1}${img.caption ? ": " + img.caption : ""} — büyüt`}
            >
              <div className="aspect-[4/3] w-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/dosya/${img.fileId}`} alt={img.caption ?? `Olgu görseli ${i + 1}`} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
              </div>
              {img.caption && <p className="line-clamp-2 px-2.5 py-2 text-xs text-ink-muted">{img.caption}</p>}
            </button>
          </li>
        ))}
      </ul>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Görsel önizleme"
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3 sm:p-6"
          onClick={() => setOpen(null)}
        >
          <div className="flex items-center justify-between gap-2 text-white">
            <div className="min-w-0 text-sm">{current.caption && <span className="text-white/80">{current.caption}</span>}</div>
            <button type="button" onClick={() => setOpen(null)} className="rounded-full p-2 hover:bg-white/10" aria-label="Kapat">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/dosya/${current.fileId}`} alt={current.caption ?? "Olgu görseli"} className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
          {images.length > 1 && (
            <p className="mt-2 text-center text-xs text-white/70">
              {open! + 1} / {images.length} · Ok tuşlarıyla gezin
            </p>
          )}
        </div>
      )}
    </>
  );
}
