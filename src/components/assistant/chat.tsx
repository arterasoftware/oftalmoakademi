"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AiBadge, Badge, Alert, Button, Textarea } from "@/components/ui";
import type { ChatMessage } from "@/lib/queries/ai-chat";
import type { AiCitation } from "@/db/schema";
import { MarkdownLite } from "./markdown-lite";

type Props = {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  /** "ai": yapay zekâ yanıtı · "search": yapay zekâsız kaynak arama (SSS + kaynak alıntıları) */
  mode: "ai" | "search";
  contextType?: "GENERAL" | "LESSON" | "CASE" | "ARTICLE";
  contextId?: string | null;
};

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: AiCitation[] | null;
  insufficientEvidence: boolean;
  kind: "ai" | "search";
  streaming?: boolean;
};

export function Chat({ conversationId, initialMessages, mode, contextType, contextId }: Props) {
  const router = useRouter();
  // Kalıcı mesajlar sunucudan gelir; akış sırasında eklenenler "pending" listesinde tutulur.
  const [pending, setPending] = useState<LocalMessage[]>([]);
  const [prevInitial, setPrevInitial] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sunucudan yenilenen (kalıcı) mesajlar geldiğinde geçici listeyi temizle (render sırasında durum uyarlama)
  if (initialMessages !== prevInitial) {
    setPrevInitial(initialMessages);
    if (!busy) setPending([]);
  }
  const messages: LocalMessage[] = [...initialMessages, ...pending];
  const setMessages = (fn: (prev: LocalMessage[]) => LocalMessage[]) => setPending(fn);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setBusy(true);
    setInput("");
    const userMsg: LocalMessage = { id: `tmp-u-${Date.now()}`, role: "user", content: text, citations: null, insufficientEvidence: false, kind: "ai" };
    const asstId = `tmp-a-${Date.now()}`;
    setMessages((prev) => [...prev, userMsg, { id: asstId, role: "assistant", content: "", citations: null, insufficientEvidence: false, kind: mode, streaming: true }]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/asistan/sohbet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text, contextType, contextId: contextId ?? undefined }),
        signal: controller.signal,
      });
      if (!res.ok) {
        let msg = "İstek başarısız oldu.";
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* gövde yok */
        }
        setMessages((prev) => prev.filter((m) => m.id !== asstId));
        setError(msg);
        setInput(text);
        return;
      }
      const newConvId = res.headers.get("X-Conversation-Id");
      const insufficientHeader = res.headers.get("X-Insufficient-Evidence") === "1";
      const answerKind: "ai" | "search" = res.headers.get("X-Answer-Mode") === "search" ? "search" : "ai";
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          const snapshot = acc;
          setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, content: snapshot } : m)));
        }
        acc += decoder.decode();
      }
      setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, content: acc, streaming: false, insufficientEvidence: insufficientHeader, kind: answerKind } : m)));

      if (!conversationId && newConvId) {
        startTransition(() => router.push(`/asistan/${newConvId}`));
      } else {
        startTransition(() => router.refresh());
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, streaming: false } : m)));
        startTransition(() => router.refresh());
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== asstId));
        setError("Bağlantı hatası. Lütfen tekrar deneyin.");
        setInput(text);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-[60vh] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 py-2">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-ink-muted">
            <p className="font-medium text-ink">Kaynak temelli soru-cevap</p>
            <p className="mt-1">
              {mode === "ai"
                ? "Sorunuzu yazın; asistan yalnızca uzman onaylı kaynaklardaki parçalara dayanarak yanıtlar ve her iddia için kaynak numarası verir."
                : "Sorunuzu yazın; asistan öğretim üyelerinin sık sorulan soru yanıtlarını ve onaylı kaynaklardaki ilgili bölümleri sayfa numarasıyla, doğrudan alıntı olarak listeler."}
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 border-t border-border bg-surface-muted pt-3">
        {error && (
          <Alert tone="danger" className="mb-2">
            {error}
          </Alert>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Sorunuzu yazın… (Enter: gönder, Shift+Enter: yeni satır)"
            rows={2}
            maxLength={4000}
            disabled={busy}
            className="min-h-12 flex-1"
            aria-label="Mesaj"
          />
          {busy ? (
            <Button type="button" variant="outline" onClick={() => abortRef.current?.abort()}>
              Durdur
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()}>
              Gönder
            </Button>
          )}
        </form>
        <p className="mt-2 text-xs text-ink-muted">
          {mode === "ai"
            ? "Yanıtlar yalnızca uzman onaylı kaynaklara dayanır ve eğitim amaçlıdır; klinik karar aracı değildir."
            : "Kaynak arama kipi: yapay zekâ kullanılmaz; sonuçlar onaylı kaynaklardan ve öğretim üyesi yanıtlarından doğrudan alıntıdır. Eğitim amaçlıdır."}
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message: m }: { message: LocalMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white">
          <p className="whitespace-pre-wrap">{m.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2 rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-ink">
        <div className="flex flex-wrap items-center gap-1.5">
          {m.kind === "search" ? (
            <Badge tone="info" title="Yapay zekâ kullanılmadı; içerik onaylı kaynaklardan ve öğretim üyesi yanıtlarından doğrudan alıntıdır.">
              Kaynak arama · yapay zekâsız
            </Badge>
          ) : (
            <AiBadge label="Yapay zekâ yanıtı" />
          )}
          {m.insufficientEvidence && !m.streaming && <Badge tone="warning">Kaynak yetersiz</Badge>}
        </div>
        {m.content ? (
          <MarkdownLite text={m.content} />
        ) : (
          <p className="text-sm text-ink-muted">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-ink-faint" /> Kaynaklar taranıyor…
          </p>
        )}
        {m.citations && m.citations.length > 0 && (
          <div className="border-t border-border pt-2">
            <p className="text-xs font-medium text-ink-muted">Kaynaklar</p>
            <ol className="mt-1 space-y-0.5 text-xs text-ink-muted">
              {m.citations.map((c, i) => (
                <li key={c.chunkId} title={c.excerpt}>
                  <span className="font-medium text-ink">[{i + 1}]</span> {c.title}
                  {c.page ? `, s. ${c.page}` : ""}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
