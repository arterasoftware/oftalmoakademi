"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { generateLessonNotesAction } from "@/lib/actions/lessons";
import { Field, Textarea, Button, Alert, Badge } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";

export type TextMaterial = { id: string; title: string; chars: number };

/**
 * Ders notu alanı: ana formun içinde yer alır (name="notes"). "Belgeden not çıkar" (yapay zekâsız) ve
 * "Yapay zekâ ile not üret" düğmeleri ayrı bir eylemle notu üretir ve alana yazar; öğretim üyesi düzenleyip Kaydet der.
 */
export function LessonNotesEditor({
  lessonId,
  initialNotes,
  source,
  materials,
  aiEnabled,
}: {
  lessonId: string;
  initialNotes: string;
  source: "manual" | "auto" | "ai" | null;
  materials: TextMaterial[];
  aiEnabled: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [state, action, pending] = useActionState<ActionResult<{ notes: string }> | null, FormData>(generateLessonNotesAction, null);
  const [selected, setSelected] = useState<string[]>(materials.map((m) => m.id));

  useEffect(() => {
    if (!state?.ok || !state.data?.notes) return;
    const next = state.data.notes;
    const t = setTimeout(() => setNotes(next), 0);
    return () => clearTimeout(t);
  }, [state]);

  function submitGenerate(mode: "auto" | "ai") {
    const fd = new FormData();
    fd.set("id", lessonId);
    fd.set("mode", mode);
    for (const id of selected) fd.append("materialIds", id);
    // useActionState eylemi bir geçiş (transition) içinde çağrılmalıdır
    startTransition(() => action(fd));
  }

  const label = source === "ai" ? "Yapay zekâ taslağı" : source === "auto" ? "Belgeden otomatik" : source === "manual" ? "Elle yazıldı" : null;

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-ink">Ders notu</p>
          {label && <Badge tone={source === "ai" ? "ai" : "neutral"}>{label}</Badge>}
        </div>
        <p className="text-xs text-ink-muted">Basit Markdown: ## başlık, - madde, **kalın**.</p>
      </div>

      {materials.length > 0 ? (
        <div className="space-y-2 rounded-lg bg-surface-muted/60 p-2.5">
          <p className="text-xs text-ink-muted">Not üretiminde kullanılacak belgeler (metni çıkarılmış PDF&apos;ler):</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {materials.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5 text-xs text-ink">
                <input type="checkbox" checked={selected.includes(m.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))} /> {m.title}
                <span className="text-ink-faint">({Math.round(m.chars / 1000)} bin karakter)</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={pending || selected.length === 0} loading={pending} onClick={() => submitGenerate("auto")}>
              <FileText className="h-4 w-4" /> Belgeden not çıkar (yapay zekâsız)
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending || selected.length === 0 || !aiEnabled} loading={pending} onClick={() => submitGenerate("ai")} title={aiEnabled ? undefined : "Yapay zekâ yapılandırılmamış"}>
              <Sparkles className="h-4 w-4" /> Yapay zekâ ile not üret
            </Button>
          </div>
          <p className="text-[11px] text-ink-faint">Üretilen not taslak olarak kaydedilir ve alana yazılır; yaptığınız düzenlemeler Kaydet ile saklanır. Yapay zekâsız seçenek belgedeki cümleleri seçer, yeniden yazmaz.</p>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Not üretmek için önce bir PDF belge yükleyin (metni çıkarılabilen); ya da notu doğrudan yazın.</p>
      )}

      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && state.message && <Alert tone="success">{state.message}</Alert>}

      <Field label="Not metni" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={14} maxLength={60000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="## Önemli noktalar&#10;- …" className="font-mono text-[13px]" />
      </Field>
    </div>
  );
}
