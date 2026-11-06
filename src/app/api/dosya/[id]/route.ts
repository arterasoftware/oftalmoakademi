import { NextResponse, type NextRequest } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/dal";
import { readFileBuffer } from "@/lib/storage/files";
import { getDb, schema } from "@/db";
import { isStaff } from "@/lib/auth/dal";

/**
 * Yetkili dosya sunumu. Her istek oturum ve erişim kontrolünden geçer:
 *  - Personel (yönetici/öğretim üyesi) tüm dosyaları görebilir.
 *  - Asistan: kendi yüklediği dosyalar + yayımlanmış olgu/soru görselleri.
 *  - Olgu görselleri/sesi yalnızca olgu tartışmaya açıkken (HIDDEN olguda personel/yazar dışında erişilemez).
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/dosya/[id]">) {
  const s = await getCurrentSession();
  if (!s || (s.user.mfaEnabled && !s.session.mfaVerified)) return new NextResponse("Yetkisiz", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Bulunamadı", { status: 404 });

  const res = await readFileBuffer(id).catch(() => null);
  if (!res) return new NextResponse("Bulunamadı", { status: 404 });
  const { row, data } = res;

  if (!isStaff(s.user.role) && row.ownerId !== s.user.id) {
    const allowed = await residentCanView(row.id);
    if (!allowed) return new NextResponse("Yetkisiz", { status: 403 });
  }

  const baseHeaders = {
    "Content-Type": row.mime,
    "Content-Disposition": `inline; filename="${encodeURIComponent(row.originalName)}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };

  // Video oynatıcılar için bayt aralığı (Range) desteği
  const range = _req.headers.get("range");
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    const total = data.length;
    const start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    const slice = data.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(slice), {
      status: 206,
      headers: { ...baseHeaders, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(slice.length) },
    });
  }

  return new NextResponse(new Uint8Array(data), { headers: { ...baseHeaders, "Content-Length": String(row.size) } });
}

async function residentCanView(fileId: string): Promise<boolean> {
  const db = await getDb();
  // Olgu görseli / olgu ses kaydı: olgu tartışmaya açık olmalı
  const caseImg = await db
    .select({ status: schema.clinicalCases.status })
    .from(schema.caseImages)
    .innerJoin(schema.clinicalCases, eq(schema.caseImages.caseId, schema.clinicalCases.id))
    .where(eq(schema.caseImages.fileId, fileId))
    .limit(1);
  if (caseImg[0]) return caseImg[0].status === "PUBLISHED";
  const caseAud = await db.select({ status: schema.clinicalCases.status }).from(schema.clinicalCases).where(eq(schema.clinicalCases.audioFileId, fileId)).limit(1);
  if (caseAud[0]) return caseAud[0].status === "PUBLISHED";
  // Soru görseli: sınav açık veya sonuçlar yayımlanmış olmalı
  const qRows = await db
    .select({ status: schema.exams.status })
    .from(schema.questions)
    .innerJoin(schema.exams, eq(schema.questions.examId, schema.exams.id))
    .where(and(eq(schema.questions.imageFileId, fileId), or(eq(schema.exams.status, "OPEN"), eq(schema.exams.status, "RESULTS_PUBLISHED"), eq(schema.exams.status, "CLOSED"))))
    .limit(1);
  if (qRows[0]) return true;
  // Ders materyali: ders yayımlanmış olmalı
  const matRows = await db
    .select({ status: schema.lessons.status })
    .from(schema.lessonMaterials)
    .innerJoin(schema.lessons, eq(schema.lessonMaterials.lessonId, schema.lessons.id))
    .where(eq(schema.lessonMaterials.fileId, fileId))
    .limit(1);
  if (matRows[0]) return matRows[0].status === "PUBLISHED";
  // Yorum eki (ses veya görsel): yorum silinmemiş olmalı ve asistan hedef içeriği görebilmeli
  const viaAudio = await db
    .select({ targetType: schema.comments.targetType, targetId: schema.comments.targetId, deletedAt: schema.comments.deletedAt })
    .from(schema.comments)
    .where(eq(schema.comments.audioFileId, fileId))
    .limit(1);
  const viaImage = viaAudio[0]
    ? []
    : await db
        .select({ targetType: schema.comments.targetType, targetId: schema.comments.targetId, deletedAt: schema.comments.deletedAt })
        .from(schema.commentImages)
        .innerJoin(schema.comments, eq(schema.commentImages.commentId, schema.comments.id))
        .where(eq(schema.commentImages.fileId, fileId))
        .limit(1);
  const cm = viaAudio[0] ?? viaImage[0];
  if (cm) {
    if (cm.deletedAt) return false;
    if (cm.targetType === "LESSON") {
      const [l] = await db.select({ status: schema.lessons.status }).from(schema.lessons).where(eq(schema.lessons.id, cm.targetId)).limit(1);
      return l?.status === "PUBLISHED";
    }
    if (cm.targetType === "ARTICLE") {
      const [a] = await db.select({ status: schema.articles.status }).from(schema.articles).where(eq(schema.articles.id, cm.targetId)).limit(1);
      return a?.status === "PUBLISHED";
    }
    const [c] = await db.select({ status: schema.clinicalCases.status }).from(schema.clinicalCases).where(eq(schema.clinicalCases.id, cm.targetId)).limit(1);
    return c?.status === "PUBLISHED";
  }
  // Makale tam metni: makale yayımlanmış olmalı
  const artRows = await db.select({ status: schema.articles.status }).from(schema.articles).where(eq(schema.articles.pdfFileId, fileId)).limit(1);
  if (artRows[0]) return artRows[0].status === "PUBLISHED";
  // Ders görseli: personel yüklemesi; yayımlanmış içerikte kullanılır
  const lessonFile = await db.select({ kind: schema.files.kind }).from(schema.files).where(eq(schema.files.id, fileId)).limit(1);
  return lessonFile[0]?.kind === "LESSON_IMAGE";
}
