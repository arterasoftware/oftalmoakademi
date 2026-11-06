import { requireAdmin } from "@/lib/auth/dal";
import { getAiSettings } from "@/lib/ai/client";
import { embeddingProvider } from "@/lib/ai/rag/embed";
import { availableProviders, resolveModel } from "@/lib/ai/provider";
import { env } from "@/lib/env";
import { KNOWN_MODELS, KNOWN_GEMINI_MODELS } from "@/lib/ai/pricing";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { AiSettingsForm } from "./ai-settings-form";

export const metadata = { title: "Yapay zekâ ayarları · Yönetim" };

export default async function AdminAiSettingsPage() {
  await requireAdmin();
  const settings = await getAiSettings();
  // Yalnızca "tanımlı mı" bilgisi; anahtar değerleri hiçbir zaman istemciye gitmez.
  const avail = availableProviders();
  const configured = { anthropic: avail.includes("anthropic"), gemini: avail.includes("gemini") };
  const embProvider = embeddingProvider();
  const active = avail.length ? `${avail.includes(settings.provider) ? settings.provider : avail[0]} · ${resolveModel(settings)}` : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,360px)]">
      <Card>
        <CardHeader>
          <CardTitle>Model ve davranış</CardTitle>
          <CardDescription>Bu ayarlar tüm yapay zekâ özelliklerinde (asistan, ders taslağı, sınav üretimi…) kullanılır.</CardDescription>
        </CardHeader>
        <CardContent>
          <AiSettingsForm
            settings={settings}
            knownModels={KNOWN_MODELS}
            knownGeminiModels={KNOWN_GEMINI_MODELS}
            envModel={env().AI_MODEL}
            envGeminiModel={env().GEMINI_MODEL}
            configured={configured}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yapılandırma durumu</CardTitle>
          <CardDescription>Anahtarlar yalnızca sunucu ortam değişkenlerinden okunur; buradan düzenlenemez.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink">GEMINI_API_KEY</dt>
              <dd>{configured.gemini ? <Badge tone="success">Tanımlı</Badge> : <Badge tone="warning">Eksik</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink">ANTHROPIC_API_KEY</dt>
              <dd>{configured.anthropic ? <Badge tone="success">Tanımlı</Badge> : <Badge tone="warning">Eksik</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink">Embedding (vektör arama)</dt>
              <dd>{embProvider ? <Badge tone="success">{embProvider === "gemini" ? "Gemini" : "Voyage"}</Badge> : <Badge tone="warning">Yalnızca tam metin</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink">Etkin sağlayıcı</dt>
              <dd>{active ? <Badge tone="brand">{active}</Badge> : <Badge tone="danger">Yok</Badge>}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-ink-muted">
            {active ? "Yapay zekâ özellikleri etkin." : "Anahtar eksikken tüm yapay zekâ düğmeleri devre dışıdır."}{" "}
            {embProvider ? "Kaynak araması hibrit (tam metin + vektör) çalışır; embedding sağlayıcısı değişirse kaynaklar yeniden indekslenmelidir." : "Embedding anahtarı olmadan kaynak araması yalnızca tam metin (FTS) ile çalışır."}
          </p>
          <Alert tone="warning" className="mt-4" title="Gemini ücretsiz katmanı">
            Ücretsiz anahtar Google AI Studio üzerinden alınır (aistudio.google.com/apikey). Ücretsiz katmanda dakika ve gün başına istek sınırları vardır ve
            Google, gönderilen istemleri ürün geliştirme için kullanabilir; olgu metinleri kimliksiz olsa da kurum KVKK sorumlusunun onayı önerilir.
            Ücretli katmana geçildiğinde veriler eğitimde kullanılmaz.
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
