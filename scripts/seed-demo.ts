/**
 * Demo verisi: örnek öğretim üyesi ve asistanlar, onaylı bir metin kaynağı (indekslenmiş),
 * yayımlanmış bir ders, haftanın makalesi, tartışmaya açık bir olgu ve zamanlanmış bir sınav.
 * Yalnızca geliştirme/pilot tanıtımı içindir. İdempotent: demo kullanıcılar zaten varsa çıkar.
 * Kullanım: npm run db:demo
 */
import { randomBytes } from "node:crypto";
import { runMigrations } from "../src/db/migrate";

/** Demo parolası: DEMO_PASSWORD verilmişse o, yoksa her kurulumda rastgele üretilir (depoda parola tutulmaz). */
const DEMO_PASSWORD = process.env.DEMO_PASSWORD?.trim() || `Demo-${randomBytes(9).toString("base64url")}!`;

async function main() {
  // Üretim veritabanına bilinen parolalı demo hesaplar yüklenmesin
  if ((process.env.NODE_ENV === "production" || process.env.DATABASE_URL) && process.env.DEMO_ALLOW !== "1") {
    console.error("Demo verisi yalnızca geliştirme veritabanına (PGlite) yüklenir. Bilinçli olarak gerekiyorsa DEMO_ALLOW=1 verin.");
    process.exit(1);
  }
  if (DEMO_PASSWORD.length < 12) {
    console.error("DEMO_PASSWORD en az 12 karakter olmalıdır.");
    process.exit(1);
  }
  await runMigrations();
  const { getDb, schema } = await import("../src/db");
  const { hashPassword } = await import("../src/lib/auth/password");
  const { ingestSource } = await import("../src/lib/ai/rag/ingest");
  const { slugify } = await import("../src/lib/utils");
  const { sql } = await import("drizzle-orm");

  const db = await getDb();
  const existing = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = 'ogretim.uyesi@demo.local'`);
  if (existing.length) {
    console.log("Demo verisi zaten yüklü (ogretim.uyesi@demo.local mevcut).");
    process.exit(0);
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [faculty] = await db
    .insert(schema.users)
    .values({ email: "ogretim.uyesi@demo.local", name: "Ayşe Demir", title: "Prof. Dr.", role: "FACULTY", passwordHash })
    .returning();
  const residents = await db
    .insert(schema.users)
    .values([
      { email: "asistan1@demo.local", name: "Mehmet Kaya", title: "Arş. Gör. Dr.", role: "RESIDENT", residencyYear: 1, passwordHash },
      { email: "asistan2@demo.local", name: "Elif Çelik", title: "Arş. Gör. Dr.", role: "RESIDENT", residencyYear: 3, passwordHash },
      { email: "asistan3@demo.local", name: "Can Yıldız", title: "Arş. Gör. Dr.", role: "RESIDENT", residencyYear: 4, passwordHash },
    ])
    .returning();

  /* ---- Kaynak (metin) ---- */
  const [source] = await db
    .insert(schema.sources)
    .values({
      title: "Primer Açık Açılı Glokom: Tanı ve Tedavi İlkeleri (demo özet metni)",
      type: "TEXT",
      citation: "Demo Eğitim Notu. Primer Açık Açılı Glokom: Tanı ve Tedavi İlkeleri. OftalmoAkademi, 2026.",
      authors: "OftalmoAkademi Eğitim Kurulu",
      year: 2026,
      licenseNote: "Kurum içi eğitim amaçlı hazırlanmış özgün metin; telif kısıtı yok.",
      subspecialty: "GLOKOM",
      approved: true,
      approvedBy: faculty.id,
      uploadedBy: faculty.id,
      rawText: DEMO_SOURCE_TEXT,
    })
    .returning();
  await ingestSource(source.id);

  /* ---- Ders ---- */
  const lessonTitle = "Primer Açık Açılı Glokomda Tanı ve İzlem";
  const [lesson] = await db
    .insert(schema.lessons)
    .values({
      title: lessonTitle,
      slug: slugify(lessonTitle),
      subspecialty: "GLOKOM",
      status: "PUBLISHED",
      description: "PAAG tanı ölçütleri, optik sinir başı ve görme alanı değerlendirmesi, hedef GİB ve basamaklı tedavi.",
      notes: [
        "**Anahtar terimler:** glokom, göz içi basıncı, optik sinir, görme alanı, gonyoskopi",
        "",
        "## Tanım",
        "- Primer açık açılı glokom (PAAG), **karakteristik optik sinir başı hasarı** ve buna uyan görme alanı kaybı ile seyreden kronik, ilerleyici bir optik nöropatidir.",
        "- **Göz içi basıncı (GİB)** en önemli değiştirilebilir risk faktörüdür; tanı tek başına GİB ile konmaz.",
        "",
        "## Değerlendirme",
        "- Aplanasyon tonometrisi ve merkezi kornea kalınlığı, **gonyoskopi**, optik sinir başı muayenesi (çukur/disk oranı, ISNT kuralı, disk kanaması), RSLT OCT ve standart otomatik perimetri birlikte kullanılır.",
        "- İlk tanıda en az **iki güvenilir görme alanı** testi ile bazal değer oluşturulur.",
        "",
        "## Tedavi ilkeleri",
        "- Hedef GİB bireysel belirlenir; basamaklar: **prostaglandin analogları** (ilk seçenek), selektif lazer trabeküloplasti, cerrahi (trabekülektomi, tüp, MIGS).",
      ].join("\n"),
      notesSource: "manual",
      notesUpdatedAt: new Date(),
      authorId: faculty.id,
      publishedAt: new Date(),
    })
    .returning();
  await db.insert(schema.lessonSources).values({ lessonId: lesson.id, sourceId: source.id });
  await db.insert(schema.calendarEvents).values({ title: `Ders: ${lessonTitle}`, kind: "LESSON", refId: lesson.id, startsAt: new Date(), createdBy: faculty.id });

  /* ---- Makale ---- */
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const [article] = await db
    .insert(schema.articles)
    .values({
      title: "Selective laser trabeculoplasty versus eye drops for first-line treatment of ocular hypertension and glaucoma (LiGHT): a multicentre randomised controlled trial",
      authors: "Gazzard G, Konstantakopoulou E, Garway-Heath D, et al.",
      journal: "The Lancet",
      publishedOn: "2019",
      doi: "10.1016/S0140-6736(18)32213-X",
      pmid: "30862377",
      subspecialty: "GLOKOM",
      status: "PUBLISHED",
      aiRationale: "Demo kaydı: birinci basamak tedavide SLT ile damla tedavisini karşılaştıran çok merkezli randomize çalışma; klinik pratiği doğrudan etkiler.",
      summary: {
        structuredSummaryTr:
          "LiGHT çalışması, yeni tanı almış oküler hipertansiyon ve açık açılı glokom hastalarında birinci basamak tedavi olarak selektif lazer trabeküloplastiyi (SLT) topikal tedavi ile karşılaştırmıştır.",
        background: "Topikal tedavi uyum sorunları ve oküler yüzey yan etkileri taşır; SLT damlasız bir alternatif sunar.",
        methods: "718 hasta, çok merkezli, randomize; birincil sonlanım 36. ayda sağlıkla ilişkili yaşam kalitesi.",
        keyFindings: ["36. ayda SLT kolunda hastaların yaklaşık dörtte üçü damlasız hedef GİB'de kaldı.", "Yaşam kalitesinde anlamlı fark yoktu.", "SLT maliyet-etkin bulundu."],
        strengths: ["Büyük örneklem", "Randomize tasarım", "Hasta odaklı birincil sonlanım"],
        weaknesses: ["Maskeleme sınırlı", "Sonuçların uzun dönem genellenebilirliği"],
        clinicalImplications: "SLT, uygun hastalarda birinci basamak seçenek olarak düşünülebilir.",
        discussionQuestions: ["Kliniğimizde hangi hastalara birinci basamakta SLT önerirsiniz?", "Yaşam kalitesi sonlanımının eşit çıkmasını nasıl yorumlarsınız?", "Maliyet-etkinlik verisi Türkiye koşullarına uyarlanabilir mi?"],
      },
      weekOf: monday,
      selectedBy: faculty.id,
      publishedAt: new Date(),
    })
    .returning();
  await db.insert(schema.calendarEvents).values({ title: "Haftanın makalesi: LiGHT", kind: "ARTICLE", refId: article.id, startsAt: monday, createdBy: faculty.id });

  /* ---- Olgu ---- */
  const [clinicalCase] = await db
    .insert(schema.clinicalCases)
    .values({
      title: "Tek taraflı ani ağrısız görme azalması",
      subspecialty: "RETINA",
      status: "PUBLISHED",
      body: [
        "60-69 yaş erkek hasta. Sağ gözde 3 gündür ani başlayan ağrısız görme azalması.",
        "Öykü: Hipertansiyon (düzensiz ilaç kullanımı), 20 paket-yıl sigara. Travma, göz cerrahisi öyküsü yok.",
        "Görme keskinliği: sağ 1/10, sol 10/10. Sağda rölatif afferent pupil defekti (+).",
        "Muayene: ön segment doğal. GİB sağ 16, sol 15 mmHg. Fundus: sağda yaygın alev şeklinde kanamalar, venlerde dilatasyon ve kıvrımlanma, disk ödemi.",
        "OCT: sağ makulada kistoid ödem, santral kalınlık 612 µm. Açlık glukozu 128 mg/dL, HbA1c %6,8; lipid profili sınırda yüksek.",
        "",
        "Sorular: Ön tanınız ve ayırıcı tanılarınız nelerdir? Hangi ek tetkikleri istersiniz? İskemik/non-iskemik ayrımını nasıl yaparsınız? Tedavi planınız nedir?",
      ].join("\n"),
      deidentificationConfirmed: true,
      authorId: residents[1].id,
      publishedAt: new Date(),
    })
    .returning();
  await db.insert(schema.comments).values([
    { targetType: "CASE", targetId: clinicalCase.id, authorId: residents[0].id, body: "Fundus bulguları ve RAPD varlığı ile öncelikle santral retinal ven tıkanıklığı düşünürüm. FA ile iskemik tip ayrımı yapılmalı." },
    { targetType: "CASE", targetId: clinicalCase.id, authorId: faculty.id, body: "Güzel başlangıç. RAPD'nin iskemik tipteki öngörü değerini ve ERG'nin yerini tartışalım.", isPinned: true },
  ]);
  await db.insert(schema.notifications).values(
    residents.map((r) => ({ userId: r.id, type: "CASE_PUBLISHED" as const, title: "Yeni olgu: Tek taraflı ani ağrısız görme azalması", link: `/olgular/${clinicalCase.id}` })),
  );

  /* ---- Haftalık mini sınav ---- */
  const startsAt = new Date(Date.now() - 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [exam] = await db
    .insert(schema.exams)
    .values({
      title: `Haftalık mini sınav: ${lessonTitle}`,
      type: "WEEKLY",
      status: "OPEN",
      description: "Haftanın dersine ilişkin 5 soru. Süre 10 dakika.",
      lessonId: lesson.id,
      durationMinutes: 10,
      startsAt,
      endsAt,
      resultsAt: startsAt,
      createdBy: faculty.id,
      approvedBy: faculty.id,
      approvedAt: new Date(),
    })
    .returning();
  const qs = DEMO_QUESTIONS.map((q, i) => ({
    examId: exam.id,
    order: i,
    stem: q.stem,
    options: q.options.map((text, j) => ({ key: "ABCDE"[j], text })),
    correctKey: q.correct,
    explanation: q.explanation,
    subspecialty: "GLOKOM" as const,
    difficulty: q.difficulty,
    lessonId: lesson.id,
    sourceRef: source.citation!,
    status: "APPROVED" as const,
    approvedBy: faculty.id,
  }));
  await db.insert(schema.questions).values(qs);
  await db.insert(schema.calendarEvents).values({ title: exam.title, kind: "EXAM", refId: exam.id, startsAt, endsAt, createdBy: faculty.id });
  await db.insert(schema.notifications).values(residents.map((r) => ({ userId: r.id, type: "EXAM_SCHEDULED" as const, title: exam.title, body: "Sınav açıldı; 7 gün içinde tamamlayın.", link: `/sinavlar/${exam.id}` })));

  console.log("Demo verisi yüklendi.");
  console.log("Hesaplar (parola hepsinde aynı):");
  console.log("  Öğretim üyesi : ogretim.uyesi@demo.local");
  console.log("  Asistanlar    : asistan1@demo.local, asistan2@demo.local, asistan3@demo.local");
  console.log(`  Parola        : ${DEMO_PASSWORD}   (bir yere not edin; tekrar gösterilmez)`);
  process.exit(0);
}

const DEMO_SOURCE_TEXT = `PRİMER AÇIK AÇILI GLOKOM: TANI VE TEDAVİ İLKELERİ

Tanım
Primer açık açılı glokom (PAAG), gonyoskopide açık iridokorneal açı bulunan, ikincil bir nedenin saptanmadığı, karakteristik optik sinir başı hasarı ve buna uyan görme alanı kaybı ile seyreden kronik, ilerleyici bir optik nöropatidir. Göz içi basıncı (GİB) tanı ölçütü değil, en önemli değiştirilebilir risk faktörüdür. Normal basınçlı glokom, PAAG'nin GİB'in istatistiksel normal sınırlar içinde kaldığı alt grubudur.

Risk faktörleri
Yüksek GİB, ileri yaş, birinci derece akrabada glokom öyküsü, ince merkezi kornea kalınlığı, yüksek miyopi, Afrika kökeni ve düşük oküler perfüzyon basıncı başlıca risk faktörleridir. Diyabet ve sistemik hipertansiyon ile ilişki tartışmalıdır.

Klinik değerlendirme
Tam değerlendirme şu bileşenleri içerir: Goldmann aplanasyon tonometrisi ile GİB ölçümü ve merkezi kornea kalınlığı (pakimetri); gonyoskopi ile açı değerlendirmesi; optik sinir başı muayenesi (çukur/disk oranı, nöroretinal halkanın ISNT kuralına uygunluğu, disk kanaması, peripapiller atrofi, sinir lifi tabakası defektleri); retina sinir lifi tabakası ve ganglion hücre kompleksi OCT ölçümü; standart otomatik perimetri (24-2 veya 30-2; ileri evrede ve santral hasar şüphesinde 10-2).

Görme alanı yorumu
Güvenilirlik indeksleri (fiksasyon kayıpları, yanlış pozitif ve yanlış negatif oranları) kontrol edilmeden sonuç yorumlanmamalıdır. Glokomatöz defektler tipik olarak horizontal meridyene saygılıdır: nazal basamak, parasantral skotom, arkuat skotom. Ortalama sapma (MD) evreleme için kullanılır: erken evre MD -6 dB'den iyi, orta evre -6 ile -12 dB arası, ileri evre -12 dB'den kötü.

Yapısal-fonksiyonel uyum
Tanıda OCT'de saptanan RSLT incelmesi ile görme alanı defektinin topografik olarak uyumlu olması aranır. Erken evrede yapısal hasar fonksiyonel kayıptan önce saptanabilir (preperimetrik glokom). İleri evrede OCT taban etkisi nedeniyle ilerleme takibinde görme alanı daha duyarlıdır.

Tedavi ilkeleri
Tedavinin amacı hastanın yaşam süresi boyunca görme işlevini ve yaşam kalitesini korumaktır. Hedef GİB, bazal GİB, hasar evresi, yaş ve ilerleme hızına göre bireysel belirlenir; genellikle bazalden yüzde 25-30 düşüş hedeflenir ve ilerleme saptanırsa hedef düşürülür. Birinci basamakta prostaglandin analogları tercih edilir; alternatif olarak selektif lazer trabeküloplasti (SLT) birinci basamak seçenek olarak kabul görmektedir. Beta blokerler, karbonik anhidraz inhibitörleri ve alfa-2 agonistler ek tedavi olarak kullanılır. Medikal ve lazer tedaviye rağmen ilerleyen olgularda trabekülektomi, glokom drenaj implantları veya minimal invaziv glokom cerrahisi (MIGS) seçenekleri değerlendirilir.

İzlem
Yeni tanıda ilk iki yıl içinde en az altı görme alanı testi hızlı ilerleyen hastaları saptamak için önerilir. Disk kanaması ilerleme riskini artıran bir bulgudur ve takip sıklığını artırmayı gerektirir. OCT ve görme alanı ilerleme analizleri birlikte kullanılmalıdır.`;

const DEMO_QUESTIONS = [
  {
    stem: "Primer açık açılı glokom tanısında aşağıdakilerden hangisi tanı ölçütü değil, risk faktörüdür?",
    options: ["Karakteristik optik sinir başı hasarı", "Uyumlu görme alanı defekti", "Yüksek göz içi basıncı", "Gonyoskopide açık açı", "Retina sinir lifi tabakası incelmesi"],
    correct: "C",
    explanation: "GİB, PAAG'de en önemli değiştirilebilir risk faktörüdür; tanı yapısal ve fonksiyonel hasarın birlikte gösterilmesiyle konur.",
    difficulty: 1,
  },
  {
    stem: "62 yaşında hasta, 24-2 görme alanında ortalama sapma (MD) -9 dB ve nazal basamak ile başvuruyor. Evresi hangisidir?",
    options: ["Preperimetrik", "Erken", "Orta", "İleri", "Terminal"],
    correct: "C",
    explanation: "MD -6 ile -12 dB arası orta evre olarak sınıflanır.",
    difficulty: 2,
  },
  {
    stem: "Görme alanı sonucunu yorumlamadan önce ilk kontrol edilmesi gereken nedir?",
    options: ["Ortalama sapma", "Güvenilirlik indeksleri", "Patern standart sapma", "Glokom hemifield testi", "Görme alanı indeksi (VFI)"],
    correct: "B",
    explanation: "Fiksasyon kaybı, yanlış pozitif/negatif oranları yüksekse test güvenilir değildir ve diğer parametreler yorumlanmamalıdır.",
    difficulty: 1,
  },
  {
    stem: "İleri evre glokomda ilerleme takibinde OCT'nin değerinin azalmasının temel nedeni nedir?",
    options: ["Sinyal gücünün düşmesi", "Taban (floor) etkisi", "Miyopik disk morfolojisi", "Katarakt etkisi", "Segmentasyon hatalarının artması"],
    correct: "B",
    explanation: "RSLT kalınlığı belirli bir değerin altına inmez (taban etkisi); ileri evrede görme alanı ilerlemeyi daha duyarlı gösterir.",
    difficulty: 3,
  },
  {
    stem: "Yeni tanı PAAG'de ilk iki yılda hızlı ilerleyen hastaları saptamak için önerilen görme alanı testi sayısı en az kaçtır?",
    options: ["İki", "Üç", "Dört", "Altı", "On"],
    correct: "D",
    explanation: "Kılavuzlar ilk iki yılda en az altı güvenilir görme alanı testi önerir.",
    difficulty: 2,
  },
];

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
