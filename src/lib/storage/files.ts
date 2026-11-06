import "server-only";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { getDb, schema } from "@/db";
import { storage } from "./driver";
import { randomToken } from "@/lib/crypto";

type FileKind = (typeof schema.fileKindEnum.enumValues)[number];

export const LIMITS = {
  image: 15 * 1024 * 1024, // 15 MB
  pdf: 40 * 1024 * 1024, // 40 MB
  maxImageSide: 2400,
} as const;

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/tiff"]);

export class UploadError extends Error {}

/**
 * Görsel yükleme:
 *  - MIME türü dosya imzasından (magic bytes) doğrulanır; uzantıya güvenilmez.
 *  - sharp ile yeniden kodlanır -> EXIF/XMP/IPTC üst verileri (hasta adı, cihaz, konum) atılır.
 *  - Boyut sınırlanır (en uzun kenar 2400 px) ve WebP olarak saklanır.
 */
export async function saveImageUpload(opts: { ownerId: string; kind: FileKind; file: File }) {
  const { file } = opts;
  if (file.size > LIMITS.image) throw new UploadError("Görsel 15 MB'den büyük olamaz.");
  const input = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(input);
  if (!detected || !IMAGE_MIMES.has(detected.mime)) throw new UploadError("Yalnızca JPEG, PNG, WebP, HEIC veya TIFF görseller yüklenebilir.");

  let pipeline = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate(); // EXIF yönünü uygula, sonra üst veriyi at
  const meta = await pipeline.metadata();
  if ((meta.width ?? 0) > LIMITS.maxImageSide || (meta.height ?? 0) > LIMITS.maxImageSide) {
    pipeline = pipeline.resize({ width: LIMITS.maxImageSide, height: LIMITS.maxImageSide, fit: "inside", withoutEnlargement: true });
  }
  // withMetadata() ÇAĞRILMAZ -> tüm EXIF/ICC/XMP atılır.
  const out = await pipeline.webp({ quality: 88 }).toBuffer({ resolveWithObject: true });

  const sha256 = createHash("sha256").update(out.data).digest("hex");
  const key = `${opts.kind.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomToken(16)}.webp`;
  await storage().put(key, out.data, "image/webp");

  const db = await getDb();
  const [row] = await db
    .insert(schema.files)
    .values({
      ownerId: opts.ownerId,
      kind: opts.kind,
      mime: "image/webp",
      size: out.data.length,
      sha256,
      storageKey: key,
      originalName: sanitizeName(file.name),
      width: out.info.width,
      height: out.info.height,
    })
    .returning();
  return row;
}

/** PDF yükleme: imza kontrolü + boyut sınırı; içerik olduğu gibi saklanır (metin çıkarımı ayrı adımda). */
export async function savePdfUpload(opts: { ownerId: string; file: File; kind?: "SOURCE_DOCUMENT" | "ARTICLE_PDF" }) {
  const { file } = opts;
  const kind = opts.kind ?? "SOURCE_DOCUMENT";
  if (file.size > LIMITS.pdf) throw new UploadError("PDF 40 MB'den büyük olamaz.");
  const input = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(input);
  if (!detected || detected.mime !== "application/pdf") throw new UploadError("Dosya geçerli bir PDF değil.");
  const sha256 = createHash("sha256").update(input).digest("hex");
  const key = `${kind.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomToken(16)}.pdf`;
  await storage().put(key, input, "application/pdf");
  const db = await getDb();
  const [row] = await db
    .insert(schema.files)
    .values({
      ownerId: opts.ownerId,
      kind,
      mime: "application/pdf",
      size: input.length,
      sha256,
      storageKey: key,
      originalName: sanitizeName(file.name),
    })
    .returning();
  return row;
}

export async function readFileBuffer(fileId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).limit(1);
  if (!row) return null;
  const data = await storage().get(row.storageKey);
  return { row, data };
}

export async function deleteFile(fileId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).limit(1);
  if (!row) return;
  await storage().delete(row.storageKey).catch(() => {});
  await db.delete(schema.files).where(eq(schema.files.id, fileId));
}

function sanitizeName(name: string) {
  return name.replace(/[^\w.\-() çğıöşüÇĞİÖŞÜ]/g, "_").slice(0, 150) || "dosya";
}

/* -------------------------------------------------------------------------- */
/*  Ders materyalleri: PDF, görsel, 3B model (glTF/GLB), video                 */
/* -------------------------------------------------------------------------- */

export type MaterialFileKind = "PDF" | "IMAGE" | "MODEL3D" | "VIDEO" | "AUDIO";

export const MATERIAL_LIMITS: Record<MaterialFileKind, number> = {
  IMAGE: 15 * 1024 * 1024,
  PDF: 40 * 1024 * 1024,
  MODEL3D: 60 * 1024 * 1024,
  VIDEO: 150 * 1024 * 1024,
  AUDIO: 25 * 1024 * 1024,
};

const VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

/**
 * Ders materyali yükleme. Tür her zaman dosya imzasından doğrulanır:
 *  - IMAGE: saveImageUpload ile yeniden kodlanır (EXIF temizliği).
 *  - PDF: imza kontrolü.
 *  - MODEL3D: GLB ("glTF" sihirli baytı) veya glTF JSON ("asset" alanı); başka dosya kabul edilmez.
 *  - VIDEO: MP4/WebM/QuickTime imzası.
 */
export async function saveMaterialUpload(opts: { ownerId: string; kind: MaterialFileKind; file: File }) {
  const { file, kind } = opts;
  if (file.size > MATERIAL_LIMITS[kind]) throw new UploadError(`Dosya ${Math.round(MATERIAL_LIMITS[kind] / 1024 / 1024)} MB'den büyük olamaz.`);
  if (file.size === 0) throw new UploadError("Dosya boş.");

  if (kind === "IMAGE") return saveImageUpload({ ownerId: opts.ownerId, kind: "LESSON_MATERIAL", file });

  const input = Buffer.from(await file.arrayBuffer());
  let mime: string;
  let ext: string;

  if (kind === "PDF") {
    const detected = await fileTypeFromBuffer(input);
    if (!detected || detected.mime !== "application/pdf") throw new UploadError("Dosya geçerli bir PDF değil.");
    mime = "application/pdf";
    ext = "pdf";
  } else if (kind === "MODEL3D") {
    if (input.length > 12 && input.toString("ascii", 0, 4) === "glTF") {
      mime = "model/gltf-binary";
      ext = "glb";
    } else {
      try {
        const json = JSON.parse(input.toString("utf8")) as { asset?: { version?: string } };
        if (!json?.asset?.version) throw new Error();
      } catch {
        throw new UploadError("3B model GLB (.glb) veya glTF (.gltf) biçiminde olmalıdır.");
      }
      mime = "model/gltf+json";
      ext = "gltf";
    }
  } else if (kind === "AUDIO") {
    const detected = await fileTypeFromBuffer(input);
    const m = detected?.mime ?? "";
    if (!AUDIO_MIMES[m]) throw new UploadError("Ses dosyası MP3, M4A, OGG/Opus, WAV veya WebM biçiminde olmalıdır.");
    mime = m === "video/webm" ? "audio/webm" : m;
    ext = AUDIO_MIMES[m];
  } else {
    const detected = await fileTypeFromBuffer(input);
    if (!detected || !VIDEO_MIMES.has(detected.mime)) throw new UploadError("Video MP4, WebM veya MOV biçiminde olmalıdır.");
    mime = detected.mime;
    ext = detected.ext;
  }

  const sha256 = createHash("sha256").update(input).digest("hex");
  const key = `lesson_material/${new Date().toISOString().slice(0, 7)}/${randomToken(16)}.${ext}`;
  await storage().put(key, input, mime);
  const db = await getDb();
  const [row] = await db
    .insert(schema.files)
    .values({ ownerId: opts.ownerId, kind: "LESSON_MATERIAL", mime, size: input.length, sha256, storageKey: key, originalName: sanitizeName(file.name) })
    .returning();
  return row;
}

/* -------------------------------------------------------------------------- */
/*  Olgu ses kayıtları                                                         */
/* -------------------------------------------------------------------------- */

export const AUDIO_LIMIT = 25 * 1024 * 1024;
const AUDIO_MIMES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "video/webm": "webm", // tarayıcı kayıtları (MediaRecorder) webm kapsayıcısıyla gelir
  "audio/flac": "flac",
  "audio/aac": "aac",
};

export type AudioFileKind = "CASE_AUDIO" | "COMMENT_AUDIO";

/** Ses kaydı yükleme (olgu kaydı veya sesli yorum): tür dosya imzasından doğrulanır; içerik olduğu gibi saklanır. */
export async function saveAudioUpload(opts: { ownerId: string; file: File; kind?: AudioFileKind }) {
  const { file } = opts;
  const kind: AudioFileKind = opts.kind ?? "CASE_AUDIO";
  if (file.size > AUDIO_LIMIT) throw new UploadError("Ses kaydı 25 MB'den büyük olamaz.");
  if (file.size < 100) throw new UploadError("Ses kaydı boş görünüyor.");
  const input = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(input);
  const mime = detected?.mime ?? "";
  const ext = AUDIO_MIMES[mime];
  if (!ext) throw new UploadError("Ses dosyası MP3, M4A, OGG/Opus, WAV veya WebM biçiminde olmalıdır.");
  const storedMime = mime === "video/webm" ? "audio/webm" : mime;
  const sha256 = createHash("sha256").update(input).digest("hex");
  const prefix = kind === "COMMENT_AUDIO" ? "comment_audio" : "case_audio";
  const key = `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomToken(16)}.${ext}`;
  await storage().put(key, input, storedMime);
  const db = await getDb();
  const [row] = await db
    .insert(schema.files)
    .values({ ownerId: opts.ownerId, kind, mime: storedMime, size: input.length, sha256, storageKey: key, originalName: sanitizeName(file.name || "kayit." + ext) })
    .returning();
  return row;
}
