import * as React from "react";

/**
 * Çok küçük, güvenli Markdown alt kümesi -> React.
 * Desteklenen: başlıklar (#, ##, ###), madde listeleri (-, *, •), numaralı listeler (1. / 1)),
 * kalın (**metin**), satır içi kod (`kod`). HTML asla yorumlanmaz; her şey metin düğümü olarak çizilir.
 */

type Block =
  | { type: "h"; level: 2 | 3 | 4; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "p", text: para.join(" ") });
      para = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (h) {
      flushPara();
      const level = (Math.min(h[1].length, 3) + 1) as 2 | 3 | 4;
      blocks.push({ type: "h", level, text: h[2].trim() });
      continue;
    }
    const ul = /^\s*[-*•]\s+(.+)$/.exec(line);
    if (ul) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.type === "ul") last.items.push(ul[1].trim());
      else blocks.push({ type: "ul", items: [ul[1].trim()] });
      continue;
    }
    const ol = /^\s*\d{1,3}[.)]\s+(.+)$/.exec(line);
    if (ol) {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.type === "ol") last.items.push(ol[1].trim());
      else blocks.push({ type: "ol", items: [ol[1].trim()] });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}

/** **kalın** ve `kod` biçimlerini React düğümlerine çevirir (metin dışında hiçbir şey üretmez). */
export function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="rounded bg-surface-muted px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text ?? "");
  return (
    <div className={className ?? "prose-oa text-sm text-ink sm:text-base"}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h": {
            const Tag = (`h${b.level}` as "h2" | "h3" | "h4");
            return <Tag key={i}>{renderInline(b.text)}</Tag>;
          }
          case "ul":
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            );
          default:
            return <p key={i}>{renderInline(b.text)}</p>;
        }
      })}
    </div>
  );
}
