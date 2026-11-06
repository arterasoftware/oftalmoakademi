import { describe, it, expect } from "vitest";
import { bestSnippet, highlightTerms, queryTerms, buildSearchAnswer, SEARCH_EMPTY_TEXT } from "@/lib/assistant/search-answer";
import type { RetrievedChunk } from "@/lib/ai/rag/retrieve";

const chunk = (over: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  chunkId: "c1",
  sourceId: "s1",
  sourceTitle: "Glokom Kılavuzu",
  citation: null,
  content: "Giriş paragrafı. ".repeat(20) + "Hedef göz içi basıncı bazal değerin %25-30 altında belirlenir. " + "Sonuç paragrafı. ".repeat(20),
  pageStart: 12,
  pageEnd: null,
  section: null,
  score: 1,
  ...over,
});

describe("queryTerms / bestSnippet / highlightTerms", () => {
  it("kısa kelimeleri atar ve Türkçe küçük harfe çevirir", () => {
    expect(queryTerms("Hedef GİB nasıl belirlenir?")).toEqual(["hedef", "gib", "nasıl", "belirlenir"]);
  });
  it("terimlerin geçtiği pencereyi seçer ve uçlara üç nokta koyar", () => {
    const s = bestSnippet(chunk().content, ["hedef", "basıncı"], 160);
    expect(s).toContain("Hedef göz içi basıncı");
    expect(s.startsWith("…")).toBe(true);
    expect(/^…[A-ZÇĞİÖŞÜa-zçğıöşü]/.test(s) && !/^…\S*[a-zçğıöşü][A-ZÇĞİÖŞÜ]/.test(s)).toBe(true); // kelime ortasından başlamaz
    expect(s.length).toBeLessThanOrEqual(200);
  });
  it("kısa metni olduğu gibi döner", () => {
    expect(bestSnippet("Kısa metin.", ["kısa"])).toBe("Kısa metin.");
  });
  it("terimleri ek alsa da kalınlaştırır", () => {
    expect(highlightTerms("Hedef basıncın belirlenmesi", ["hedef", "belirlenir"])).toBe("**Hedef** basıncın **belirlenmesi**");
  });
});

describe("buildSearchAnswer", () => {
  it("SSS ve kaynak bölümlerini numaralı atıflarla derler", () => {
    const a = buildSearchAnswer("hedef basınç nasıl belirlenir", [chunk()], [
      { id: "f1", question: "Hedef GİB nedir?", answer: "Bazalin %25-30 altı.", sourceTitle: "Glokom Kılavuzu", sourceNote: "s. 12", authorName: "Ayşe Demir" },
    ]);
    expect(a.insufficient).toBe(false);
    expect(a.text).toContain("### Sık sorulan sorulardan");
    expect(a.text).toContain("**Hedef GİB nedir?**");
    expect(a.text).toContain("**1. Glokom Kılavuzu, s. 12** [1]");
    expect(a.citations).toHaveLength(1);
    expect(a.citations[0].chunkId).toBe("c1");
  });
  it("kaynak başına en fazla 3 parça, toplam 6 parça alır", () => {
    const chunks = Array.from({ length: 10 }, (_, i) => chunk({ chunkId: `c${i}`, sourceId: i < 5 ? "a" : "b" }));
    const a = buildSearchAnswer("hedef", chunks, []);
    expect(a.citations).toHaveLength(6);
    expect(a.citations.filter((c) => c.sourceId === "a")).toHaveLength(3);
  });
  it("hiçbir şey bulunamazsa yetersiz işaretler ve nedeni başa koyar", () => {
    const a = buildSearchAnswer("x", [], [], { reason: "Kota doldu." });
    expect(a.insufficient).toBe(true);
    expect(a.text.startsWith("ℹ Kota doldu.")).toBe(true);
    expect(a.text).toContain(SEARCH_EMPTY_TEXT);
  });
});
