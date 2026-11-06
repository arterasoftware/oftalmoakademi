import { requireUser } from "@/lib/auth/dal";
import { PageHeader, Alert } from "@/components/ui";
import { CaseForm } from "@/components/cases/case-form";

export const metadata = { title: "Olgu Paylaş" };

export default async function NewCasePage() {
  await requireUser();
  return (
    <>
      <PageHeader eyebrow="Klinik Olgular" title="Olgu paylaş" description="Olgu metni, görseller ve ses kaydı; paylaşınca hemen tartışmaya açılır." />
      <Alert tone="info" className="mb-5">
        Eğitim amaçlıdır; gerçek zamanlı hasta yönetimi için klinik karar aracı değildir. Hasta kimliğini ortaya çıkarabilecek hiçbir bilgi girmeyin.
      </Alert>
      <CaseForm mode="create" />
    </>
  );
}
