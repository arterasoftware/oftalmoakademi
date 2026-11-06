import { getDiscussion, getDiscussionLock, type DiscussionTarget } from "@/lib/queries/discussion";
import { requireUser, isStaff } from "@/lib/auth/dal";
import { CommentForm } from "./comment-form";
import { CommentItem } from "./comment-item";
import { setDiscussionLockAction } from "@/lib/actions/discussion";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/**
 * Ders / makale / olgu altındaki ortak tartışma alanı (sunucu bileşeni).
 * `path`: yorum sonrası yenilenecek sayfa yolu.
 */
export async function Discussion({ targetType, targetId, path, title = "Tartışma" }: { targetType: DiscussionTarget; targetId: string; path: string; title?: string }) {
  const user = await requireUser();
  const [comments, locked] = await Promise.all([getDiscussion(targetType, targetId), getDiscussionLock(targetType, targetId)]);
  const staff = isStaff(user.role);
  const total = countAll(comments);

  return (
    <section id="tartisma" className="mt-8" aria-labelledby="tartisma-baslik">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="tartisma-baslik" className="text-lg font-semibold text-ink">
          {title} <span className="text-sm font-normal text-ink-muted">({total})</span>
        </h2>
        {staff && (
          <form action={setDiscussionLockAction}>
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="path" value={path} />
            <input type="hidden" name="lock" value={locked ? "0" : "1"} />
            <Button type="submit" variant="outline" size="sm">
              {locked ? "Tartışmayı yeniden aç" : "Tartışmayı sonlandır"}
            </Button>
          </form>
        )}
      </div>

      {locked ? (
        <Alert tone="info">Bu tartışma öğretim üyesi tarafından sonlandırıldı. Yeni yorum eklenemez.</Alert>
      ) : (
        <CommentForm targetType={targetType} targetId={targetId} path={path} canMarkCorrection={staff} />
      )}

      <div className="mt-5 space-y-4">
        {comments.length === 0 && <p className="text-sm text-ink-muted">Henüz yorum yok. İlk soruyu siz sorun.</p>}
        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} currentUserId={user.id} isStaff={staff} targetType={targetType} targetId={targetId} path={path} locked={locked} />
        ))}
      </div>
    </section>
  );
}

function countAll(list: { replies: unknown[] }[]): number {
  return list.reduce((n, c) => n + 1 + countAll(c.replies as { replies: unknown[] }[]), 0);
}
