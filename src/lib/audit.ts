import "server-only";
import { getDb, schema } from "@/db";
import { getClientIp } from "@/lib/request";

/**
 * Denetim kaydı: tüm önemli içerik değişiklikleri, onaylar ve yönetim işlemleri.
 * Hata fırlatmaz; asıl işlemi engellememek için sessizce loglar.
 */
export async function audit(
  actorId: string | null,
  action: string,
  entity?: { type: string; id: string },
  metadata?: Record<string, unknown>,
) {
  try {
    const db = await getDb();
    const ip = await getClientIp().catch(() => null);
    await db.insert(schema.auditLogs).values({
      actorId,
      action,
      entityType: entity?.type ?? null,
      entityId: entity?.id ?? null,
      metadata: metadata ?? null,
      ip,
    });
  } catch (e) {
    console.error("[audit] kayıt yazılamadı", action, e);
  }
}
