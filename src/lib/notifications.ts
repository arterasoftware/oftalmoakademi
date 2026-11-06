import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { UserRole } from "@/db/schema";

type NotificationType = (typeof schema.notificationTypeEnum.enumValues)[number];

export async function notifyUsers(
  userIds: string[],
  n: { type: NotificationType; title: string; body?: string; link?: string },
) {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (ids.length === 0) return;
  const db = await getDb();
  await db.insert(schema.notifications).values(
    ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null })),
  );
}

/** Belirli rollerdeki tüm aktif kullanıcılara bildirim. */
export async function notifyRoles(
  roles: UserRole[],
  n: { type: NotificationType; title: string; body?: string; link?: string },
  excludeUserId?: string,
) {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(inArray(schema.users.role, roles), eq(schema.users.status, "ACTIVE")));
  await notifyUsers(
    rows.map((r) => r.id).filter((id) => id !== excludeUserId),
    n,
  );
}

export async function unreadCount(userId: string): Promise<number> {
  const db = await getDb();
  const { count, isNull } = await import("drizzle-orm");
  const [row] = await db
    .select({ c: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return Number(row?.c ?? 0);
}
