/**
 * Geliştirme yardımcısı: farklı soru türlerini gösteren açık bir demo sınav oluşturur
 * (doğru/yanlış, çoklu seçim, eşleştirme, çoktan seçmeli). Dev sunucu kapalıyken çalıştırın.
 */
import { runMigrations } from "../src/db/migrate";

async function main() {
  await runMigrations();
  const { getDb, schema } = await import("../src/db");
  const { eq, sql } = await import("drizzle-orm");
  const db = await getDb();
  const [faculty] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = 'ogretim.uyesi@demo.local'`);
  const [lesson] = await db.select().from(schema.lessons).where(eq(schema.lessons.status, "PUBLISHED")).limit(1);
  if (!faculty || !lesson) throw new Error("Önce npm run db:demo çalıştırın.");
  const title = "Soru türleri demo sınavı";
  const exists = await db.select({ id: schema.exams.id }).from(schema.exams).where(eq(schema.exams.title, title));
  if (exists.length) {
    console.log("Demo sınav zaten var.");
    process.exit(0);
  }
  const startsAt = new Date(Date.now() - 60_000);
  const endsAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const [exam] = await db
    .insert(schema.exams)
    .values({ title, type: "WEEKLY", status: "OPEN", description: "Doğru/yanlış, çoklu seçim ve eşleştirme sorularını deneyin.", lessonId: lesson.id, durationMinutes: 10, startsAt, endsAt, resultsAt: startsAt, createdBy: faculty.id, approvedBy: faculty.id, approvedAt: new Date() })
    .returning();
  const common = { examId: exam.id, subspecialty: "GLOKOM" as const, lessonId: lesson.id, status: "APPROVED" as const, approvedBy: faculty.id, difficulty: 2 };
  await db.insert(schema.questions).values([
    {
      ...common,
      order: 0,
      type: "TRUE_FALSE",
      stem: "Primer açık açılı glokom tanısı için yüksek göz içi basıncı zorunlu bir ölçüttür.",
      options: [
        { key: "A", text: "Doğru" },
        { key: "B", text: "Yanlış" },
      ],
      correctKey: "B",
      explanation: "GİB bir risk faktörüdür; tanı yapısal ve fonksiyonel hasarla konur. Normal basınçlı glokom bu durumun örneğidir.",
    },
    {
      ...common,
      order: 1,
      type: "MULTI_SELECT",
      stem: "PAAG için risk faktörü olan seçeneklerin tümünü işaretleyin.",
      options: [
        { key: "A", text: "İleri yaş" },
        { key: "B", text: "İnce merkezi kornea" },
        { key: "C", text: "Hipermetropi" },
        { key: "D", text: "Birinci derece akrabada glokom" },
      ],
      correctKey: "A,B,D",
      explanation: "İleri yaş, ince kornea ve aile öyküsü risk faktörleridir; PAAG için miyopi (hipermetropi değil) risk oluşturur.",
    },
    {
      ...common,
      order: 2,
      type: "MATCHING",
      stem: "Glokom ilaç sınıflarını etki mekanizmalarıyla eşleştirin.",
      options: [],
      pairs: [
        { left: "Prostaglandin analoğu", right: "Uveoskleral dışa akımı artırır" },
        { left: "Beta bloker", right: "Hümör aköz üretimini azaltır (siliyer epitel)" },
        { left: "Karbonik anhidraz inhibitörü", right: "Bikarbonat oluşumunu azaltarak üretimi düşürür" },
        { left: "Pilokarpin", right: "Trabeküler dışa akımı artırır (siliyer kas kasılması)" },
      ],
      correctKey: "MATCH",
      explanation: "Her sınıf GİB'i farklı bir mekanizmayla düşürür; kombinasyon tedavisi bu farklılıklara dayanır.",
    },
    {
      ...common,
      order: 3,
      type: "MULTIPLE_CHOICE",
      stem: "Yeni tanı PAAG'de ilk iki yılda hızlı ilerleyenleri saptamak için önerilen en az görme alanı testi sayısı kaçtır?",
      options: [
        { key: "A", text: "İki" },
        { key: "B", text: "Dört" },
        { key: "C", text: "Altı" },
      ],
      correctKey: "C",
      explanation: "Kılavuzlar ilk iki yılda en az altı güvenilir test önerir.",
    },
  ]);
  await db.insert(schema.calendarEvents).values({ title: exam.title, kind: "EXAM", refId: exam.id, startsAt, endsAt, createdBy: faculty.id });
  console.log("Demo soru türleri sınavı oluşturuldu:", exam.id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
