import { requireAdmin, ROLE_LABELS } from "@/lib/auth/dal";
import { listUsers } from "@/lib/queries/admin";
import { Badge, Card, CardContent, Alert } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { UserRowActions } from "./user-row-actions";

export const metadata = { title: "Kullanıcılar · Yönetim" };

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const users = await listUsers();
  return (
    <div className="space-y-4">
      <Alert tone="info">
        Rol değişikliği ve askıya alma, kullanıcının tüm oturumlarını kapatır. Kendi rolünüzü veya durumunuzu değiştiremezsiniz. Yeni kullanıcı eklemek için &quot;Davetler&quot; sekmesini kullanın.
      </Alert>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-2.5">Ad</th>
                <th className="px-4 py-2.5">E-posta</th>
                <th className="px-4 py-2.5">Rol</th>
                <th className="px-4 py-2.5">Yıl</th>
                <th className="px-4 py-2.5">Durum</th>
                <th className="px-4 py-2.5">MFA</th>
                <th className="px-4 py-2.5">Son giriş</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => {
                const isSelf = u.id === admin.id;
                return (
                  <tr key={u.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">
                        {u.title ? `${u.title} ` : ""}
                        {u.name}
                        {isSelf && <span className="ml-1 text-xs text-ink-muted">(siz)</span>}
                      </div>
                      <div className="mt-2">
                        <UserRowActions user={{ id: u.id, role: u.role, status: u.status, mfaEnabled: u.mfaEnabled }} isSelf={isSelf} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === "ADMIN" ? "brand" : u.role === "FACULTY" ? "info" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{u.residencyYear ?? "—"}</td>
                    <td className="px-4 py-3">{u.status === "ACTIVE" ? <Badge tone="success">Aktif</Badge> : <Badge tone="danger">Askıda</Badge>}</td>
                    <td className="px-4 py-3">{u.mfaEnabled ? <Badge tone="success">Etkin</Badge> : <Badge>Kapalı</Badge>}</td>
                    <td className="px-4 py-3 text-ink-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
