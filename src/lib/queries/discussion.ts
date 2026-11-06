import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type DiscussionTarget = (typeof schema.discussionTargetEnum.enumValues)[number];

export type CommentView = {
  id: string;
  parentId: string | null;
  body: string;
  isAi: boolean;
  aiCitations: NonNullable<typeof schema.comments.$inferSelect.aiCitations> | null;
  isPinned: boolean;
  isFacultyCorrection: boolean;
  /** Sesli yorum eki (varsa) */
  audio: { fileId: string; durationSec: number | null } | null;
  /** Görsel ekleri (varsa) */
  images: { fileId: string; width: number | null; height: number | null }[];
  createdAt: Date;
  editedAt: Date | null;
  author: { id: string; name: string; title: string | null; role: schema.UserRole } | null;
  replies: CommentView[];
};

/** Hedefe ait yorumları ağaç yapısında döndürür (silinenler hariç). Sabitlenenler en üstte. */
export async function getDiscussion(targetType: DiscussionTarget, targetId: string): Promise<CommentView[]> {
  const db = await getDb();
  const rows = await db
    .select({ c: schema.comments, u: { id: schema.users.id, name: schema.users.name, title: schema.users.title, role: schema.users.role } })
    .from(schema.comments)
    .leftJoin(schema.users, eq(schema.comments.authorId, schema.users.id))
    .where(and(eq(schema.comments.targetType, targetType), eq(schema.comments.targetId, targetId), isNull(schema.comments.deletedAt)))
    .orderBy(asc(schema.comments.createdAt));

  const imgRows = rows.length
    ? await db
        .select({ commentId: schema.commentImages.commentId, fileId: schema.commentImages.fileId, order: schema.commentImages.order, width: schema.files.width, height: schema.files.height })
        .from(schema.commentImages)
        .innerJoin(schema.files, eq(schema.commentImages.fileId, schema.files.id))
        .where(inArray(schema.commentImages.commentId, rows.map((r) => r.c.id)))
        .orderBy(asc(schema.commentImages.order))
    : [];
  const imagesByComment = new Map<string, CommentView["images"]>();
  for (const i of imgRows) (imagesByComment.get(i.commentId) ?? imagesByComment.set(i.commentId, []).get(i.commentId)!).push({ fileId: i.fileId, width: i.width, height: i.height });

  const map = new Map<string, CommentView>();
  for (const { c, u } of rows) {
    map.set(c.id, {
      id: c.id,
      parentId: c.parentId,
      body: c.body,
      isAi: c.isAi,
      aiCitations: c.aiCitations,
      isPinned: c.isPinned,
      isFacultyCorrection: c.isFacultyCorrection,
      audio: c.audioFileId ? { fileId: c.audioFileId, durationSec: c.audioDurationSec } : null,
      images: imagesByComment.get(c.id) ?? [],
      createdAt: c.createdAt,
      editedAt: c.editedAt,
      author: u?.id ? { id: u.id, name: u.name, title: u.title, role: u.role } : null,
      replies: [],
    });
  }
  const roots: CommentView[] = [];
  for (const v of map.values()) {
    if (v.parentId && map.has(v.parentId)) map.get(v.parentId)!.replies.push(v);
    else roots.push(v);
  }
  roots.sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || a.createdAt.getTime() - b.createdAt.getTime());
  return roots;
}

export async function getDiscussionLock(targetType: DiscussionTarget, targetId: string): Promise<boolean> {
  const db = await getDb();
  if (targetType === "LESSON") {
    const [r] = await db.select({ l: schema.lessons.discussionLocked }).from(schema.lessons).where(eq(schema.lessons.id, targetId));
    return r?.l ?? false;
  }
  if (targetType === "ARTICLE") {
    const [r] = await db.select({ l: schema.articles.discussionLocked }).from(schema.articles).where(eq(schema.articles.id, targetId));
    return r?.l ?? false;
  }
  const [r] = await db.select({ l: schema.clinicalCases.discussionLocked }).from(schema.clinicalCases).where(eq(schema.clinicalCases.id, targetId));
  return r?.l ?? false;
}
