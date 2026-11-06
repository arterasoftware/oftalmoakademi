"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Mic, ImagePlus, X } from "lucide-react";
import { addCommentAction } from "@/lib/actions/discussion";
import { Textarea, SubmitButton, Alert } from "@/components/ui";
import { AudioRecorder } from "@/components/audio/audio-recorder";
import type { DiscussionTarget } from "@/lib/queries/discussion";

/** Sesli yorum sınırı (saniye); sunucu tarafı COMMENT_AUDIO_MAX_SEC ile aynı */
const AUDIO_MAX_SEC = 180;

export function CommentForm({
  targetType,
  targetId,
  path,
  parentId,
  canMarkCorrection,
  onDone,
  compact,
}: {
  targetType: DiscussionTarget;
  targetId: string;
  path: string;
  parentId?: string;
  canMarkCorrection?: boolean;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [state, action] = useActionState(addCommentAction, null);
  const ref = useRef<HTMLFormElement>(null);
  const [withAudio, setWithAudio] = useState(false);
  const [withImages, setWithImages] = useState(false);
  const [imageNames, setImageNames] = useState<string[]>([]);
  const [resetToken, setResetToken] = useState(0);
  const [clientError, setClientError] = useState<string | null>(null);
  const uid = useId();

  useEffect(() => {
    if (!state?.ok) return;
    const t = setTimeout(() => {
      ref.current?.reset();
      setWithAudio(false);
      setWithImages(false);
      setImageNames([]);
      setResetToken((n) => n + 1);
      onDone?.();
    }, 0);
    return () => clearTimeout(t);
  }, [state, onDone]);

  return (
    <form
      ref={ref}
      action={action}
      className="space-y-2"
     
      onSubmit={(e) => {
        // Sunucuya gitmeden önce: metin yoksa ses, ses yoksa metin gerekir (gidip gelme ve form sıfırlanmasını önler)
        const form = e.currentTarget;
        const body = (form.elements.namedItem("body") as HTMLTextAreaElement | null)?.value.trim() ?? "";
        const audio = form.elements.namedItem("audio") as HTMLInputElement | null;
        const imgs = form.elements.namedItem("images") as HTMLInputElement | null;
        const hasMedia = Boolean(audio?.files?.length) || Boolean(imgs?.files?.length);
        if (!hasMedia && body.length < 2) {
          e.preventDefault();
          setClientError(withAudio || withImages ? "Ses kaydedin, görsel seçin ya da en az iki karakter metin yazın." : "Yorum metni yazın ya da ses kaydı veya görsel ekleyin.");
          return;
        }
        setClientError(null);
      }}
    >
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="path" value={path} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      {clientError ? <Alert tone="danger">{clientError}</Alert> : state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      <Textarea
        name="body"
        minLength={2}
        maxLength={5000}
        rows={compact ? 2 : 3}
        placeholder={parentId ? "Yanıtınızı yazın…" : withAudio || withImages ? "İsteğe bağlı açıklama…" : "Soru sorun veya görüşünüzü paylaşın…"}
        className={compact ? "min-h-16" : undefined}
      />

      {withAudio && (
        <div className="space-y-2 rounded-xl border border-border bg-surface-muted/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-ink-muted">Sesli yorum: tek kayıt, en fazla 3 dakika / 25 MB. Metin yazmadan yalnızca ses de gönderebilirsiniz.</p>
            <button type="button" onClick={() => setWithAudio(false)} className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Sesi kaldır">
              <X className="h-4 w-4" />
            </button>
          </div>
          <AudioRecorder name="audio" durationName="audioDurationSec" maxSec={AUDIO_MAX_SEC} resetToken={resetToken} inputId={`${uid}-audio`} compact />
        </div>
      )}

      {withImages && (
        <div className="space-y-2 rounded-xl border border-border bg-surface-muted/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-ink-muted">Görsel ekle: en fazla 4 görsel (JPEG, PNG, WebP, HEIC; her biri 15 MB). Üst veri sunucuda silinir.</p>
            <button
              type="button"
              onClick={() => {
                setWithImages(false);
                setImageNames([]);
              }}
              className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
              aria-label="Görselleri kaldır"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            id={`${uid}-images`}
            name="images"
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={(e) => setImageNames(Array.from(e.target.files ?? []).map((f) => f.name))}
            className="block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700"
          />
          {imageNames.length > 0 && <p className="text-xs text-ink-muted">{imageNames.join(", ")}</p>}
        </div>
      )}

      {(withAudio || withImages) && (
        <label className="flex items-start gap-2 text-xs text-ink">
          <input type="checkbox" name="deidentified" className="mt-0.5" required /> Ekte hasta adı, protokol numarası veya tarih gibi kimlik bilgisi bulunmadığını onaylıyorum.
        </label>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {!withAudio && (
            <button type="button" onClick={() => setWithAudio(true)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink">
              <Mic className="h-3.5 w-3.5" /> Ses ekle
            </button>
          )}
          {!withImages && (
            <button type="button" onClick={() => setWithImages(true)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink">
              <ImagePlus className="h-3.5 w-3.5" /> Görsel ekle
            </button>
          )}
          {canMarkCorrection && (
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input type="checkbox" name="isFacultyCorrection" /> Düzeltme / öğretim üyesi notu olarak işaretle
            </label>
          )}
        </div>
        <SubmitButton size="sm">{parentId ? "Yanıtla" : "Gönder"}</SubmitButton>
      </div>
    </form>
  );
}
