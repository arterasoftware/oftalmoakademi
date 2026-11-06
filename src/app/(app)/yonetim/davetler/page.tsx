import { requireAdmin, ROLE_LABELS } from "@/lib/auth/dal";
import { listInvitations, type InvitationState } from "@/lib/queries/admin";
import { revokeInvitationAction } from "@/lib/actions/admin";
import { Badge, Card, CardContent, CardHeader, CardTitle, CardDescription, SubmitButton, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { InviteForm } from "./invite-form";

export const metadata = { title: "Davetler · Yönetim" };

const STATE: Record<InvitationState, { label: string; tone: "warning" | "success" | "neutral" | "danger" }> = {
  PENDING: { label: "Bekliyor", tone: "warning" },
  ACCEPTED: { label: "Kabul edildi", tone: "success" },
  REVOKED: { label: "İptal", tone: "neutral" },
  EXPIRED: { label: "Süresi doldu", tone: "danger" },
};

export default async function AdminInvitationsPage() {
  await requireAdmin();
  const invitations = await listInvitations();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Yeni davet</CardTitle>
          <CardDescription>Üyelik yalnızca davetle açılır. Oluşturulan bağlantı tek kullanımlıktır ve bir kez gösterilir.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Davet listesi</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {invitations.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Henüz davet yok" />
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5">E-posta</th>
                  <th className="px-4 py-2.5">Ad</th>
                  <th className="px-4 py-2.5">Rol</th>
                  <th className="px-4 py-2.5">Durum</th>
                  <th className="px-4 py-2.5">Davet eden</th>
                  <th className="px-4 py-2.5">Son geçerlilik</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invitations.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2.5 text-ink">{i.email}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{i.name ?? "—"}</td>
                    <td className="px-4 py-2.5">{ROLE_LABELS[i.role]}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATE[i.state].tone}>{STATE[i.state].label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-ink-muted">{i.inviterName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-ink-muted">{i.acceptedAt ? `Kabul: ${formatDateTime(i.acceptedAt)}` : formatDateTime(i.expiresAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {i.state === "PENDING" && (
                        <form action={revokeInvitationAction}>
                          <input type="hidden" name="id" value={i.id} />
                          <SubmitButton size="sm" variant="ghost">
                            İptal et
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
