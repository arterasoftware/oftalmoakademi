import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Notification } from "@/db/schema";

/** Kullanıcının bildirimleri, en yeni önce. */
export async function listNotifications(userId: string, limit = 100): Promise<Notification[]> {
  const db = await getDb();
  return db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt)).limit(limit);
}
