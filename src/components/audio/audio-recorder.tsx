"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Button, Field } from "@/components/ui";
import { cn } from "@/lib/utils";

export function fmtDur(s: number | null | undefined) {
  if (s === null || s === undefined) return "";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Ortak ses kaydedici: tarayıcıda mikrofonla kayıt (MediaRecorder) veya dosya seçimi.
 * Kayıt, kullanıcı formu gönderene kadar cihazda kalır; sonuç `name` adlı dosya girdisine,
 * süre `durationName` adlı gizli girdiye yazılır. `resetToken` değişince her şey temizlenir.
 */
export function AudioRecorder({
  name,
  durationName,
  maxSec,
  resetToken = 0,
  inputId,
  fileErrors,
  compact = false,
}: {
  name: string;
  durationName: string;
  maxSec: number;
  resetToken?: number;
  inputId: string;
  fileErrors?: string[];
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const durRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"file" | "record">("record");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const firstRef = useRef(true);
  /** Son kayıt/dosya: React, sunucu eylemi bitince formu sıfırlar; hata dönerse ses geri yüklenir */
  const lastFileRef = useRef<File | null>(null);
  const clearingRef = useRef(false);

  function assignFile(file: File | null) {
    if (!fileRef.current) return;
    const dt = new DataTransfer();
    if (file) dt.items.add(file);
    fileRef.current.files = dt.files;
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    setRecording(false);
  }

  // Dış sıfırlama (form başarıyla gönderildi): önizleme, dosya ve süre temizlenir
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      clearingRef.current = true;
      stopRecording();
      lastFileRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
      if (durRef.current) durRef.current.value = "";
      elapsedRef.current = 0;
      setElapsed(0);
      setPreview(null);
      setRecError(null);
      clearingRef.current = false;
    }, 0);
    return () => clearTimeout(t);
  }, [resetToken]);
  // Form sıfırlanınca (sunucu eylemi hata döndürdüğünde de olur) son sesi ve süreyi geri koy
  useEffect(() => {
    const form = fileRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setTimeout(() => {
        if (clearingRef.current || !lastFileRef.current) return;
        assignFile(lastFileRef.current);
        if (durRef.current) durRef.current.value = elapsedRef.current ? String(elapsedRef.current) : "";
      }, 0);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  // Bileşen kaldırılırsa mikrofonu bırak
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const rec = recRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
      rec?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function startRecording() {
    setRecError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `kayit-${Date.now()}.${ext}`, { type: blob.type });
        lastFileRef.current = file;
        assignFile(file);
        if (durRef.current) durRef.current.value = String(elapsedRef.current);
        setPreview(URL.createObjectURL(blob));
      };
      rec.start(250);
      recRef.current = rec;
      setRecording(true);
      setElapsed(0);
      elapsedRef.current = 0;
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        if (elapsedRef.current >= maxSec) stopRecording();
      }, 1000);
    } catch {
      setRecError("Mikrofona erişilemedi. Tarayıcı izinlerini kontrol edin veya dosya yükleyin.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="audio-mode" value="record" checked={mode === "record"} onChange={() => setMode("record")} /> Tarayıcıda kaydet
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="audio-mode" value="file" checked={mode === "file"} onChange={() => setMode("file")} /> Dosya yükle
        </label>
      </div>

      <div className={cn("rounded-xl border border-dashed border-border", compact ? "p-2" : "p-3", mode === "record" ? "" : "hidden")}>
        <div className="flex flex-wrap items-center gap-3">
          {!recording ? (
            <Button type="button" variant="secondary" size="sm" onClick={startRecording}>
              <Mic className="h-4 w-4" /> {preview ? "Yeniden kaydet" : "Kaydı başlat"}
            </Button>
          ) : (
            <Button type="button" variant="danger" size="sm" onClick={stopRecording}>
              <Square className="h-4 w-4" /> Durdur
            </Button>
          )}
          <span className={cn("font-mono text-sm tabular-nums", recording ? "text-red-600" : "text-ink-muted")} aria-live="polite">
            {recording && <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-red-600 align-middle" aria-hidden />}
            {fmtDur(elapsed)} / {fmtDur(maxSec)}
          </span>
        </div>
        {recError && <p className="mt-2 text-sm text-red-600">{recError}</p>}
        {preview && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-ink-muted">Ön dinleme (henüz gönderilmedi)</p>
            <audio controls src={preview} className="w-full" />
          </div>
        )}
      </div>

      <Field label="Ses dosyası" htmlFor={inputId} errors={fileErrors} className={mode === "file" ? "" : "hidden"}>
        <input
          ref={fileRef}
          id={inputId}
          name={name}
          type="file"
          accept="audio/*,.webm,.m4a,.mp3,.ogg,.wav"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0] ?? null;
            if (f) {
              lastFileRef.current = f;
              elapsedRef.current = 0;
              if (durRef.current) durRef.current.value = "";
            }
          }}
          className="block w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700"
        />
      </Field>
      <input ref={durRef} type="hidden" name={durationName} defaultValue="" />
    </div>
  );
}
