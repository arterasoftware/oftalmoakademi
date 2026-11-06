"use client";

import { Trash2 } from "lucide-react";
import { deleteCaseImageAction } from "@/lib/actions/cases";
import type { CaseImageDto } from "@/lib/queries/cases";

/** Düzenleme sayfasında mevcut görseller ve silme düğmeleri. */
export function CaseImageList({ caseId, images }: { caseId: string; images: CaseImageDto[] }) {
  if (images.length === 0) return <p className="text-sm text-ink-muted">Henüz görsel yok.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {images.map((img) => (
        <li key={img.id} className="overflow-hidden rounded-xl border border-border bg-surface-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/dosya/${img.fileId}`} alt={img.caption ?? "Olgu görseli"} className="aspect-[4/3] w-full object-cover" />
          <form
            action={deleteCaseImageAction}
            className="flex items-center justify-end px-2 py-1"
            onSubmit={(e) => {
              if (!confirm("Bu görsel silinsin mi?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="caseId" value={caseId} />
            <input type="hidden" name="imageId" value={img.id} />
            <button type="submit" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-red-50 hover:text-red-700">
              <Trash2 className="h-3.5 w-3.5" /> Sil
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
