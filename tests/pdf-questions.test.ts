import { describe, expect, it } from "vitest";
import { parseQuestionsFromText } from "@/lib/exams/pdf-questions";

const DOC = `GLOKOM MİNİ SINAV

1. Primer açık açılı glokomda en önemli değiştirilebilir risk faktörü
aşağıdakilerden hangisidir?
A) Yaş
B) Göz içi basıncı
C) Miyopi
D) Aile öyküsü
E) İnce kornea

2) Prostaglandin analogları göz içi basıncını hangi mekanizmayla düşürür?
A. Aköz üretimini azaltır  B. Uveoskleral dışa akımı artırır  C. Trabeküler dışa akımı azaltır  D. Pupillayı daraltır
Cevap: B

3- Selektif lazer trabeküloplasti için doğru olan hangisidir?
*A) Tekrarlanabilir
B) Pigmentli açıda kontrendikedir
C) Yalnızca kapalı açıda uygulanır
D) Kalıcı skar bırakır

Cevap Anahtarı
1-B 2-B 3-A`;

describe("parseQuestionsFromText", () => {
  it("üç biçimdeki soruları, çok satırlı kökü ve satır içi şıkları ayrıştırır", () => {
    const r = parseQuestionsFromText(DOC);
    expect(r.questions.length).toBe(3);
    expect(r.questions[0].stem).toBe("Primer açık açılı glokomda en önemli değiştirilebilir risk faktörü aşağıdakilerden hangisidir?");
    expect(r.questions[0].options.map((o) => o.key)).toEqual(["A", "B", "C", "D", "E"]);
    expect(r.questions[1].options.length).toBe(4);
    expect(r.questions[1].options[1].text).toBe("Uveoskleral dışa akımı artırır");
  });
  it("doğru yanıtı satır içi 'Cevap:', yıldız ve cevap anahtarından alır", () => {
    const r = parseQuestionsFromText(DOC);
    expect(r.keyFound).toBe(true);
    expect(r.questions.map((q) => q.correctKey)).toEqual(["B", "B", "A"]);
    expect(r.warnings.some((w) => /belirlenemedi/.test(w))).toBe(false);
  });
  it("yanıtı olmayan soruyu uyarır ve metin olmayan belgede uyarı verir", () => {
    const r = parseQuestionsFromText("1. Soru kökü burada yeterince uzun?\nA) bir\nB) iki\nC) üç\nD) dört");
    expect(r.questions.length).toBe(1);
    expect(r.questions[0].correctKey).toBeNull();
    expect(r.questions[0].warnings.some((w) => /belirlenemedi/.test(w))).toBe(true);
    const empty = parseQuestionsFromText("Bu belgede soru yok, yalnızca açıklama var.");
    expect(empty.questions.length).toBe(0);
    expect(empty.warnings.length).toBeGreaterThan(0);
  });
  it("ardışık olmayan numaraları soru başı saymaz", () => {
    const r = parseQuestionsFromText("1. Hangisi doğrudur ve neden?\nA) 2. basamak tedavi\nB) 10. gün kontrolü\nC) üç\nD) dört\nCevap: A");
    expect(r.questions.length).toBe(1);
    expect(r.questions[0].options.length).toBe(4);
  });
});
