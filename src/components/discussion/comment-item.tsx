"use client";

import { useState } from "react";
import { Pin, Reply, Trash2, CheckCircle2, Mic } from "lucide-react";
import { fmtDur } from "@/components/audio/audio-recorder";
import { Badge, AiBadge } from "@/components/ui/badge";
import { cn, initials, relativeTime } from "@/lib/utils";
import { CommentForm } from "./comment-form";
import { deleteCommentAction, togglePinCommentAction } from "@/lib/actions/discussion";
import type { CommentView, DiscussionTarget } from "@/lib/queries/discussion";

const ROLE: Record<string, string> = { ADMIN: "Yönetici", FACULTY: "Öğretim Üyesi", RESIDENT: "Asistan" };

export function CommentItem({
  comment,
  currentUserId,
  isStaff,
  targetType,
  targetId,
  path,
  locked,
  depth = 0,
}: {
  comment: CommentView;
  currentUserId: string;
  isStaff: boolean;
  targetType: DiscussionTarget;
  targetId: string;
  path: string;
  locked: boolean;
  depth?: number;
}) {
  const [replying, setReplying] = useState(false);
  const a = comment.author;
  const faculty = a?.role === "FACULTY" || a?.role === "ADMIN";
  const own = a?.id === currentUserId;

  return (
    <article
      id={`yorum-${comment.id}`}
      className={cn(
        "rounded-2xl border bg-surface p-4",
        comment.isPinned ? "border-brand-300 ring-1 ring-brand-200" : "border-border",
        comment.isFacultyCorrection && "border-emerald-300",
        depth > 0 && "ml-4 sm:ml-8",
      )}
    >
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <span className={cn("grid h-8 w-8 place-items-center rounded-full text-xs font-semibold", comment.isAi ? "bg-violet-100 text-violet-700" : faculty ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-700")}>
          {comment.isAi ? "✦" : initials(a?.name ?? "?")}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {comment.isAi ? "Yapay Zekâ Asistanı" : `${a?.title ? a.title + " " : ""}${a?.name ?? "Silinmiş kullanıcı"}`}
          </p>
          <p className="text-xs text-ink-muted">
            {!comment.isAi && a && ROLE[a.role]} · <time dateTime={comment.createdAt.toISOString()}>{relativeTime(comment.createdAt)}</time>
            {comment.editedAt && " · düzenlendi"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {comment.isAi && <AiBadge label="Yapay zekâ yanıtı" />}
          {comment.isFacultyCorrection && (
            <Badge tone="success">
              <CheckCircle2 className="h-3 w-3" /> Öğretim üyesi düzeltmesi
            </Badge>
          )}
          {comment.isPinned && (
            <Badge tone="brand">
              <Pin className="h-3 w-3" /> Öne çıkarıldı
            </Badge>
          )}
        </div>
      </header>

      {comment.body && <div className="prose-oa mt-3 whitespace-pre-wrap text-sm text-ink">{comment.body}</div>}

      {comment.audio && (
        <div className="mt-3">
          <Badge tone="neutral" className="mb-1.5">
            <Mic className="h-3 w-3" /> Sesli yorum{comment.audio.durationSec !== null ? ` · ${fmtDur(comment.audio.durationSec)}` : ""}
          </Badge>
          <audio controls preload="metadata" src={`/api/dosya/${comment.audio.fileId}`} className="w-full" />
        </div>
      )}

      {comment.images.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {comment.images.map((img, i) => (
            <li key={img.fileId}>
              <a href={`/api/dosya/${img.fileId}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border bg-surface-muted" aria-label={`Görsel ${i + 1}, yeni sekmede aç`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/dosya/${img.fileId}`} alt={`Yorum görseli ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}

      {comment.aiCitations && comment.aiCitations.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
          {comment.aiCitations.map((c, i) => (
            <li key={c.chunkId ?? i}>
              [{i + 1}] {c.title}
              {c.page ? `, s. ${c.page}` : ""}
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-1">
        {!locked && depth < 3 && (
          <button type="button" onClick={() => setReplying((v) => !v)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink">
            <Reply className="h-3.5 w-3.5" /> Yanıtla
          </button>
        )}
        {isStaff && (
          <form action={togglePinCommentAction}>
            <input type="hidden" name="id" value={comment.id} />
            <input type="hidden" name="path" value={path} />
            <button type="submit" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink">
              <Pin className="h-3.5 w-3.5" /> {comment.isPinned ? "Öne çıkarmayı kaldır" : "Öne çıkar"}
            </button>
          </form>
        )}
        {(own || isStaff) && (
          <form
            action={deleteCommentAction}
            onSubmit={(e) => {
              if (!confirm("Bu yorum silinsin mi?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={comment.id} />
            <input type="hidden" name="path" value={path} />
            <button type="submit" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-muted hover:bg-red-50 hover:text-red-700">
              <Trash2 className="h-3.5 w-3.5" /> Sil
            </button>
          </form>
        )}
      </footer>

      {replying && (
        <div className="mt-3">
          <CommentForm targetType={targetType} targetId={targetId} path={path} parentId={comment.id} canMarkCorrection={isStaff} compact onDone={() => setReplying(false)} />
        </div>
      )}

      {comment.replies.length > 0 && (
        <div className="mt-3 space-y-3">
          {comment.replies.map((r) => (
            <CommentItem key={r.id} comment={r} currentUserId={currentUserId} isStaff={isStaff} targetType={targetType} targetId={targetId} path={path} locked={locked} depth={depth + 1} />
          ))}
        </div>
      )}
    </article>
  );
}
