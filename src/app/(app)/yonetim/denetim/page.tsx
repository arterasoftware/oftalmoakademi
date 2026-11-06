import Link from "next/link";
import { requireAdmin } from "@/lib/auth/dal";
import { listAuditLogs, listAuditActors } from "@/lib/queries/admin";
import { uuidSchema } from "@/lib/validation";
import { Card, CardContent, Input, Select, Button, EmptyState, buttonClasses } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Denetim kayıtları · Yönetim" };

const PREFIXES = ["auth.", "user.", "settings.", "source.", "lesson.", "case.", "exam.", "article.", "comment.", "ai.", "system."];

export default async function AdminAuditPage({ searchParams }: PageProps<"/yonetim/denetim">) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.sayfa === "string" ? sp.sayfa : "1") || 1);
  const actionPrefix = typeof sp.eylem === "string" ? sp.eylem.trim().slice(0, 60) : "";
  const actorRaw = typeof sp.aktor === "string" ? sp.aktor : "";
  const actorId = uuidSchema.safeParse(actorRaw).success ? actorRaw : undefined;

  const [{ rows, total, pageSize }, actors] = await Promise.all([listAuditLogs({ page, actionPrefix: actionPrefix || undefined, actorId }), listAuditActors()]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link = (p: number) => {
    const q = new URLSearchParams();
    if (actionPrefix) q.set("eylem", actionPrefix);
    if (actorId) q.set("aktor", actorId);
    if (p > 1) q.set("sayfa", String(p));
    const s = q.toString();
    return s ? `/yonetim/denetim?${s}` : "/yonetim/denetim";
  };

  return (
    <div className="space-y-4">
      <form method="get" action="/yonetim/denetim" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <div>
          <label htmlFor="eylem" className="mb-1.5 block text-sm font-medium text-ink">
            Eylem öneki
          </label>
          <Input id="eylem" name="eylem" list="eylem-list" defaultValue={actionPrefix} placeholder="örn. user." maxLength={60} />
          <datalist id="eylem-list">
            {PREFIXES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="aktor" className="mb-1.5 block text-sm font-medium text-ink">
            Aktör
          </label>
          <Select id="aktor" name="aktor" defaultValue={actorId ?? ""}>
            <option value="">Tümü</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Filtrele
        </Button>
        <Link href="/yonetim/denetim" className={buttonClasses("ghost", "md")}>
          Temizle
        </Link>
      </form>

      <p className="text-xs text-ink-muted">
        {total} kayıt · sayfa {page}/{pages}
      </p>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Kayıt bulunamadı" />
            </div>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">Zaman</th>
                  <th className="px-4 py-2.5">Aktör</th>
                  <th className="px-4 py-2.5">Eylem</th>
                  <th className="px-4 py-2.5">Varlık</th>
                  <th className="px-4 py-2.5">Üst veri</th>
                  <th className="px-4 py-2.5">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{formatDateTime(r.createdAt)}</td>
                    <td className="px-4 py-2 text-ink">{r.actorName ?? (r.actorId ? "Silinmiş kullanıcı" : "Sistem")}</td>
                    <td className="px-4 py-2 font-mono text-xs text-ink">{r.action}</td>
                    <td className="px-4 py-2 text-xs text-ink-muted">
                      {r.entityType ? (
                        <>
                          {r.entityType}
                          {r.entityId ? <span className="block truncate font-mono" title={r.entityId}>{r.entityId.slice(0, 8)}…</span> : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-md px-4 py-2">
                      {r.metadata ? <code className="block whitespace-pre-wrap break-all font-mono text-xs text-ink-muted">{JSON.stringify(r.metadata)}</code> : "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-ink-muted">{r.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Sayfalama">
          {page > 1 ? (
            <Link href={link(page - 1)} className={buttonClasses("outline", "sm")}>
              ← Önceki
            </Link>
          ) : (
            <span />
          )}
          {page < pages ? (
            <Link href={link(page + 1)} className={buttonClasses("outline", "sm")}>
              Sonraki →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
