import { PageHeader, Alert } from "@/components/ui";
import { ConversationList } from "@/components/assistant/conversation-list";
import { listConversations } from "@/lib/queries/ai-chat";
import { approvedReadySourceCount } from "@/lib/queries/sources";
import { publishedFaqCount } from "@/lib/queries/faq";
import { getAssistantMode } from "@/lib/assistant/mode";
import Link from "next/link";

/** Asistan sayfalarının ortak iskeleti: başlık, sol sohbet listesi, ana alan. */
export async function AssistantShell({ userId, activeId, children, actions }: { userId: string; activeId: string | null; children: React.ReactNode; actions?: React.ReactNode }) {
  const [items, sourceCount, faqCount, { mode, reason }] = await Promise.all([listConversations(userId), approvedReadySourceCount(), publishedFaqCount(), getAssistantMode()]);
  return (
    <>
      <PageHeader
        title={mode === "ai" ? "YZ Asistanı" : "Kaynak Asistanı"}
        description={
          mode === "ai"
            ? `Uzman onaylı ${sourceCount} kaynağa ve ${faqCount} öğretim üyesi yanıtına dayanan soru-cevap. Yanıtlar eğitim amaçlıdır.`
            : `Yapay zekâsız kaynak arama: ${sourceCount} onaylı kaynak ve ${faqCount} öğretim üyesi yanıtı doğrudan alıntılanır.`
        }
        actions={actions}
      />
      {mode === "search" && (
        <Alert tone="info" className="mb-4" title="Kaynak arama kipi (yapay zekâ kapalı)">
          {reason === "admin"
            ? "Yönetici asistanı yalnızca kaynak arama kipinde çalıştırıyor; hiçbir dış servis çağrılmaz, maliyet oluşmaz."
            : "Yapay zekâ anahtarı tanımlı değil; asistan kaynak arama kipinde çalışır, hiçbir dış servis çağrılmaz."}{" "}
          Sorular, onaylı kaynaklardaki ilgili bölümler ve{" "}
          <Link href="/sss" className="underline">
            sık sorulan sorular
          </Link>{" "}
          üzerinden yanıtlanır.
        </Alert>
      )}
      {sourceCount === 0 && faqCount === 0 && (
        <Alert tone="warning" className="mb-4">
          Henüz uzman onaylı kaynak veya yayımlanmış SSS yanıtı yok. Asistan sorulara &quot;Kaynak yetersiz&quot; yanıtı verir.
        </Alert>
      )}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_1fr]">
        <ConversationList items={items} activeId={activeId} />
        <section className="min-w-0">{children}</section>
      </div>
    </>
  );
}
