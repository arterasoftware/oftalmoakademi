"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { assertUser } from "@/lib/auth/dal";
import { uuidSchema } from "@/lib/validation";

async function markRead(userId: string, id: string) {
  const db = await getDb();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
}

/** Tek bildirimi okundu işaretler (yalnızca sahibi). */
export async function markReadAction(formData: FormData): Promise<void> {
  const user = await assertUser();
  const parsed = uuidSchema.safeParse(formData.get("id"));
  if (!parsed.success) return;
  await markRead(user.id, parsed.data);
  revalidatePath("/bildirimler");
  revalidatePath("/", "layout");
}

/** Bildirimi okundu işaretleyip bağlantısına yönlendirir. */
export async function openNotificationAction(formData: FormData): Promise<void> {
  const user = await assertUser();
  const parsed = uuidSchema.safeParse(formData.get("id"));
  if (!parsed.success) redirect("/bildirimler");
  const db = await getDb();
  const [n] = await db
    .select({ link: schema.notifications.link })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.id, parsed.data), eq(schema.notifications.userId, user.id)))
    .limit(1);
  if (!n) redirect("/bildirimler");
  await markRead(user.id, parsed.data);
  revalidatePath("/bildirimler");
  revalidatePath("/", "layout");
  // Yalnızca uygulama içi göreli bağlantılara yönlendir (açık yönlendirme koruması)
  const link = n.link && /^\/(?!\/)/.test(n.link) ? n.link : "/bildirimler";
  redirect(link);
}

export async function markAllReadAction(): Promise<void> {
  const user = await assertUser();
  const db = await getDb();
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
  revalidatePath("/bildirimler");
  revalidatePath("/", "layout");
}
