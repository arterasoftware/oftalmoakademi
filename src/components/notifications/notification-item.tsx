import type { Notification } from "@/db/schema";
import { markReadAction, openNotificationAction } from "@/lib/actions/notifications";
import { relativeTime, cn } from "@/lib/utils";

const TYPE_LABELS: Record<Notification["type"], string> = {
  LESSON_PUBLISHED: "Ders",
  ARTICLE_PUBLISHED: "Makale",
  CASE_PUBLISHED: "Olgu",
  CASE_REVEALED: "Olgu",
  EXAM_SCHEDULED: "Sınav",
  EXAM_RESULTS: "Sınav sonucu",
  COMMENT_REPLY: "Yanıt",
  CONTENT_RETURNED: "İnceleme",
  CONTENT_APPROVED: "Onay",
  REVIEW_REQUESTED: "İnceleme",
  SYSTEM: "Sistem",
};

export function NotificationItem({ n }: { n: Notification }) {
  const unread = !n.readAt;
  return (
    <li className={cn("rounded-2xl border px-4 py-3", unread ? "border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/40" : "border-border bg-surface")}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", unread ? "bg-brand-600" : "bg-transparent")} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
            <span className="font-medium uppercase tracking-wide">{TYPE_LABELS[n.type]}</span>
            <span>·</span>
            <time dateTime={n.createdAt.toISOString()}>{relativeTime(n.createdAt)}</time>
            {unread && <span className="sr-only">Okunmadı</span>}
          </div>
          {n.link ? (
            <form action={openNotificationAction}>
              <input type="hidden" name="id" value={n.id} />
              <button type="submit" className={cn("mt-0.5 text-left text-sm hover:underline", unread ? "font-semibold text-ink" : "font-medium text-ink")}>
                {n.title}
              </button>
            </form>
          ) : (
            <p className={cn("mt-0.5 text-sm", unread ? "font-semibold text-ink" : "font-medium text-ink")}>{n.title}</p>
          )}
          {n.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-muted">{n.body}</p>}
        </div>
        {unread && (
          <form action={markReadAction}>
            <input type="hidden" name="id" value={n.id} />
            <button type="submit" className="shrink-0 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink">
              Okundu
            </button>
          </form>
        )}
      </div>
    </li>
  );
}
