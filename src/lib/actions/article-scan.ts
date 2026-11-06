"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schema } from "@/db";
import { assertAdmin, assertStaff, AuthError } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/auth/rate-limit";
import { fail, success, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { getScanSettings, runArticleScan, saveScanSettings } from "@/lib/articles/scan";
import type { ScanSummary } from "@/lib/articles/pubmed";
import { SUBSPECIALTY_LABELS, type Subspecialty } from "@/db/schema";

function describe(r: ScanSummary): string {
  const parts = (Object.entries(r.perSubspecialty) as [Subspecialty, number][]).filter(([, n]) => n > 0).map(([s, n]) => `${SUBSPECIALTY_LABELS[s]} ${n}`);
  const full = r.queueFull?.length ? ` Bekleyen aday sınırı dolu olduğu için atlanan: ${r.queueFull.join(", ")} (seçtikçe veya reddettikçe yer açılır).` : "";
  const base = (r.added ? `${r.added} yeni aday eklendi (${parts.join(", ")}).` : "Yeni aday eklenmedi; bulunanlar zaten kuyrukta veya arşivde.") + full;
  return r.failedQueries.length ? `${base} Ulaşılamayan aramalar: ${r.failedQueries.join(", ")}.` : base;
}

/** Personel elle tarama başlatır (saatte en fazla 4). */
export async function runScanNowAction(): Promise<ActionResult<ScanSummary>> {
  try {
    const user = await assertStaff();
    if (!(await consumeRateLimit(`scan:${user.id}`, 4, 60 * 60))) return fail("Saatte en fazla 4 tarama yapılabilir; biraz bekleyin.");
    const r = await runArticleScan({ trigger: "manual", userId: user.id });
    revalidatePath("/makaleler/oneriler");
    revalidatePath("/makaleler");
    if (r.added === 0 && r.failedQueries.length && Object.keys(r.perSubspecialty).length === 0) return fail(`PubMed'e ulaşılamadı (${r.failedQueries.join(", ")}). Daha sonra tekrar deneyin.`);
    return success(r, describe(r));
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[makale-tarama] elle", e);
    return fail("Tarama tamamlanamadı.");
  }
}

const settingsSchema = z.object({
  enabled: z.enum(["on"]).optional(),
  highEvidenceOnly: z.enum(["on"]).optional(),
  intervalDays: z.coerce.number().int().min(1, "En az 1 gün.").max(60, "En fazla 60 gün."),
  lookbackDays: z.coerce.number().int().min(7, "En az 7 gün.").max(180, "En fazla 180 gün."),
  perQuery: z.coerce.number().int().min(1, "En az 1.").max(10, "En fazla 10."),
});

/** Yalnızca yönetici: tarama ayarları ve alt dal sorguları. */
export async function saveScanSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const admin = await assertAdmin();
    const parsed = settingsSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) return fail("Ayarları kontrol edin.", zodFieldErrors(parsed.error.issues));
    const d = parsed.data;
    const queries: Partial<Record<Subspecialty, string>> = {};
    for (const sub of schema.subspecialtyEnum.enumValues) {
      const q = String(formData.get(`q_${sub}`) ?? "").trim();
      if (q.length > 1000) return fail(`${SUBSPECIALTY_LABELS[sub]} sorgusu çok uzun (en fazla 1000 karakter).`);
      if (q && (q.match(/\(/g)?.length ?? 0) !== (q.match(/\)/g)?.length ?? 0)) return fail(`${SUBSPECIALTY_LABELS[sub]} sorgusunda parantezler dengesiz.`);
      queries[sub] = q;
    }
    const prev = await getScanSettings();
    const next = { ...prev, enabled: d.enabled === "on", highEvidenceOnly: d.highEvidenceOnly === "on", intervalDays: d.intervalDays, lookbackDays: d.lookbackDays, perQuery: d.perQuery, queries };
    await saveScanSettings(next, admin.id);
    await audit(admin.id, "settings.article_scan.update", { type: "settings", id: "article_scan" }, { enabled: next.enabled, intervalDays: next.intervalDays, lookbackDays: next.lookbackDays, perQuery: next.perQuery });
    revalidatePath("/makaleler/oneriler");
    return success(undefined, "Tarama ayarları kaydedildi.");
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message);
    console.error("[makale-tarama] ayar", e);
    return fail("Ayarlar kaydedilemedi.");
  }
}
