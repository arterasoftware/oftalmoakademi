import "server-only";
import { getAiSettings, recordUsage, wrapUntrusted } from "./client";
import { generateText } from "./provider";
import { DISCUSSION_SUMMARY_SYSTEM } from "./prompts";
import { getDiscussion, type DiscussionTarget } from "@/lib/queries/discussion";

/**
 * Bir tartışmanın (ders/makale/olgu yorumları) önemli noktalarını özetler.
 * Çıktı uzman görüşünün yerine geçmez; çağıran taraf bunu "yapay zekâ özeti" olarak etiketlemelidir.
 */
export async function summarizeDiscussion(opts: { targetType: DiscussionTarget; targetId: string; contextTitle: string; requestedBy: string }) {
  const comments = await getDiscussion(opts.targetType, opts.targetId);
  const flat: string[] = [];
  const walk = (list: typeof comments, depth: number) => {
    for (const c of list) {
      const who = c.isAi ? "Yapay zekâ" : c.author ? `${c.author.name} (${c.author.role === "RESIDENT" ? "asistan" : "öğretim üyesi"})` : "Silinmiş kullanıcı";
      flat.push(`${"  ".repeat(depth)}- ${who}${c.isFacultyCorrection ? " [DÜZELTME]" : ""}${c.isPinned ? " [ÖNE ÇIKARILDI]" : ""}: ${c.body || "(sesli yorum; metin yok)"}${c.audio && c.body ? " [sesli ek var]" : ""}`);
      walk(c.replies, depth + 1);
    }
  };
  walk(comments, 0);
  if (flat.length === 0) return { summary: "Özetlenecek yorum yok.", usage: null };

  const settings = await getAiSettings();
  const message = await generateText({
    settings: { ...settings, effort: "low" },
    maxTokens: 4000,
    system: DISCUSSION_SUMMARY_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Konu: ${opts.contextTitle}\n\n${wrapUntrusted("belge", flat.join("\n").slice(0, 60_000))}\n\nBu tartışmayı özetle.`,
      },
    ],
  });
  await recordUsage({ userId: opts.requestedBy, feature: "discussion_summary", model: message.model, usage: message.usage });
  return { summary: message.text, usage: message.usage };
}
