import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession, isStaff } from "@/lib/auth/dal";
import { csvCell, getCohortReport, getResidentReport } from "@/lib/queries/reports";
import { SUBSPECIALTY_LABELS } from "@/db/schema";
import { audit } from "@/lib/audit";
import { uuidSchema } from "@/lib/validation";

/**
 * CSV dışa aktarma (yalnızca personel). `?asistan=<id>` verilirse o asistanın sınav geçmişi,
 * aksi hâlde kohort özeti. UTF-8 BOM ile Excel'de Türkçe karakterler doğru açılır.
 */
export async function GET(req: NextRequest) {
  const s = await getCurrentSession();
  if (!s || (s.user.mfaEnabled && !s.session.mfaVerified) || !isStaff(s.user.role)) return new NextResponse("Yetkisiz", { status: 403 });

  const url = req.nextUrl;
  const asistan = url.searchParams.get("asistan");
  const yilRaw = url.searchParams.get("yil");
  const yil = yilRaw && /^[1-5]$/.test(yilRaw) ? Number(yilRaw) : undefined;
  const lines: string[] = [];
  let filename = "asistan-raporu.csv";

  if (asistan) {
    if (!uuidSchema.safeParse(asistan).success) return new NextResponse("Geçersiz", { status: 400 });
    const r = await getResidentReport(asistan);
    if (!r) return new NextResponse("Bulunamadı", { status: 404 });
    filename = `asistan-${r.user.name.replace(/\s+/g, "_")}.csv`;
    lines.push(["Sınav", "Tür", "Gönderim", "Puan", "Toplam", "Yüzde", "Kohort ortalaması"].map(csvCell).join(";"));
    for (const a of r.progress.attempts) {
      lines.push(
        [a.examTitle, a.examType === "MONTHLY" ? "Aylık" : "Haftalık", a.submittedAt.toISOString(), a.score ?? "", a.total ?? "", a.percentage ?? "", r.examCohortAverage[a.examId] ?? ""]
          .map(csvCell)
          .join(";"),
      );
    }
    lines.push("");
    lines.push(["Alt branş", "Doğru", "Toplam", "Yüzde"].map(csvCell).join(";"));
    for (const x of r.progress.accuracy) lines.push([SUBSPECIALTY_LABELS[x.subspecialty], x.correct, x.total, x.percentage].map(csvCell).join(";"));
    await audit(s.user.id, "report.export.resident", { type: "user", id: asistan });
  } else {
    const report = await getCohortReport({ residencyYear: yil });
    filename = `asistan-kohort${yil ? `-${yil}yil` : ""}.csv`;
    lines.push(["Ad", "Unvan", "E-posta", "Yıl", "Sınav sayısı", "Ortalama %", "Son aylık %", "Eğilim", "Zayıf alan", "Yorum", "Olgu", "Son giriş"].map(csvCell).join(";"));
    for (const r of report.residents) {
      lines.push(
        [
          r.name,
          r.title ?? "",
          r.email,
          r.residencyYear ?? "",
          r.examsTaken,
          r.averagePercentage ?? "",
          r.lastMonthly?.percentage ?? "",
          r.trendDelta ?? "",
          r.weakest ? `${SUBSPECIALTY_LABELS[r.weakest.subspecialty]} (%${r.weakest.percentage})` : "",
          r.commentCount,
          r.caseCount,
          r.lastLoginAt?.toISOString() ?? "",
        ]
          .map(csvCell)
          .join(";"),
      );
    }
    await audit(s.user.id, "report.export.cohort", undefined, { residencyYear: yil ?? null, count: report.residents.length });
  }

  const body = "﻿" + lines.join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
