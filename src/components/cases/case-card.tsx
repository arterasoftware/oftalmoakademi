import Link from "next/link";
import { MessageCircle, Image as ImageIcon, Mic, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import type { CaseListItem } from "@/lib/queries/cases";
import { relativeTime } from "@/lib/utils";

export function CaseCard({ item, showAuthor }: { item: CaseListItem; showAuthor?: boolean }) {
  return (
    <Link
      href={`/olgular/${item.id}`}
      className="flex gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      {item.coverFileId && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/dosya/${item.coverFileId}`} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl border border-border object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{SUBSPECIALTY_LABELS[item.subspecialty]}</Badge>
          {item.status === "HIDDEN" && (
            <Badge tone="warning">
              <EyeOff className="h-3 w-3" /> Gizlendi
            </Badge>
          )}
        </div>
        <h3 className="mt-1.5 line-clamp-2 text-base font-semibold text-ink">{item.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{item.excerpt}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" /> {item.commentCount}
          </span>
          {item.imageCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="h-3.5 w-3.5" /> {item.imageCount}
            </span>
          )}
          {item.hasAudio && (
            <span className="inline-flex items-center gap-1">
              <Mic className="h-3.5 w-3.5" /> ses
            </span>
          )}
          <span className="ml-auto">
            {showAuthor && item.authorName ? `${item.authorName} · ` : ""}
            {relativeTime(item.publishedAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}
