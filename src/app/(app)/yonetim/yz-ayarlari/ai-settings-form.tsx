"use client";

import { useActionState, useState } from "react";
import { saveAiSettingsAction } from "@/lib/actions/admin";
import { Alert, Field, Input, Select, SubmitButton } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";
import type { AiSettings } from "@/lib/ai/client";

export function AiSettingsForm({
  settings,
  knownModels,
  knownGeminiModels,
  envModel,
  envGeminiModel,
  configured,
}: {
  settings: AiSettings;
  knownModels: readonly string[];
  knownGeminiModels: readonly string[];
  envModel: string;
  envGeminiModel: string;
  configured: { anthropic: boolean; gemini: boolean };
}) {
  const [state, action] = useActionState<ActionResult | null, FormData>(saveAiSettingsAction, null);
  const [provider, setProvider] = useState<AiSettings["provider"]>(settings.provider);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state && state.ok && <Alert tone="success">{state.message}</Alert>}

      <Field
        label="Asistan kipi"
        htmlFor="assistantMode"
        errors={errors?.assistantMode}
        hint="Kaynak arama kipinde hiçbir dış servis çağrılmaz: asistan, onaylı kaynaklardan ilgili bölümleri ve öğretim üyelerinin SSS yanıtlarını doğrudan alıntılar. Otomatik kipte yapay zekâ anahtar yoksa veya yanıt veremezse aynı kipe kendiliğinden düşer."
      >
        <Select id="assistantMode" name="assistantMode" defaultValue={settings.assistantMode}>
          <option value="auto">Otomatik — yapay zekâ varsa kullan, yoksa kaynak arama</option>
          <option value="search_only">Yalnızca kaynak arama — yapay zekâ kapalı (sıfır maliyet)</option>
        </Select>
      </Field>

      <Field label="Sağlayıcı" htmlFor="provider" errors={errors?.provider} hint="Seçilen sağlayıcının anahtarı tanımlı değilse anahtarı olan sağlayıcı kullanılır.">
        <Select id="provider" name="provider" value={provider} onChange={(e) => setProvider(e.target.value as AiSettings["provider"])}>
          <option value="gemini">Google Gemini — ücretsiz katman{configured.gemini ? "" : " (anahtar eksik)"}</option>
          <option value="anthropic">Anthropic Claude — ücretli{configured.anthropic ? "" : " (anahtar eksik)"}</option>
        </Select>
      </Field>

      <div className={provider === "gemini" ? "" : "hidden"}>
        <Field label="Gemini modeli" htmlFor="geminiModel" errors={errors?.geminiModel} hint={`Önerilenler: ${knownGeminiModels.join(", ")}. Ortam varsayılanı: ${envGeminiModel}. Ücretsiz katmanda dakika/gün başına istek sınırı vardır.`}>
          <Input id="geminiModel" name="geminiModel" list="gemini-model-list" defaultValue={settings.geminiModel} required maxLength={80} />
          <datalist id="gemini-model-list">
            {knownGeminiModels.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
      </div>
      <div className={provider === "anthropic" ? "" : "hidden"}>
        <Field label="Claude modeli" htmlFor="model" errors={errors?.model} hint={`Tarih son eki olmadan yazın. Önerilenler: ${knownModels.join(", ")}. Ortam varsayılanı: ${envModel}.`}>
          <Input id="model" name="model" list="model-list" defaultValue={settings.model} required maxLength={80} />
          <datalist id="model-list">
            {knownModels.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
      </div>

      <Field label="Düşünme derinliği (effort)" htmlFor="effort" errors={errors?.effort} hint="Claude'da yanıt derinliğini belirler; Gemini'de yok sayılır. Sohbet için 'medium' önerilir.">
        <Select id="effort" name="effort" defaultValue={settings.effort}>
          <option value="low">Düşük (low)</option>
          <option value="medium">Orta (medium)</option>
          <option value="high">Yüksek (high)</option>
        </Select>
      </Field>

      <Field label="Bağlam parçası sayısı (4–16)" htmlFor="maxContextChunks" errors={errors?.maxContextChunks} hint="Her soruda modele verilecek en fazla kaynak parçası. Daha fazla parça = daha geniş bağlam, daha uzun istem.">
        <Input id="maxContextChunks" name="maxContextChunks" type="number" min={4} max={16} defaultValue={settings.maxContextChunks} required />
      </Field>

      <div className="rounded-xl border border-amber-200 bg-tint-exam p-4 dark:border-amber-900">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="allowGeneralKnowledgeFallback" defaultChecked={settings.allowGeneralKnowledgeFallback} className="mt-0.5 h-4 w-4 rounded border-border" />
          <span>
            <span className="font-medium text-ink">Kaynak bulunamazsa genel bilgiyle yanıt üret</span>
            <span className="mt-1 block text-xs text-ink-muted">
              Uyarı: Açık olduğunda asistan, onaylı kaynaklarda karşılık bulamadığı sorulara modelin genel bilgisine dayanarak yanıt verir. Bu yanıtlar atıfsızdır ve
              uzman denetiminden geçmez; yanlış bilgi riski artar. Varsayılan ve önerilen ayar kapalıdır.
            </span>
          </span>
        </label>
      </div>

      <SubmitButton>Kaydet</SubmitButton>
    </form>
  );
}
