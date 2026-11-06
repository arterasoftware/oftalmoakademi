import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/dal";
import { getLessonDetail, listLessonTextMaterials } from "@/lib/queries/lessons";
import { listLessonMaterials } from "@/lib/queries/materials";
import { uuidSchema } from "@/lib/validation";
import { PageHeader, Badge, Alert, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui";
import { LESSON_STATUS } from "@/lib/status-labels";
import { toDatetimeLocal } from "@/lib/lesson-form";
import { aiAvailable } from "@/lib/ai/client";
import { LessonForm } from "@/components/lessons/lesson-form";
import { LessonNotesEditor } from "@/components/lessons/lesson-notes-editor";
import { MaterialsManager } from "@/components/lessons/materials-manager";
import { LessonWorkflow } from "../lesson-workflow";

export const metadata = { title: "Dersi düzenle" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DersDuzenlePage({ params, searchParams }: Props) {
  const user = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();
  const lesson = await getLessonDetail(id, user);
  if (!lesson) notFound();
  if (!(user.role === "ADMIN" || lesson.authorId === user.id)) redirect("/yetkisiz");
  const st = LESSON_STATUS[lesson.status];
  const [materials, textMaterials] = await Promise.all([listLessonMaterials(lesson.id), listLessonTextMaterials(lesson.id)]);
  const justCreated = sp.olusturuldu === "1";

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/dersler/${lesson.id}`} className="hover:underline">
            ← Derse dön
          </Link>
        }
        title={lesson.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={st.tone}>{st.label}</Badge>
            <span className="text-sm text-ink-muted">{lesson.status === "PUBLISHED" ? "Yayında; kaydettiğiniz değişiklikler asistanlara anında yansır." : "Taslak; yalnızca personel görür."}</span>
          </span>
        }
      />
      {justCreated && (
        <Alert tone="success" className="mb-4" title="Ders oluşturuldu">
          Şimdi materyalleri ekleyin, isterseniz belgeden ders notu çıkarın ve hazır olunca Yayımla deyin.
        </Alert>
      )}

      <div className="space-y-6">
        <LessonWorkflow lessonId={lesson.id} status={lesson.status} />

        <Card id="materyaller" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>1. Materyaller</CardTitle>
            <CardDescription>PDF belge, görsel, 3B model, video, bağlantı veya ses kaydı ekleyin. PDF&apos;lerin metni not üretimi için çıkarılır.</CardDescription>
          </CardHeader>
          <CardContent>
            <MaterialsManager lessonId={lesson.id} materials={materials} />
          </CardContent>
        </Card>

        <Card id="bilgiler" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>2. Ders bilgileri ve ders notu</CardTitle>
            <CardDescription>Not, belgeden otomatik çıkarılabilir ya da yapay zekâ ile üretilebilir; düzenleyip Kaydet deyin.</CardDescription>
          </CardHeader>
          <CardContent>
            <LessonForm
              mode="edit"
              lessonId={lesson.id}
              initial={{ title: lesson.title, subspecialty: lesson.subspecialty, description: lesson.description ?? "", scheduledFor: toDatetimeLocal(lesson.scheduledFor), notes: lesson.notes ?? "" }}
              notesSlot={<LessonNotesEditor lessonId={lesson.id} initialNotes={lesson.notes ?? ""} source={lesson.notesSource ?? null} materials={textMaterials} aiEnabled={aiAvailable()} />}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
