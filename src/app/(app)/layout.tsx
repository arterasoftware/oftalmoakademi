import { requireUser, ROLE_LABELS } from "@/lib/auth/dal";
import { unreadCount } from "@/lib/notifications";
import { Sidebar, MobileNav } from "@/components/layout/app-nav";
import { TopBar } from "@/components/layout/top-bar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const unread = await unreadCount(user.id);
  return (
    <div className="flex min-h-dvh">
      <Sidebar role={user.role} unread={unread} userName={user.name} roleLabel={ROLE_LABELS[user.role]} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar unread={unread} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>
      <MobileNav role={user.role} />
    </div>
  );
}
