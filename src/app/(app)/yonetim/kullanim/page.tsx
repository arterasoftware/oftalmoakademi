import { requireAdmin } from "@/lib/auth/dal";
import { usageByFeature, usageByMonth, FEATURE_LABELS, type UsageRow } from "@/lib/queries/admin";
import { formatUsd, priceFor } from "@/lib/ai/pricing";
import { Alert, Card, CardContent, CardHeader, CardTitle, CardDescription, EmptyState } from "@/components/ui";

export const metadata = { title: "Kullanım · Yönetim" };

const nf = new Intl.NumberFormat("tr-TR");

export default async function AdminUsagePage() {
  await requireAdmin();
  const [byFeature, byMonth] = await Promise.all([usageByFeature(), usageByMonth()]);
  const totalCost = byFeature.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  const unknownModels = Array.from(new Set(byFeature.filter((r) => !priceFor(r.model)).map((r) => r.model)));

  return (
    <div className="space-y-6">
      <Alert tone="info" title="Tahminî maliyet">
        Maliyetler yaklaşık liste fiyatlarıyla hesaplanır (Opus 4$/20$, Sonnet 2$/10$, Haiku 0,10$/0,50$ per 1M giriş/çıkış token; önbellek okuması giriş fiyatının %10&apos;u).
        Gerçek fatura Anthropic konsolundan izlenmelidir. Toplam tahmin (tüm zamanlar): <strong>{formatUsd(totalCost)}</strong>
        {unknownModels.length > 0 && <span className="block text-xs">Fiyatı bilinmeyen modeller: {unknownModels.join(", ")}</span>}
      </Alert>

      <UsageTable title="Özellik bazında" description="Tüm zamanlar; özellik + model kırılımı." rows={byFeature} keyLabel="Özellik" keyFormat={(k) => FEATURE_LABELS[k] ?? k} />
      <UsageTable title="Ay bazında" description="Son 12 ay; ay + model kırılımı." rows={byMonth} keyLabel="Ay" keyFormat={(k) => k} />
    </div>
  );
}

function UsageTable({ title, description, rows, keyLabel, keyFormat }: { title: string; description: string; rows: UsageRow[]; keyLabel: string; keyFormat: (k: string) => string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Henüz kullanım kaydı yok" />
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2.5">{keyLabel}</th>
                <th className="px-4 py-2.5">Model</th>
                <th className="px-4 py-2.5 text-right">Çağrı</th>
                <th className="px-4 py-2.5 text-right">Giriş</th>
                <th className="px-4 py-2.5 text-right">Önbellek</th>
                <th className="px-4 py-2.5 text-right">Çıkış</th>
                <th className="px-4 py-2.5 text-right">Tahminî maliyet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={`${r.key}-${r.model}`}>
                  <td className="px-4 py-2 text-ink">{keyFormat(r.key)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-muted">{r.model}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{nf.format(r.calls)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{nf.format(r.input)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{nf.format(r.cache)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{nf.format(r.output)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatUsd(r.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
