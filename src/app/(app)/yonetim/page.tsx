import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { ROLE_LABELS } from "@/lib/auth/dal";
import { getOverview } from "@/lib/queries/admin";
import { getAiSettings } from "@/lib/ai/client";
import { availableProviders, resolveModel } from "@/lib/ai/provider";
import { formatUsd } from "@/lib/ai/pricing";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";

const nf = new Intl.NumberFormat("tr-TR");

export default async function AdminOverviewPage() {
  await requireAdmin();
  const [o, ai] = await Promise.all([getOverview(), getAiSettings()]);
  // Etkin sağlayıcı ve model (anahtar yoksa "kapalı"); maliyet satır modellerine göre hesaplanır.
  const avail = availableProviders();
  const activeLabel = avail.length
    ? `${avail.includes(ai.provider) ? ai.provider : avail[0]} · ${resolveModel(ai)}`
    : ai.assistantMode === "search_only"
      ? "kaynak arama (yapay zekâ kapalı)"
      : "yapılandırılmamış";
  const cost = o.aiMonth.calls === 0 ? 0 : o.aiMonth.costUsd;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Kullanıcılar</CardTitle>
          <CardDescription>
            {o.activeUsers} aktif · {o.suspendedUsers} askıda
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-1 text-sm">
            {(Object.keys(o.roles) as (keyof typeof o.roles)[]).map((r) => (
              <div key={r} className="flex justify-between">
                <dt className="text-ink-muted">{ROLE_LABELS[r]}</dt>
                <dd className="font-semibold tabular-nums">{o.roles[r]}</dd>
              </div>
            ))}
          </dl>
          <Link href="/yonetim/kullanicilar" className="mt-3 inline-block text-sm text-brand-700 underline">
            Kullanıcıları yönet
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Onay bekleyen içerik</CardTitle>
          <CardDescription>İnceleme kuyruğu</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-1 text-sm">
            <Row label="Kaynak (onaysız, hazır)" value={o.pending.sources} />
          </dl>
          <Link href="/yonetim/kaynaklar?onay=0&durum=READY" className="mt-3 inline-block text-sm text-brand-700 underline">
            Kaynakları yönet
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yapay zekâ (bu ay)</CardTitle>
          <CardDescription>
            {o.aiMonth.calls} çağrı · {activeLabel}
            {ai.assistantMode === "search_only" && avail.length ? " · asistan: yalnızca kaynak arama" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-1 text-sm">
            <Row label="Giriş token" value={o.aiMonth.input} />
            <Row label="Çıkış token" value={o.aiMonth.output} />
            <Row label="Önbellek okuma" value={o.aiMonth.cache} />
            <div className="flex justify-between border-t border-border pt-1">
              <dt className="text-ink-muted">Tahmini maliyet</dt>
              <dd className="font-semibold tabular-nums">{formatUsd(cost)}</dd>
            </div>
          </dl>
          <Link href="/yonetim/kullanim" className="mt-3 inline-block text-sm text-brand-700 underline">
            Kullanım ayrıntısı
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Depolama</CardTitle>
          <CardDescription>Yüklenen dosyalar</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tabular-nums text-ink">{nf.format(o.fileCount)}</p>
          <p className="mt-1 text-xs text-ink-muted">PDF kaynaklar, olgu/soru/ders görselleri (yalnızca /api/dosya ile sunulur).</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{nf.format(value)}</dd>
    </div>
  );
}
