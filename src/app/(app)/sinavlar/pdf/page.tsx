import { requireStaff } from "@/lib/auth/dal";
import { aiAvailable } from "@/lib/ai/client";
import { PageHeader, Alert } from "@/components/ui";
import { PdfImport } from "@/components/exams/pdf-import";

export const metadata = { title: "PDF'ten sınav oluştur" };

export default async function PdfExamPage() {
  await requireStaff();
  return (
    <>
      <PageHeader eyebrow="Sınavlar" title="PDF'ten mini sınav oluştur" description="Soru PDF'ini yükleyin; sorular ve şıklar tanınır, doğru yanıtları kontrol edip tek tıkla taslak sınav oluşturursunuz." />
      <Alert tone="info" className="mb-5">
        Metin tabanlı PDF gerekir (taranmış görüntü PDF&apos;lerinde metin çıkarılamaz). Görsel içeren sorular metin olarak gelir; görseli sonradan soru düzenleyicisinden
        ekleyebilirsiniz. Oluşturulan sınav taslaktır; her soru onaylandıktan sonra açılır.
      </Alert>
      <PdfImport aiEnabled={aiAvailable()} />
    </>
  );
}
