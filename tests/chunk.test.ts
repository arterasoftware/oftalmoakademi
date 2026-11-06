import { describe, it, expect } from "vitest";
import { chunkPages, chunkText } from "@/lib/ai/rag/chunk";

describe("chunkPages", () => {
  it("paragrafları hedef boyutta parçalara böler ve sayfa bilgisini korur", () => {
    const para = "Glokom, optik sinir başında karakteristik hasar ile seyreden ilerleyici bir optik nöropatidir. ".repeat(6);
    const pages = [
      { page: 1, text: `GİRİŞ\n\n${para}\n\n${para}` },
      { page: 2, text: `${para}\n\n${para}\n\n${para}` },
    ];
    const chunks = chunkPages(pages);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(1500);
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[chunks.length - 1].pageEnd).toBe(2);
    expect(chunks[0].section).toBe("GİRİŞ");
    expect(chunks.map((c) => c.idx)).toEqual(chunks.map((_, i) => i));
  });

  it("çok uzun tek paragrafı cümle sınırlarından böler", () => {
    const text = "Bu bir cümledir. ".repeat(200);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(1500);
  });

  it("boş metinde parça üretmez", () => {
    expect(chunkText("   \n\n ")).toEqual([]);
  });
});
