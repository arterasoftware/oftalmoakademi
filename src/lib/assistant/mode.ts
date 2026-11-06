import "server-only";
import { aiAvailable, getAiSettings } from "@/lib/ai/client";

export type AssistantMode = "ai" | "search";

/**
 * Asistanın çalışma kipi:
 * - "ai": anahtar var ve yönetici kapatmamış → kaynak temelli yapay zekâ yanıtı (başarısız olursa aramaya düşer)
 * - "search": anahtar yok ya da yönetici "yalnızca kaynak arama" seçmiş → yapay zekâsız alıntı yanıtı
 */
export async function getAssistantMode(): Promise<{ mode: AssistantMode; reason: "no_key" | "admin" | null }> {
  const settings = await getAiSettings();
  if (settings.assistantMode === "search_only") return { mode: "search", reason: "admin" };
  if (!aiAvailable()) return { mode: "search", reason: "no_key" };
  return { mode: "ai", reason: null };
}
