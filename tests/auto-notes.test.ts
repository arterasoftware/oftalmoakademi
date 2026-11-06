import { describe, expect, it } from "vitest";
import { buildAutoNotes, splitSections, splitSentences, emphasize, stem } from "@/lib/lessons/auto-notes";

const DOC = `1. Giriş
Primer açık açılı glokom, optik sinir başında karakteristik hasar ve görme alanı kaybıyla seyreden kronik bir optik nöropatidir. Göz içi basıncı en önemli değiştirilebilir risk faktörüdür. Hastaların çoğu erken dönemde belirti vermez.

2. Tanı
Tanı için göz içi basıncı ölçümü, gonyoskopi, optik sinir başı değerlendirmesi ve görme alanı testi birlikte kullanılır. Optik koherens tomografi retina sinir lifi tabakası kalınlığını nicel olarak ölçer ve erken tanıda yardımcıdır. Santral kornea kalınlığı göz içi basıncı ölçümünü etkiler.

3. Tedavi
Tedavinin amacı göz içi basıncını hedef düzeye indirerek optik sinir hasarının ilerlemesini durdurmaktır. Prostaglandin analogları ilk basamakta en sık tercih edilen ilaçlardır ve göz içi basıncını yüzde 25 ile 30 oranında düşürür. Selektif lazer trabeküloplasti, ilaç tedavisine alternatif veya ek olarak uygulanabilir.`;

describe("auto-notes", () => {
  it("numaralı başlıkları bölüm olarak ayırır", () => {
    const secs = splitSections(DOC);
    expect(secs.map((s) => s.heading)).toEqual(["Giriş", "Tanı", "Tedavi"]);
  });
  it("cümleleri uzunluk sınırıyla böler", () => {
    const sents = splitSentences("Kısa. Bu cümle yeterince uzun olduğu için listeye girmeli ve kırk karakteri geçmelidir. Bir diğeri de burada yer alır ve yine yeterli uzunluktadır.");
    expect(sents.length).toBe(2);
  });
  it("her bölümden madde seçer, terimleri kalınlaştırır ve Markdown üretir", () => {
    const r = buildAutoNotes(DOC, { maxPoints: 9, maxPerSection: 3, sourceTitle: "Glokom notu" });
    expect(r.ok).toBe(true);
    expect(r.sections.length).toBe(3);
    expect(r.markdown).toContain("## Tanı");
    expect(r.markdown).toContain("**Anahtar terimler:**");
    expect(r.markdown).toMatch(/\*\*(göz|optik|basınc)/i);
    expect(r.sections.every((s) => s.points.length <= 3)).toBe(true);
    expect(r.markdown).toContain("Kaynak: Glokom notu");
  });
  it("çok kısa metinde not üretmez", () => {
    expect(buildAutoNotes("Kısa metin.").ok).toBe(false);
  });
  it("emphasize yalnızca ilk eşleşmeyi ve en fazla üç terimi kalınlaştırır", () => {
    const s = emphasize("Göz içi basıncı ve optik sinir hasarı; göz içi basıncı tekrar.", ["göz", "optik", "sinir", "basınc"]);
    expect((s.match(/\*\*/g) ?? []).length).toBe(6);
  });
  it("stem sık ekleri atar", () => {
    expect(stem("hastaların")).toBe("hasta");
    expect(stem("ilaçlar")).toBe("ilaç");
  });
});
