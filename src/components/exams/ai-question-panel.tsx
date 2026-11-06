"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { generateQuestionsAction } from "@/lib/actions/exams";
import type { ActionResult } from "@/lib/action-result";
import { AiBadge, Alert, Field, Input, Select, SubmitButton } from "@/components/ui";
import { SUBSPECIALTY_LABELS, type Subspecialty } from "@/db/schema";
import type { LessonOption } from "./exam-form";

const MIX_LABELS = {
  BALANCED: "Dengeli (kolay/orta/zor)",
  EASY: "Ağırlıklı kolay",
  MEDIUM: "Ağırlıklı orta",
  HARD: "Ağırlıklı zor",
} as const;

type GenResult = ActionResult<{ added: number; dropped: number; titles: string[] }>;

export function AiQuestionPanel({
  examId,
  lessons,
  defaultLessonId,
  defaultSubspecialty,
  aiEnabled,
  disabled,
}: {
  examId: string;
  lessons: LessonOption[];
  defaultLessonId: string | null;
  defaultSubspecialty?: Subspecialty | null;
  aiEnabled: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<GenResult | null, FormData>(async (prev, fd) => {
    const r = await generateQuestionsAction(prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="examId" value={examId} />
      <div className="flex items-center gap-2">
        <AiBadge label="Yapay zekâ ile soru üret" />
        <span className="text-xs text-ink-muted">Üretilen sorular taslak olarak eklenir; onaylanmadan sınava girmez.</span>
      </div>
      {!aiEnabled && <Alert tone="warning">Yapay zekâ yapılandırılmamış (ANTHROPIC_API_KEY eksik). Soru üretimi devre dışı.</Alert>}
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && (
        <Alert tone="success" title={state.message}>
          {state.data && state.data.dropped > 0 && <p>{state.data.dropped} soru yapısal doğrulamadan geçemediği için eklenmedi.</p>}
          {state.data && state.data.titles.length > 0 && <p className="mt-1 text-xs">Bağlam: {state.data.titles.slice(0, 5).join("; ")}</p>}
        </Alert>
      )}
      <fieldset disabled={!aiEnabled || disabled} className="grid gap-4 sm:grid-cols-2">
        <Field label="Soru sayısı (1–10)" htmlFor="gen-count" errors={fe?.count}>
          <Input id="gen-count" name="count" type="number" min={1} max={10} defaultValue={5} inputMode="numeric" />
        </Field>
        <Field label="Alt branş" htmlFor="gen-subspecialty" errors={fe?.subspecialty}>
          <Select id="gen-subspecialty" name="subspecialty" defaultValue={defaultSubspecialty ?? "DIGER"}>
            {(Object.keys(SUBSPECIALTY_LABELS) as Subspecialty[]).map((k) => (
              <option key={k} value={k}>
                {SUBSPECIALTY_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ders bağlamı (isteğe bağlı)" htmlFor="gen-lesson" errors={fe?.lessonId} hint="Dersin içeriği ve bağlı kaynakların tam metni bağlam olarak kullanılır.">
          <Select id="gen-lesson" name="lessonId" defaultValue={defaultLessonId ?? ""}>
            <option value="">— Yalnızca onaylı kaynak arşivi —</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Zorluk dağılımı" htmlFor="gen-mix" errors={fe?.mix}>
          <Select id="gen-mix" name="mix" defaultValue="BALANCED">
            {(Object.keys(MIX_LABELS) as (keyof typeof MIX_LABELS)[]).map((k) => (
              <option key={k} value={k}>
                {MIX_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Konu odağı (isteğe bağlı)" htmlFor="gen-topic" errors={fe?.topic} className="sm:col-span-2">
          <Input id="gen-topic" name="topic" maxLength={300} placeholder="örn. Diyabetik maküla ödemi tedavisi" />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton variant="secondary" disabled={!aiEnabled}>
            Soru üret
          </SubmitButton>
        </div>
      </fieldset>
    </form>
  );
}
