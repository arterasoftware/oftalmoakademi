import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/utils";

describe("slugify", () => {
  it("Türkçe karakterleri dönüştürür", () => {
    expect(slugify("Nörooftalmoloji: Optik Nöritte Güncel Yaklaşım")).toBe("norooftalmoloji-optik-noritte-guncel-yaklasim");
    expect(slugify("İÇ BASINÇ Ölçümü")).toBe("ic-basinc-olcumu");
  });
});
