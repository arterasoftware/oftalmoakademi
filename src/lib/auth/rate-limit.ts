import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

/**
 * Sabit pencereli oran sınırlayıcı (veritabanı tabanlı; çoklu örnekte de çalışır).
 * @returns true -> izin ver, false -> sınır aşıldı
 */
export async function consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = await getDb();
  const res = await db.execute(sql`
    insert into rate_limits (key, count, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count
  `);
  const rows = ((res as unknown as { rows?: { count: number }[] }).rows ?? (res as unknown as { count: number }[])) as {
    count: number | string;
  }[];
  const count = Number(rows[0]?.count ?? 0);
  return count <= limit;
}

export const RATE_LIMITS = {
  loginPerIp: { limit: 20, window: 15 * 60 },
  loginPerEmail: { limit: 8, window: 15 * 60 },
  mfaPerSession: { limit: 6, window: 10 * 60 },
  aiPerUser: { limit: 40, window: 60 * 60 },
  uploadPerUser: { limit: 30, window: 60 * 60 },
  commentPerUser: { limit: 30, window: 10 * 60 },
} as const;
