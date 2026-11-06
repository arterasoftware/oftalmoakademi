import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { uuidSchema } from "@/lib/validation";
import { getCaseForEdit } from "@/lib/queries/cases";
import { PageHeader, Alert, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { CaseForm } from "@/components/cases/case-form";
import { CaseImageList } from "@/components/cases/case-image-list";

export const metadata = { title: "Olguyu Düzenle" };

type Props = { params: Promise<{ id: string }> };

export default async function EditCasePage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const data = await getCaseForEdit(id, user);
  if (!data) notFound();
  const { record, images } = data;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/olgular/${record.id}`} className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="h-3 w-3" /> Olguya dön
          </Link>
        }
        title="Olguyu düzenle"
        description={record.title}
      />
      <Alert tone="info" className="mb-5">
        Eğitim amaçlıdır; gerçek zamanlı hasta yönetimi için klinik karar aracı değildir.
      </Alert>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Mevcut görseller</CardTitle>
            <CardDescription>Silmek için görselin altındaki düğmeyi kullanın; yeni görselleri aşağıdaki formdan ekleyin.</CardDescription>
          </CardHeader>
          <CardContent>
            <CaseImageList caseId={record.id} images={images} />
          </CardContent>
        </Card>
        <CaseForm
          mode="edit"
          caseId={record.id}
          initial={{
            title: record.title,
            subspecialty: record.subspecialty,
            body: record.body,
            audio: record.audioFileId ? { fileId: record.audioFileId, durationSec: record.audioDurationSec } : null,
            imageCount: images.length,
          }}
        />
      </div>
    </>
  );
}
