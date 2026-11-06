"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertUser, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { fail, success, type ActionResult } from "@/lib/action-result";
import { uuidSchema, shortText } from "@/lib/validation";

const contextSchema = z.object({
  contextType: z.enum(schema.aiContextEnum.enumValues).optional(),
  contextId: z.union([z.literal(""), uuidSchema]).optional(),
});

/** Boş bir sohbet oluşturur ve sohbet sayfasına yönlendirir. */
export async function createConversationAction(formData: FormData): Promise<void> {
  const user = await assertUser();
  const d = contextSchema.parse(Object.fromEntries(formData.entries()));
  const db = await getDb();
  const [row] = await db
    .insert(schema.aiConversations)
    .values({ userId: user.id, contextType: d.contextType ?? "GENERAL", contextId: d.contextId || null })
    .returning({ id: schema.aiConversations.id });
  revalidatePath("/asistan");
  redirect(`/asistan/${row.id}`);
}

const idSchema = z.object({ id: uuidSchema });

export async function deleteConversationAction(formData: FormData): Promise<void> {
  const user = await assertUser();
  const { id } = idSchema.parse(Object.fromEntries(formData.entries()));
  const db = await getDb();
  // Sahiplik koşulu where'de: başkasının sohbeti etkilenmez.
  const deleted = await db
    .delete(schema.aiConversations)
    .where(and(eq(schema.aiConversations.id, id), eq(schema.aiConversations.userId, user.id)))
    .returning({ id: schema.aiConversations.id });
  if (deleted.length) await audit(user.id, "ai.conversation.delete", { type: "ai_conversation", id });
  revalidatePath("/asistan");
  redirect("/asistan");
}

const renameSchema = z.object({ id: uuidSchema, title: shortText(120).min(1, "Başlık boş olamaz.") });

export async function renameConversationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await assertUser();
    const parsed = renameSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Geçersiz veri.");
    const db = await getDb();
    const updated = await db
      .update(schema.aiConversations)
      .set({ title: parsed.data.title, updatedAt: new Date() })
      .where(and(eq(schema.aiConversations.id, parsed.data.id), eq(schema.aiConversations.userId, user.id)))
      .returning({ id: schema.aiConversations.id });
    if (!updated.length) return fail("Sohbet bulunamadı.");
    revalidatePath("/asistan");
    revalidatePath(`/asistan/${parsed.data.id}`);
    return success(undefined, "Başlık güncellendi.");
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[ai-chat] rename", e);
    return fail("Başlık güncellenemedi.");
  }
}
