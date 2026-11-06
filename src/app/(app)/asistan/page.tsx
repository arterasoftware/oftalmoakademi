import { requireUser } from "@/lib/auth/dal";
import { getAssistantMode } from "@/lib/assistant/mode";
import { Chat } from "@/components/assistant/chat";
import { AssistantShell } from "./assistant-shell";

export const metadata = { title: "YZ Asistanı" };

export default async function AssistantPage() {
  const user = await requireUser();
  const { mode } = await getAssistantMode();
  return (
    <AssistantShell userId={user.id} activeId={null}>
      <Chat conversationId={null} initialMessages={[]} mode={mode} />
    </AssistantShell>
  );
}
