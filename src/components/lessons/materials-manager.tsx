"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { addMaterialAction, deleteMaterialAction } from "@/lib/actions/materials";
import { Field, Input, Textarea, Select, SubmitButton, Alert, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import type { MaterialView } from "@/lib/queries/materials";
import { MaterialCard } from "./material-card";
import { AudioRecorder } from "@/components/audio/audio-recorder";

const KINDS = [
  { value: "PDF", label: "PDF belge (en fazla 40 MB)", accept: "application/pdf,.pdf" },
  { value: "IMAGE", label: "Görsel (JPEG/PNG/WebP/HEIC, 15 MB)", accept: "image/*" },
  { value: "MODEL3D", label: "3B model (GLB / glTF, 60 MB)", accept: ".glb,.gltf,model/gltf-binary,model/gltf+json" },
  { value: "VIDEO", label: "Video (MP4/WebM yükle veya YouTube/Vimeo bağlantısı)", accept: "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" },
  { value: "LINK", label: "Bağlantı (web sayfası)", accept: "" },
  { value: "AUDIO", label: "Ses kaydı (kaydet veya MP3/M4A/WAV yükle, 25 MB)", accept: "audio/*,.mp3,.m4a,.wav,.ogg,.webm" },
] as const;

export function MaterialsManager({ lessonId, materials }: { lessonId: string; materials: MaterialView[] }) {
  const [state, action] = useActionState(addMaterialAction, null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("PDF");
  const [videoMode, setVideoMode] = useState<"file" | "url">("url");
  const formRef = useRef<HTMLFormElement>(null);
  const [resetToken, setResetToken] = useState(0);
  const uid = useId();
  useEffect(() => {
    if (!state?.ok) return;
    const t = setTimeout(() => {
      formRef.current?.reset();
      setResetToken((n) => n + 1);
    }, 0);
    return () => clearTimeout(t);
  }, [state]);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const accept = KINDS.find((k) => k.value === kind)?.accept ?? "";
  const needsFile = kind === "PDF" || kind === "IMAGE" || kind === "MODEL3D" || (kind === "VIDEO" && videoMode === "file");
  const needsUrl = kind === "LINK" || (kind === "VIDEO" && videoMode === "url");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Materyal ekle</CardTitle>
        <CardDescription>PDF, görsel, 3B model, video, bağlantı veya ses kaydı. Dosya türleri imzadan doğrulanır; görsellerin üst verisi temizlenir.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form ref={formRef} action={action} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
          <input type="hidden" name="lessonId" value={lessonId} />
          {state && !state.ok && (
            <Alert tone="danger" className="sm:col-span-2">
              {state.error}
            </Alert>
          )}
          {state && state.ok && (
            <Alert tone="success" className="sm:col-span-2">
              {state.message}
            </Alert>
          )}
          <Field label="Tür" htmlFor="kind">
            <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Başlık" htmlFor="mtitle" errors={fe?.title}>
            <Input id="mtitle" name="title" required maxLength={200} placeholder="Örn. Glokom OCT atlası, 3. bölüm" />
          </Field>
          {kind === "VIDEO" && (
            <div className="flex items-center gap-4 text-sm sm:col-span-2">
              <label className="flex items-center gap-1.5">
                <input type="radio" name="videoMode" checked={videoMode === "url"} onChange={() => setVideoMode("url")} /> YouTube / Vimeo bağlantısı
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" name="videoMode" checked={videoMode === "file"} onChange={() => setVideoMode("file")} /> Video dosyası yükle
              </label>
            </div>
          )}
          {kind === "AUDIO" && (
            <div className="sm:col-span-2">
              <AudioRecorder name="file" durationName="durationSec" maxSec={1800} resetToken={resetToken} inputId={`${uid}-audio`} fileErrors={fe?.file} compact />
            </div>
          )}
          {needsFile && (
            <Field label="Dosya" htmlFor="file" errors={fe?.file} className="sm:col-span-2">
              <Input id="file" name="file" type="file" accept={accept} required className="file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700" />
            </Field>
          )}
          {needsUrl && (
            <Field label="Adres (https://…)" htmlFor="url" errors={fe?.url} className="sm:col-span-2" hint={kind === "VIDEO" ? "Yalnızca YouTube ve Vimeo adresleri gömülür (gizlilik modu)." : undefined}>
              <Input id="url" name="url" type="url" required placeholder="https://" />
            </Field>
          )}
          <Field label="Açıklama (isteğe bağlı)" htmlFor="mdesc" errors={fe?.description} className="sm:col-span-2" hint="Asistan neye dikkat etmeli? Etkileşimli sayfada yönlendirme olarak kullanılır.">
            <Textarea id="mdesc" name="description" rows={2} maxLength={2000} className="min-h-16" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton size="sm">Materyal ekle</SubmitButton>
          </div>
        </form>

        {materials.length === 0 ? (
          <p className="text-sm text-ink-muted">Henüz materyal eklenmedi.</p>
        ) : (
          <div className="space-y-3">
            {materials.map((m) => (
              <div key={m.id} className="relative">
                <MaterialCard m={m} />
                <form
                  action={deleteMaterialAction}
                  className="absolute right-3 top-3"
                  onSubmit={(e) => {
                    if (!confirm(`"${m.title}" silinsin mi?`)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="lessonId" value={lessonId} />
                  <button type="submit" className="rounded-lg p-1.5 text-ink-muted hover:bg-red-50 hover:text-red-700" aria-label="Materyali sil" title="Sil">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
