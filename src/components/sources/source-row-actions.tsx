"use client";

import { reindexSourceAction, setSourceApprovalAction, deleteSourceAction } from "@/lib/actions/sources";
import { SubmitButton } from "@/components/ui";

type Props = {
  source: { id: string; title: string; status: string; approved: boolean; lessonCount: number; chunkCount: number };
  /** Silme sonrası dönülecek sayfa (yalnızca izinli iç yollar). */
  returnTo: "/kaynaklar" | "/yonetim/kaynaklar";
  /** Kompakt düzen (tablo satırı). */
  compact?: boolean;
};

/** Kaynak satırı eylemleri: yeniden indeksle, onay, sil (onay penceresi ile). */
export function SourceRowActions({ source, returnTo, compact }: Props) {
  const canApprove = source.approved || source.status === "READY";
  const size = "sm" as const;
  const confirmText = [
    `"${source.title}" kalıcı olarak silinecek.`,
    source.chunkCount > 0 ? `${source.chunkCount} indeks parçası silinir.` : null,
    source.lessonCount > 0 ? `Bu kaynak ${source.lessonCount} dersin kaynak listesinden çıkarılır.` : null,
    source.approved ? "Kaynak uzman onaylı; yapay zekâ asistanı artık bu kaynağa dayanamaz." : null,
    "Devam edilsin mi?",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className={compact ? "flex flex-wrap items-center gap-1.5" : "flex flex-wrap gap-2"}>
      <form action={reindexSourceAction}>
        <input type="hidden" name="id" value={source.id} />
        <SubmitButton variant="outline" size={size}>
          Yeniden indeksle
        </SubmitButton>
      </form>
      <form action={setSourceApprovalAction}>
        <input type="hidden" name="id" value={source.id} />
        <input type="hidden" name="approved" value={source.approved ? "0" : "1"} />
        <SubmitButton
          variant={source.approved ? "ghost" : "secondary"}
          size={size}
          disabled={!canApprove}
          title={!canApprove ? "Yalnızca hazır (READY) kaynaklar onaylanabilir." : undefined}
        >
          {source.approved ? "Onayı kaldır" : compact ? "Onayla" : "Onayla (uzman onayı)"}
        </SubmitButton>
      </form>
      <form action={deleteSourceAction}>
        <input type="hidden" name="id" value={source.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <SubmitButton variant="danger" size={size} onClick={(e) => !window.confirm(confirmText) && e.preventDefault()}>
          Sil
        </SubmitButton>
      </form>
    </div>
  );
}
