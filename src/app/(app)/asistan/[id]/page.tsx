import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { getAssistantMode } from "@/lib/assistant/mode";
import { uuidSchema } from "@/lib/validation";
import { getOwnedConversation, getConversationMessages } from "@/lib/queries/ai-chat";
import { Chat } from "@/components/assistant/chat";
import { AssistantShell } from "../assistant-shell";
import { ConversationTools } from "./conversation-tools";

export const metadata = { title: "Sohbet · YZ Asistanı" };

export default async function ConversationPage({ params }: PageProps<"/asistan/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  // Sahiplik: başkasının sohbeti 404 döner (varlığı sızdırılmaz)
  const conv = await getOwnedConversation(id, user.id);
  if (!conv) notFound();
  const [messages, { mode }] = await Promise.all([getConversationMessages(conv.id), getAssistantMode()]);

  return (
    <AssistantShell userId={user.id} activeId={conv.id} actions={<ConversationTools id={conv.id} title={conv.title ?? ""} />}>
      <Chat conversationId={conv.id} initialMessages={messages} mode={mode} contextType={conv.contextType} contextId={conv.contextId} />
    </AssistantShell>
  );
}
