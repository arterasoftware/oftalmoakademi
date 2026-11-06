import * as React from "react";

/**
 * Çok küçük, güvenli Markdown dönüştürücü: yalnızca **kalın**, madde (-, *, •) ve numaralı satırlar,
 * ### başlıklar. HTML hiçbir zaman yorumlanmaz (dangerouslySetInnerHTML yok); her şey React düğümü olarak üretilir.
 */
export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`} className={list.ordered ? "ml-5 list-decimal space-y-0.5" : "ml-5 list-disc space-y-0.5"}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d{1,2}[.)]\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,4}\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    if (numbered) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    if (heading) {
      blocks.push(
        <p key={`h${blocks.length}`} className="mt-2 font-semibold">
          {inline(heading[1])}
        </p>,
      );
      continue;
    }
    blocks.push(
      <p key={`p${blocks.length}`} className="whitespace-pre-wrap">
        {inline(line)}
      </p>,
    );
  }
  flushList();
  return <div className={className ?? "space-y-1.5 text-sm leading-relaxed"}>{blocks}</div>;
}

/** **kalın** ve [n] atıf numaralarını işaretler; diğer her şey düz metin. */
function inline(s: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|(\[\d{1,2}(?:\s*[,;–-]\s*\d{1,2})*\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2])
      out.push(
        <span key={k++} className="rounded bg-brand-50 px-1 text-xs font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-200">
          {m[2]}
        </span>,
      );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
