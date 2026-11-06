import { requireStaff } from "@/lib/auth/dal";
import { getLessonOptions, getResidentOptions } from "@/lib/queries/exams";
import { Card, CardContent, PageHeader } from "@/components/ui";
import { ExamForm } from "@/components/exams/exam-form";

export const metadata = { title: "Yeni sınav" };

export default async function NewExamPage() {
  await requireStaff();
  const [lessons, residents] = await Promise.all([getLessonOptions(), getResidentOptions()]);
  return (
    <>
      <PageHeader title="Yeni sınav" description="Sınav taslak olarak oluşturulur; ardından soruları ekleyip onay akışını başlatırsınız." eyebrow="Sınavlar" />
      <Card>
        <CardContent>
          <ExamForm mode="create" lessons={lessons} residents={residents} />
        </CardContent>
      </Card>
    </>
  );
}
