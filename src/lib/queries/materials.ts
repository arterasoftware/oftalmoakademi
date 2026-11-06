import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { MaterialKind } from "@/db/schema";

export type MaterialView = {
  id: string;
  lessonId: string;
  kind: MaterialKind;
  title: string;
  description: string | null;
  fileId: string | null;
  url: string | null;
  mime: string | null;
  size: number | null;
  originalName: string | null;
  hasExtractedText: boolean;
  createdAt: Date;
  /** VIDEO için güvenli gömme adresi (YouTube gizlilik modu / Vimeo); yoksa null */
  embedUrl: string | null;
};

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  PDF: "PDF belge",
  IMAGE: "Görsel",
  MODEL3D: "3B model",
  VIDEO: "Video",
  LINK: "Bağlantı",
  AUDIO: "Ses kaydı",
};

export async function listLessonMaterials(lessonId: string): Promise<MaterialView[]> {
  const db = await getDb();
  const rows = await db
    .select({ m: schema.lessonMaterials, f: { mime: schema.files.mime, size: schema.files.size, originalName: schema.files.originalName } })
    .from(schema.lessonMaterials)
    .leftJoin(schema.files, eq(schema.lessonMaterials.fileId, schema.files.id))
    .where(eq(schema.lessonMaterials.lessonId, lessonId))
    .orderBy(asc(schema.lessonMaterials.order), asc(schema.lessonMaterials.createdAt));
  return rows.map(({ m, f }) => ({
    id: m.id,
    lessonId: m.lessonId,
    kind: m.kind,
    title: m.title,
    description: m.description,
    fileId: m.fileId,
    url: m.url,
    mime: f?.mime ?? null,
    size: f?.size ?? null,
    originalName: f?.originalName ?? null,
    hasExtractedText: Boolean(m.extractedText),
    createdAt: m.createdAt,
    embedUrl: m.kind === "VIDEO" && m.url ? videoEmbedUrl(m.url) : null,
  }));
}

/** Yalnızca bilinen sağlayıcılar için gömme adresi üretir; diğer adresler gömülmez (CSP frame-src). */
export function videoEmbedUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/)?.[1];
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.match(/(\d{5,})/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}
