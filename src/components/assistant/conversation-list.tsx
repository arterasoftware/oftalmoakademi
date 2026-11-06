import Link from "next/link";
import { createConversationAction } from "@/lib/actions/ai-chat";
import { SubmitButton } from "@/components/ui";
import type { ConversationListItem } from "@/lib/queries/ai-chat";
import { relativeTime, cn } from "@/lib/utils";

const CTX_LABEL: Record<ConversationListItem["contextType"], string | null> = {
  GENERAL: null,
  LESSON: "Ders",
  CASE: "Olgu",
  ARTICLE: "Makale",
};

export function ConversationList({ items, activeId }: { items: ConversationListItem[]; activeId: string | null }) {
  return (
    <aside className="flex min-w-0 flex-col gap-3">
      <form action={createConversationAction}>
        <SubmitButton variant="secondary" className="w-full">
          + Yeni sohbet
        </SubmitButton>
      </form>
      {items.length === 0 ? (
        <p className="px-1 text-xs text-ink-muted">Henüz sohbet yok.</p>
      ) : (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {items.map((c) => (
            <li key={c.id} className="shrink-0 lg:shrink">
              <Link
                href={`/asistan/${c.id}`}
                className={cn(
                  "block max-w-[220px] rounded-xl border px-3 py-2 text-sm lg:max-w-none",
                  c.id === activeId ? "border-brand-300 bg-brand-50 text-brand-900 dark:bg-brand-950 dark:text-brand-100" : "border-border bg-surface text-ink hover:bg-surface-muted",
                )}
              >
                <span className="block truncate font-medium">{c.title || "Adsız sohbet"}</span>
                <span className="block text-xs text-ink-muted">
                  {CTX_LABEL[c.contextType] ? `${CTX_LABEL[c.contextType]} · ` : ""}
                  {relativeTime(c.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
