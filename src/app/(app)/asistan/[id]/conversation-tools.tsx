"use client";

import { useActionState, useState } from "react";
import { renameConversationAction, deleteConversationAction } from "@/lib/actions/ai-chat";
import { Button, Input, SubmitButton } from "@/components/ui";
import type { ActionResult } from "@/lib/action-result";

export function ConversationTools({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<ActionResult | null, FormData>(renameConversationAction, null);

  if (editing) {
    return (
      <form
        action={async (fd) => {
          await action(fd);
          setEditing(false);
        }}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="id" value={id} />
        <Input name="title" defaultValue={title} maxLength={120} required className="h-8 w-56 py-1 text-sm" aria-label="Sohbet başlığı" />
        <SubmitButton size="sm" variant="secondary">
          Kaydet
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Vazgeç
        </Button>
      </form>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {state && !state.ok && <span className="text-xs text-red-600">{state.error}</span>}
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
        Yeniden adlandır
      </Button>
      <form action={deleteConversationAction}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton size="sm" variant="danger">
          Sohbeti sil
        </SubmitButton>
      </form>
    </div>
  );
}
