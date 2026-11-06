import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { assertUser, AuthError } from "@/lib/auth/dal";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/auth/rate-limit";
import { getAiSettings, recordUsage, wrapUntrusted } from "@/lib/ai/client";
import { getAssistantMode } from "@/lib/assistant/mode";
import { buildSearchAnswer, formatFaqBlock, SEARCH_MODE_MODEL, type FaqHit } from "@/lib/assistant/search-answer";
import { searchFaq } from "@/lib/queries/faq";
import { streamText, AiRequestError, type ChatTurn, type GenResult } from "@/lib/ai/provider";
import { QA_SYSTEM } from "@/lib/ai/prompts";
import { retrieve, formatContext, type RetrievedChunk } from "@/lib/ai/rag/retrieve";
import { getOwnedConversation, getRecentHistory } from "@/lib/queries/ai-chat";
import { lessonSourceIds } from "@/lib/queries/sources";
import { uuidSchema } from "@/lib/validation";
import { extractCitations, isInsufficientEvidence, INSUFFICIENT_TEXT } from "@/lib/ai/qa";

export const maxDuration = 300;

const bodySchema = z.object({
  conversationId: uuidSchema.optional().nullable(),
  message: z.string().trim().min(1, "Mesaj boş olamaz.").max(4000, "Mesaj en fazla 4000 karakter olabilir."),
  contextType: z.enum(schema.aiContextEnum.enumValues).optional(),
  contextId: uuidSchema.optional().nullable(),
});

const STREAM_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Kaynak temelli soru-cevap (akış). Yanıt yalnızca uzman onaylı kaynak parçalarına dayanır;
 * parça bulunamazsa (ve genel bilgi yedeği kapalıysa) model hiç çağrılmaz.
 *
 * Kipler (bkz. lib/assistant/mode.ts):
 * - "search": yapay zekâ yok/kapalı → SSS girdileri ve kaynak parçaları doğrudan alıntı olarak döner (sıfır maliyet).
 * - "ai": model yanıtı; model hata verirse (kota, model yok, ağ) aynı sorgu için arama yanıtına düşülür.
 */
export async function POST(req: NextRequest) {
  let user: Awaited<ReturnType<typeof assertUser>>;
  try {
    user = await assertUser();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message ?? "Geçersiz istek." : "Geçersiz istek.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!(await consumeRateLimit(`ai:${user.id}`, RATE_LIMITS.aiPerUser.limit, RATE_LIMITS.aiPerUser.window))) {
    return NextResponse.json({ error: "Saatlik yapay zekâ soru sınırına ulaştınız. Lütfen daha sonra tekrar deneyin." }, { status: 429 });
  }
  const { mode } = await getAssistantMode();
  const db = await getDb();

  // Sohbet: var olanın sahipliğini doğrula ya da yeni oluştur
  let conversation: typeof schema.aiConversations.$inferSelect;
  if (body.conversationId) {
    const owned = await getOwnedConversation(body.conversationId, user.id);
    if (!owned) return NextResponse.json({ error: "Sohbet bulunamadı." }, { status: 404 });
    conversation = owned;
  } else {
    const [row] = await db
      .insert(schema.aiConversations)
      .values({
        userId: user.id,
        title: body.message.slice(0, 60),
        contextType: body.contextType ?? "GENERAL",
        contextId: body.contextId ?? null,
      })
      .returning();
    conversation = row;
  }
  if (!conversation.title) {
    await db.update(schema.aiConversations).set({ title: body.message.slice(0, 60) }).where(eq(schema.aiConversations.id, conversation.id));
  }

  const settings = await getAiSettings();
  const history = await getRecentHistory(conversation.id, 12);

  // Kapsam: ders bağlamında dersin kaynakları; yoksa tüm onaylı kaynaklar
  let sourceIds: string[] | undefined;
  const ctxType = body.contextType ?? conversation.contextType;
  const ctxId = body.contextId ?? conversation.contextId;
  if (ctxType === "LESSON" && ctxId) {
    const ids = await lessonSourceIds(ctxId);
    if (ids.length) sourceIds = ids;
  }

  const [chunks, faqs] = await Promise.all([
    retrieve(body.message, { limit: settings.maxContextChunks, sourceIds }).catch((e) => {
      console.error("[asistan] retrieve", e);
      return [] as RetrievedChunk[];
    }),
    searchFaq(body.message, 3).catch((e) => {
      console.error("[asistan] faq", e);
      return [] as FaqHit[];
    }),
  ]);

  // Kullanıcı mesajını hemen kalıcılaştır
  await db.insert(schema.aiMessages).values({ conversationId: conversation.id, role: "user", content: body.message });

  const baseHeaders = { ...STREAM_HEADERS, "X-Conversation-Id": conversation.id };

  /** Yapay zekâsız yanıtı kalıcılaştırır ve döner (arama kipi veya model hatası sonrası geri düşüş). */
  async function persistSearchAnswer(reason?: string) {
    const answer = buildSearchAnswer(body.message, chunks, faqs, { reason });
    await db.insert(schema.aiMessages).values({
      conversationId: conversation.id,
      role: "assistant",
      content: answer.text,
      citations: answer.citations,
      insufficientEvidence: answer.insufficient,
      model: SEARCH_MODE_MODEL,
    });
    await db.update(schema.aiConversations).set({ updatedAt: new Date() }).where(eq(schema.aiConversations.id, conversation.id));
    return answer;
  }

  if (mode === "search") {
    const answer = await persistSearchAnswer();
    return new Response(answer.text, {
      headers: { ...baseHeaders, "X-Answer-Mode": "search", ...(answer.insufficient ? { "X-Insufficient-Evidence": "1" } : {}) },
    });
  }

  if (chunks.length === 0 && !settings.allowGeneralKnowledgeFallback) {
    if (faqs.length) {
      const answer = await persistSearchAnswer();
      return new Response(answer.text, { headers: { ...baseHeaders, "X-Answer-Mode": "search" } });
    }
    await db.insert(schema.aiMessages).values({
      conversationId: conversation.id,
      role: "assistant",
      content: INSUFFICIENT_TEXT,
      citations: [],
      insufficientEvidence: true,
    });
    await db.update(schema.aiConversations).set({ updatedAt: new Date() }).where(eq(schema.aiConversations.id, conversation.id));
    return new Response(INSUFFICIENT_TEXT, { headers: { ...baseHeaders, "X-Insufficient-Evidence": "1" } });
  }

  const { context, index } = formatContext(chunks);
  const userContent =
    chunks.length > 0
      ? `${context}\n\n${wrapUntrusted("kullanici", body.message)}`
      : `Bu soru için onaylı kaynaklarda parça bulunamadı. Yanıtın başında bunu açıkça belirt ve yanıtın genel tıbbi bilgiye dayandığını, uzman onayı gerektirdiğini söyle.\n\n${wrapUntrusted("kullanici", body.message)}`;

  const messages: ChatTurn[] = [...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })), { role: "user", content: userContent }];

  const encoder = new TextEncoder();
  const convId = conversation.id;
  const userId = user.id;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      let errorLine: string | null = null;
      let finalMessage: GenResult | null = null;
      const stream = streamText({ settings, maxTokens: 8000, system: QA_SYSTEM, messages, signal: req.signal });
      // Öğretim üyesi SSS yanıtları (varsa) model yanıtından önce, ayrı bir blok olarak gösterilir.
      const faqBlock = formatFaqBlock(faqs);
      const prefix = faqBlock ? `${faqBlock}\n### Yapay zekâ yanıtı\n` : "";
      if (prefix) controller.enqueue(encoder.encode(prefix));

      try {
        for await (const piece of stream.chunks) {
          text += piece;
          controller.enqueue(encoder.encode(piece));
        }
        finalMessage = await stream.final();
      } catch (e) {
        if (stream.aborted()) {
          errorLine = "Yanıt kullanıcı tarafından durduruldu.";
        } else {
          errorLine = e instanceof AiRequestError ? e.message : "Yapay zekâ yanıtı alınırken bir hata oluştu. Lütfen tekrar deneyin.";
          console.error("[asistan] stream", e);
          if (!text.trim()) {
            // Model hiç yanıt üretemedi (kota, model yok, ağ): aynı sorgu için yapay zekâsız arama yanıtına düş.
            try {
              const answer = await persistSearchAnswer(`Yapay zekâ şu anda yanıt veremedi (${errorLine}). Aşağıda kaynak arama sonuçları gösteriliyor.`);
              controller.enqueue(encoder.encode(answer.text));
            } catch (e2) {
              console.error("[asistan] fallback", e2);
              controller.enqueue(encoder.encode(`⚠ ${errorLine}`));
            } finally {
              try {
                controller.close();
              } catch {
                /* zaten kapalı */
              }
            }
            return;
          }
        }
        if (!stream.aborted()) controller.enqueue(encoder.encode(`${text ? "\n\n" : ""}⚠ ${errorLine}`));
      }

      try {
        const { text: renumbered, citations } = extractCitations(text, index);
        const insufficient = isInsufficientEvidence(renumbered, citations.length);
        const body = errorLine ? `${renumbered}${renumbered ? "\n\n" : ""}⚠ ${errorLine}` : renumbered;
        const content = `${prefix}${body}`;
        await db.insert(schema.aiMessages).values({
          conversationId: convId,
          role: "assistant",
          content: content || "(boş yanıt)",
          citations,
          insufficientEvidence: insufficient,
          model: finalMessage?.model ?? settings.model,
          inputTokens: finalMessage?.usage.input_tokens ?? null,
          outputTokens: finalMessage?.usage.output_tokens ?? null,
        });
        await db.update(schema.aiConversations).set({ updatedAt: new Date() }).where(eq(schema.aiConversations.id, convId));
        if (finalMessage) await recordUsage({ userId, feature: "qa", model: finalMessage.model, usage: finalMessage.usage });
      } catch (e) {
        console.error("[asistan] persist", e);
      } finally {
        try {
          controller.close();
        } catch {
          /* zaten kapalı */
        }
      }
    },
    cancel() {
      /* istemci bağlantıyı kesti; abort yukarıdaki dinleyiciyle yapılır */
    },
  });

  return new Response(readable, { headers: baseHeaders });
}
