/**
 * Geliştirme yardımcısı: demo dersine örnek materyaller ekler (PDF, görsel, 3B model, YouTube videosu, bağlantı).
 * Gerçek yükleme hattını (imza doğrulama, EXIF temizliği) kullanır. Kullanım: dev sunucu kapalıyken
 *   node --env-file-if-exists=.env --import ./scripts/lib/register.mjs --import tsx scripts/seed-materials.ts
 */
import { runMigrations } from "../src/db/migrate";

function minimalPdf(lines: string[]): Buffer {
  const content = ["BT", "/F1 14 Tf", "50 760 Td", "16 TL", ...lines.map((l) => `(${l.replace(/[()\\]/g, "")}) Tj T*`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Basit bir GLB: iki üçgenden oluşan piramit benzeri 3B şekil (glTF 2.0). */
function minimalGlb(): Buffer {
  const positions = new Float32Array([0, 1, 0, -1, -1, 1, 1, -1, 1, 1, -1, -1, -1, -1, -1]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1, 1, 3, 2, 1, 4, 3]);
  const posBuf = Buffer.from(positions.buffer);
  const idxBuf = Buffer.from(indices.buffer);
  const idxPad = (4 - (idxBuf.length % 4)) % 4;
  const bin = Buffer.concat([posBuf, idxBuf, Buffer.alloc(idxPad)]);
  const json = JSON.stringify({
    asset: { version: "2.0", generator: "OftalmoAkademi demo" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.45, 0.95, 1], metallicFactor: 0.1, roughnessFactor: 0.6 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length, byteLength: idxBuf.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 5, type: "VEC3", min: [-1, -1, -1], max: [1, 1, 1] },
      { bufferView: 1, componentType: 5123, count: indices.length, type: "SCALAR" },
    ],
  });
  const jsonBuf = Buffer.from(json, "utf8");
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonChunk.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4); // JSON
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4); // BIN
  return Buffer.concat([header, jh, jsonChunk, bh, bin]);
}

async function main() {
  await runMigrations();
  const { getDb, schema } = await import("../src/db");
  const { saveMaterialUpload } = await import("../src/lib/storage/files");
  const { extractPdfPages } = await import("../src/lib/ai/rag/ingest");
  const { eq, sql } = await import("drizzle-orm");
  const sharp = (await import("sharp")).default;
  const db = await getDb();

  const [faculty] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = 'ogretim.uyesi@demo.local'`);
  const [lesson] = await db.select().from(schema.lessons).where(eq(schema.lessons.status, "PUBLISHED")).limit(1);
  if (!faculty || !lesson) throw new Error("Önce npm run db:demo çalıştırın.");
  const existing = await db.select({ id: schema.lessonMaterials.id }).from(schema.lessonMaterials).where(eq(schema.lessonMaterials.lessonId, lesson.id));
  if (existing.length) {
    console.log("Demo materyaller zaten var.");
    process.exit(0);
  }

  const pdfBuf = minimalPdf([
    "GLOKOM TAKIP PROTOKOLU (DEMO)",
    "1. Ilk tanida iki guvenilir gorme alani ile bazal deger olusturun.",
    "2. Ilk iki yilda en az alti gorme alani testi planlayin.",
    "3. Disk kanamasi saptanirsa takip sikligini artirin.",
    "4. Hedef GIB bazalden yuzde 25-30 dusus olarak belirlenir.",
    "5. OCT ve gorme alani ilerleme analizlerini birlikte yorumlayin.",
  ]);
  const png = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "#0b1220" },
  })
    .composite([
      { input: Buffer.from(`<svg width="1200" height="800"><circle cx="600" cy="400" r="300" fill="#f59e0b"/><circle cx="640" cy="380" r="110" fill="#fde68a"/><circle cx="600" cy="400" r="40" fill="#7c2d12"/><text x="40" y="760" font-size="36" fill="#e2e8f0" font-family="sans-serif">Demo fundus sematigi - disk ve makula</text></svg>`), top: 0, left: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
  const glb = minimalGlb();

  const items: { kind: "PDF" | "IMAGE" | "MODEL3D" | "VIDEO" | "LINK"; title: string; description: string; file?: File; url?: string }[] = [
    { kind: "PDF", title: "Glokom takip protokolü (demo PDF)", description: "Takip sıklığı ve hedef GİB ilkelerini özetleyen kısa protokol. Madde 2 ve 4'e dikkat edin.", file: new File([new Uint8Array(pdfBuf)], "glokom-takip-protokolu.pdf", { type: "application/pdf" }) },
    { kind: "IMAGE", title: "Fundus şematiği (demo görsel)", description: "Disk ve makula konumlarını şematik olarak gösterir; nöroretinal halkayı değerlendirirken ISNT kuralını hatırlayın.", file: new File([new Uint8Array(png)], "fundus-sematik.jpg", { type: "image/jpeg" }) },
    { kind: "MODEL3D", title: "Optik sinir başı 3B şema (demo model)", description: "Modeli döndürerek çukur/disk oranını farklı açılardan inceleyin.", file: new File([new Uint8Array(glb)], "optik-sinir-basi.glb", { type: "model/gltf-binary" }) },
    { kind: "VIDEO", title: "Gonyoskopi tekniği (video)", description: "Açı yapılarını tanımlarken videodaki sıralamayı izleyin.", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { kind: "LINK", title: "Avrupa Glokom Derneği kılavuzu", description: "Tedavi basamakları için 5. bölüme bakın.", url: "https://www.eugs.org/educational-material/guidelines" },
  ];

  let order = 0;
  for (const it of items) {
    let fileId: string | null = null;
    let extractedText: string | null = null;
    if (it.file) {
      const row = await saveMaterialUpload({ ownerId: faculty.id, kind: it.kind as "PDF" | "IMAGE" | "MODEL3D" | "VIDEO", file: it.file });
      fileId = row.id;
      if (it.kind === "PDF") {
        const pages = await extractPdfPages(pdfBuf);
        extractedText = pages.map((p) => p.text).join("\n\n");
      }
    }
    await db.insert(schema.lessonMaterials).values({ lessonId: lesson.id, kind: it.kind, title: it.title, description: it.description, fileId, url: it.url ?? null, extractedText, order: order++, uploadedBy: faculty.id });
    console.log("eklendi:", it.kind, it.title, extractedText ? `(metin ${extractedText.length} kar.)` : "");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
