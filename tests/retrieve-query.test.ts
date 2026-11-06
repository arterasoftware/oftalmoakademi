import { describe, it, expect } from "vitest";
import { toOrQuery } from "@/lib/ai/rag/retrieve";

describe("toOrQuery", () => {
  it("kelimeleri 'or' ile bağlar, kısa kelimeleri ve noktalamayı atar", () => {
    expect(toOrQuery("Hedef GİB nasıl belirlenir?")).toBe("hedef or gib or nasıl or belirlenir");
  });
  it("tekrarları kaldırır ve işleç kelimelerini atar", () => {
    expect(toOrQuery("glokom or glokom and not retina")).toBe("glokom or retina");
  });
  it("boş girişte boş döner", () => {
    expect(toOrQuery("a b")).toBe("");
  });
});
