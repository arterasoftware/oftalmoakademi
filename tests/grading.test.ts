import { describe, it, expect } from "vitest";
import { gradeAnswers, isCorrect, shuffledRightItems, normalizeMultiKey } from "@/lib/exams/grading";

const pairs = [
  { left: "A1", right: "R1" },
  { left: "A2", right: "R2" },
  { left: "A3", right: "R3" },
];

describe("puanlama", () => {
  it("çoktan seçmeli ve doğru/yanlış", () => {
    expect(isCorrect({ id: "q", type: "MULTIPLE_CHOICE", correctKey: "C", pairs: null, subspecialty: "GLOKOM" }, "C")).toBe(true);
    expect(isCorrect({ id: "q", type: "TRUE_FALSE", correctKey: "B", pairs: null, subspecialty: "GLOKOM" }, "A")).toBe(false);
  });
  it("çoklu seçim: sıra bağımsız, tam küme eşleşmeli", () => {
    const q = { id: "q", type: "MULTI_SELECT" as const, correctKey: "A,B,D", pairs: null, subspecialty: "GLOKOM" };
    expect(isCorrect(q, "D,A,B")).toBe(true);
    expect(isCorrect(q, "A,B")).toBe(false);
    expect(normalizeMultiKey(["d", "a", "a"])).toBe("A,D");
  });
  it("eşleştirme: tüm çiftler doğru olmalı; bozuk JSON yanlış sayılır", () => {
    const q = { id: "q", type: "MATCHING" as const, correctKey: "MATCH", pairs, subspecialty: "GLOKOM" };
    expect(isCorrect(q, JSON.stringify({ "0": "R1", "1": "R2", "2": "R3" }))).toBe(true);
    expect(isCorrect(q, JSON.stringify({ "0": "R1", "1": "R3", "2": "R2" }))).toBe(false);
    expect(isCorrect(q, "{bozuk")).toBe(false);
  });
  it("alt branş dağılımı ve toplam", () => {
    const r = gradeAnswers(
      [
        { id: "1", type: "MULTIPLE_CHOICE", correctKey: "A", pairs: null, subspecialty: "RETINA" },
        { id: "2", type: "TRUE_FALSE", correctKey: "A", pairs: null, subspecialty: "RETINA" },
      ],
      { "1": "A", "2": "B" },
    );
    expect(r).toEqual({ score: 1, total: 2, breakdown: { RETINA: { correct: 1, total: 2 } } });
  });
  it("sağ sütun karıştırması deterministik ve tüm öğeleri içerir", () => {
    const a = shuffledRightItems("q-1", pairs);
    expect(a).toEqual(shuffledRightItems("q-1", pairs));
    expect([...a].sort()).toEqual(["R1", "R2", "R3"]);
  });
});
