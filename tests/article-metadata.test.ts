import { describe, expect, it } from "vitest";
import { normalizeDoi, extractDoiFromText } from "@/lib/articles/metadata";

describe("normalizeDoi", () => {
  it("doi.org bağlantısını ve doi: önekini soyar", () => {
    expect(normalizeDoi("https://doi.org/10.1016/j.ophtha.2024.01.001")).toBe("10.1016/j.ophtha.2024.01.001");
    expect(normalizeDoi("doi: 10.1001/jamaophthalmol.2023.1234")).toBe("10.1001/jamaophthalmol.2023.1234");
    expect(normalizeDoi("  10.1167/iovs.65.1.12.  ")).toBe("10.1167/iovs.65.1.12");
  });
  it("geçersiz girdide null döner", () => {
    expect(normalizeDoi("")).toBeNull();
    expect(normalizeDoi("PMID 12345")).toBeNull();
    expect(normalizeDoi("10.1/x")).toBeNull();
  });
});

describe("extractDoiFromText", () => {
  it("PDF metninden ilk DOI'yi bulur ve sondaki noktalamayı atar", () => {
    const text = "Ophthalmology 2024;131:1-9. https://doi.org/10.1016/j.ophtha.2024.01.001. © Elsevier";
    expect(extractDoiFromText(text)).toBe("10.1016/j.ophtha.2024.01.001");
  });
  it("DOI yoksa null döner", () => {
    expect(extractDoiFromText("Lorem ipsum, hiçbir künye yok")).toBeNull();
  });
});
