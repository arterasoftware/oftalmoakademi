import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { getLessonDetail, incrementLessonViews } from "@/lib/queries/lessons";
import { uuidSchema } from "@/lib/validation";
import { PageHeader, Badge, AiBadge, Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { LESSON_STATUS } from "@/lib/status-labels";
import { formatDate, formatDateTime } from "@/lib/utils";
import { MarkdownLite } from "@/components/content/markdown-lite";
import { Discussion } from "@/components/discussion/discussion";
import { LessonWorkflow } from "./lesson-workflow";
import { MaterialsViewer } from "@/components/lessons/materials-viewer";

export const metadata = { title: "Ders" };

export default async function DersDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const lesson = await getLessonDetail(id, user);
  if (!lesson) notFound();

  const staff = isStaff(user.role);
  if (lesson.status === "PUBLISHED") await incrementLessonViews(id);
  const st = LESSON_STATUS[lesson.status];
  const canEdit = staff && (user.role === "ADMIN" || lesson.authorId === user.id);
  const notes = lesson.notes?.trim();

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/dersler" className="hover:underline">
            Dersler
          </Link>
        }
        title={lesson.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">{SUBSPECIALTY_LABELS[lesson.subspecialty]}</Badge>
            {staff && <Badge tone={st.tone}>{st.label}</Badge>}
            <span className="text-sm text-ink-muted">
              {lesson.authorName}
              {lesson.publishedAt ? ` · ${formatDate(lesson.publishedAt)}` : ""}
              {lesson.status === "PUBLISHED" ? ` · ${lesson.viewCount + 1} görüntüleme` : ""}
            </span>
          </span>
        }
      />

      {canEdit && (
        <div className="mb-5 space-y-3">
          {lesson.scheduledFor && (
            <p className="text-sm text-ink-muted">
              Planlanan tarih: <span className="font-medium text-ink">{formatDateTime(lesson.scheduledFor)}</span>
            </p>
          )}
          <LessonWorkflow lessonId={lesson.id} status={lesson.status} />
        </div>
      )}

      {lesson.description && <p className="mb-5 text-[15px] leading-relaxed text-ink">{lesson.description}</p>}

      {notes ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Ders notu</CardTitle>
              {lesson.notesSource === "ai" && <AiBadge label="Yapay zekâ taslağından" />}
              {lesson.notesSource === "auto" && <Badge tone="neutral">Belgeden otomatik</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <MarkdownLite text={notes} />
            {lesson.notesSource && lesson.notesSource !== "manual" && (
              <p className="mt-3 text-xs text-ink-muted">Bu not belgeden {lesson.notesSource === "ai" ? "yapay zekâ ile üretildi" : "otomatik çıkarıldı"} ve öğretim üyesi tarafından yayımlandı; birincil kaynak materyallerdir.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        canEdit && <Alert tone="warning">Bu dersin notu yok. Düzenleme sayfasından belgeden çıkarabilir veya yazabilirsiniz.</Alert>
      )}

      <MaterialsViewer lessonId={lesson.id} />

      {lesson.status === "PUBLISHED" && <Discussion targetType="LESSON" targetId={lesson.id} path={`/dersler/${lesson.id}`} />}
    </>
  );
}
