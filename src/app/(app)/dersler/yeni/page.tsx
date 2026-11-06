import { requireStaff } from "@/lib/auth/dal";
import { PageHeader, Alert } from "@/components/ui";
import { LessonForm } from "@/components/lessons/lesson-form";

export const metadata = { title: "Yeni ders" };

export default async function YeniDersPage() {
  await requireStaff();
  return (
    <>
      <PageHeader eyebrow="Dersler" title="Yeni ders" description="Önce başlık ve alt dal; ardından aynı sayfada belge, görsel, 3B model, video, bağlantı ve ses ekleyip dersi yayımlarsınız." />
      <Alert tone="info" className="mb-5">
        Ders notu, yüklediğiniz PDF&apos;ten otomatik çıkarılabilir (yapay zekâsız) veya yapay zekâ ile üretilebilir; her durumda siz düzenleyip yayımlarsınız.
      </Alert>
      <div className="max-w-2xl">
        <LessonForm mode="create" />
      </div>
    </>
  );
}
