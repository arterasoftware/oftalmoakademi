import Link from "next/link";
import { Paperclip, FileText } from "lucide-react";
import { Badge } from "@/components/ui";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { LESSON_STATUS } from "@/lib/status-labels";
import { formatDate } from "@/lib/utils";
import type { LessonListItem } from "@/lib/queries/lessons";

export function LessonCard({ lesson, showStatus }: { lesson: LessonListItem; showStatus?: boolean }) {
  const st = LESSON_STATUS[lesson.status];
  return (
    <Link
      href={`/dersler/${lesson.id}`}
      className="block rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:hover:bg-brand-950/30"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{SUBSPECIALTY_LABELS[lesson.subspecialty]}</Badge>
        {showStatus && <Badge tone={st.tone}>{st.label}</Badge>}
      </div>
      <h3 className="mt-2 text-base font-semibold leading-snug text-ink">{lesson.title}</h3>
      {lesson.description && <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{lesson.description}</p>}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
        <span>
          {lesson.authorName}
          {lesson.publishedAt ? ` · ${formatDate(lesson.publishedAt)}` : lesson.scheduledFor ? ` · Plan: ${formatDate(lesson.scheduledFor)}` : ` · ${formatDate(lesson.updatedAt)}`}
        </span>
        {lesson.materialCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3 w-3" /> {lesson.materialCount} materyal
          </span>
        )}
        {lesson.hasNotes && (
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" /> ders notu
          </span>
        )}
        {lesson.status === "PUBLISHED" && <span>{lesson.viewCount} görüntüleme</span>}
      </p>
    </Link>
  );
}
