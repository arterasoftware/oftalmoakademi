"use server";

import QRCode from "qrcode";
import { beginMfaSetupAction } from "@/lib/actions/auth";
import { fail, success, type ActionResult } from "@/lib/action-result";

/**
 * MFA kurulumu için QR kodu sunucuda üretir (otpauth URI istemciye ham olarak gitmez;
 * yalnızca görüntü ve elle giriş için base32 anahtar döner). Şifreli sır, onay formunda
 * gizli alan olarak geri gönderilir; `confirmMfaSetupAction` doğrular.
 */
export async function startMfaSetupAction(): Promise<ActionResult<{ qrDataUrl: string; base32: string; secretEnc: string }>> {
  const r = await beginMfaSetupAction();
  if (!r.ok) return fail(r.error);
  if (!r.data) return fail("MFA kurulumu başlatılamadı.");
  try {
    const qrDataUrl = await QRCode.toDataURL(r.data.uri, { margin: 1, width: 220, errorCorrectionLevel: "M" });
    return success({ qrDataUrl, base32: r.data.base32, secretEnc: r.data.secretEnc });
  } catch (e) {
    console.error(e);
    return fail("QR kodu oluşturulamadı.");
  }
}
