import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type ConversationListItem = {
  id: string;
  title: string | null;
  contextType: (typeof schema.aiContextEnum.enumValues)[number];
  updatedAt: Date;
};

/** Kullanıcının kendi sohbetleri (en yeni üstte). Yöneticiler dâhil kimse başkasının sohbetini listeleyemez. */
export async function listConversations(userId: string, limit = 50): Promise<ConversationListItem[]> {
  const db = await getDb();
  return db
    .select({
      id: schema.aiConversations.id,
      title: schema.aiConversations.title,
      contextType: schema.aiConversations.contextType,
      updatedAt: schema.aiConversations.updatedAt,
    })
    .from(schema.aiConversations)
    .where(eq(schema.aiConversations.userId, userId))
    .orderBy(desc(schema.aiConversations.updatedAt))
    .limit(limit);
}

/** Sahiplik doğrulamalı sohbet getirme: başkasının sohbeti -> null. */
export async function getOwnedConversation(conversationId: string, userId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.aiConversations)
    .where(and(eq(schema.aiConversations.id, conversationId), eq(schema.aiConversations.userId, userId)))
    .limit(1);
  return row ?? null;
}

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: schema.AiCitation[] | null;
  insufficientEvidence: boolean;
  /** "ai": model yanıtı · "search": yapay zekâsız kaynak arama yanıtı */
  kind: "ai" | "search";
  createdAt: Date;
};

const SEARCH_MODEL = "kaynak-arama";

export async function getConversationMessages(conversationId: string, limit = 200): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.aiMessages.id,
      role: schema.aiMessages.role,
      content: schema.aiMessages.content,
      citations: schema.aiMessages.citations,
      insufficientEvidence: schema.aiMessages.insufficientEvidence,
      model: schema.aiMessages.model,
      createdAt: schema.aiMessages.createdAt,
    })
    .from(schema.aiMessages)
    .where(eq(schema.aiMessages.conversationId, conversationId))
    .orderBy(asc(schema.aiMessages.createdAt))
    .limit(limit);
  return rows.map(({ model, ...r }) => ({ ...r, role: r.role === "assistant" ? "assistant" : "user", kind: model === SEARCH_MODEL ? "search" : "ai" }));
}

/** Modele verilecek son N mesaj (kronolojik). */
export async function getRecentHistory(conversationId: string, n = 12): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const db = await getDb();
  const rows = await db
    .select({ role: schema.aiMessages.role, content: schema.aiMessages.content })
    .from(schema.aiMessages)
    .where(eq(schema.aiMessages.conversationId, conversationId))
    .orderBy(desc(schema.aiMessages.createdAt))
    .limit(n);
  return rows.reverse().map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.content }));
}
