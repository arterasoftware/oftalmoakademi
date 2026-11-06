import { requireUser } from "@/lib/auth/dal";
import { listNotifications } from "@/lib/queries/notifications";
import { markAllReadAction } from "@/lib/actions/notifications";
import { EmptyState, PageHeader, SubmitButton } from "@/components/ui";
import { NotificationItem } from "@/components/notifications/notification-item";

export const metadata = { title: "Bildirimler" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user.id);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        title="Bildirimler"
        description={unread > 0 ? `${unread} okunmamış bildirim` : "Tüm bildirimler okundu."}
        actions={
          unread > 0 ? (
            <form action={markAllReadAction}>
              <SubmitButton variant="outline" size="sm">
                Tümünü okundu işaretle
              </SubmitButton>
            </form>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState title="Bildirim yok" description="Yeni ders, makale, olgu ve sınav duyuruları burada görünecek." />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <NotificationItem key={n.id} n={n} />
          ))}
        </ul>
      )}
    </>
  );
}
