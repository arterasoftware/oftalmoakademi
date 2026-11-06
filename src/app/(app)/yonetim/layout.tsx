import { requireAdmin } from "@/lib/auth/dal";
import { PageHeader } from "@/components/ui";
import { AdminTabs } from "./admin-tabs";

export const metadata = { title: "Yönetim" };

export default async function AdminLayout({ children }: LayoutProps<"/yonetim">) {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Yönetim" description="Kullanıcılar, davetler, bilimsel kaynaklar, denetim kayıtları ve yapay zekâ yapılandırması." />
      <AdminTabs />
      <div className="mt-5">{children}</div>
    </>
  );
}
