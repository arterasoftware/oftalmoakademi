import "server-only";
import { and, count, desc, eq, gte, inArray, like, sql, sum, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { estimateCostUsd } from "@/lib/ai/pricing";

/* ------------------------------ Genel bakış ------------------------------- */

export async function getOverview() {
  const db = await getDb();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [byRole, pendingSources, usage, fileCount, activeUsers, suspendedUsers] = await Promise.all([
    db.select({ role: schema.users.role, c: count() }).from(schema.users).groupBy(schema.users.role),
    db.select({ c: count() }).from(schema.sources).where(and(eq(schema.sources.approved, false), eq(schema.sources.status, "READY"))),
    db
      .select({
        model: schema.aiUsage.model,
        input: sum(schema.aiUsage.inputTokens),
        output: sum(schema.aiUsage.outputTokens),
        cache: sum(schema.aiUsage.cacheReadTokens),
        calls: count(),
      })
      .from(schema.aiUsage)
      .where(gte(schema.aiUsage.createdAt, monthStart))
      .groupBy(schema.aiUsage.model),
    db.select({ c: count() }).from(schema.files),
    db.select({ c: count() }).from(schema.users).where(eq(schema.users.status, "ACTIVE")),
    db.select({ c: count() }).from(schema.users).where(eq(schema.users.status, "SUSPENDED")),
  ]);

  const roles: Record<schema.UserRole, number> = { ADMIN: 0, FACULTY: 0, RESIDENT: 0 };
  for (const r of byRole) roles[r.role] = Number(r.c);

  return {
    roles,
    activeUsers: Number(activeUsers[0]?.c ?? 0),
    suspendedUsers: Number(suspendedUsers[0]?.c ?? 0),
    pending: {
      sources: Number(pendingSources[0]?.c ?? 0),
    },
    aiMonth: aggregateUsage(usage),
    fileCount: Number(fileCount[0]?.c ?? 0),
  };
}

/**
 * Model bazlı satırları toplar; maliyet her satırın KENDİ modeliyle hesaplanır (Gemini ücretsiz katman = 0,
 * Claude liste fiyatı). Fiyatı bilinmeyen model varsa toplam null döner ("—").
 */
function aggregateUsage(rows: { model: string; input: unknown; output: unknown; cache: unknown; calls: unknown }[]) {
  const out = { input: 0, output: 0, cache: 0, calls: 0, costUsd: 0 as number | null, models: [] as string[] };
  for (const r of rows) {
    const input = Number(r.input ?? 0);
    const output = Number(r.output ?? 0);
    const cache = Number(r.cache ?? 0);
    out.input += input;
    out.output += output;
    out.cache += cache;
    out.calls += Number(r.calls ?? 0);
    out.models.push(r.model);
    const c = estimateCostUsd(r.model, { input, output, cacheRead: cache });
    out.costUsd = out.costUsd === null || c === null ? null : out.costUsd + c;
  }
  return out;
}

/* ------------------------------- Kullanıcılar ----------------------------- */

export async function listUsers() {
  const db = await getDb();
  return db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      title: schema.users.title,
      role: schema.users.role,
      residencyYear: schema.users.residencyYear,
      status: schema.users.status,
      mfaEnabled: schema.users.mfaEnabled,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(schema.users.role, schema.users.name);
}

/* --------------------------------- Davetler ------------------------------- */

export type InvitationState = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export async function listInvitations() {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.invitations.id,
      email: schema.invitations.email,
      name: schema.invitations.name,
      role: schema.invitations.role,
      expiresAt: schema.invitations.expiresAt,
      acceptedAt: schema.invitations.acceptedAt,
      revokedAt: schema.invitations.revokedAt,
      createdAt: schema.invitations.createdAt,
      inviterName: schema.users.name,
    })
    .from(schema.invitations)
    .leftJoin(schema.users, eq(schema.invitations.invitedBy, schema.users.id))
    .orderBy(desc(schema.invitations.createdAt))
    .limit(200);
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    state: (r.acceptedAt ? "ACCEPTED" : r.revokedAt ? "REVOKED" : r.expiresAt.getTime() < now ? "EXPIRED" : "PENDING") as InvitationState,
  }));
}

/* ------------------------------ Denetim kayıtları ------------------------- */

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditLogs(opts: { page: number; actionPrefix?: string; actorId?: string }) {
  const db = await getDb();
  const conds: SQL[] = [];
  if (opts.actionPrefix) conds.push(like(schema.auditLogs.action, `${opts.actionPrefix.replace(/[%_]/g, "")}%`));
  if (opts.actorId) conds.push(eq(schema.auditLogs.actorId, opts.actorId));
  const where = conds.length ? and(...conds) : undefined;
  const offset = Math.max(0, opts.page - 1) * AUDIT_PAGE_SIZE;

  const [rows, total] = await Promise.all([
    db
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        entityType: schema.auditLogs.entityType,
        entityId: schema.auditLogs.entityId,
        metadata: schema.auditLogs.metadata,
        ip: schema.auditLogs.ip,
        createdAt: schema.auditLogs.createdAt,
        actorId: schema.auditLogs.actorId,
        actorName: schema.users.name,
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.auditLogs.actorId, schema.users.id))
      .where(where)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(AUDIT_PAGE_SIZE)
      .offset(offset),
    db.select({ c: count() }).from(schema.auditLogs).where(where),
  ]);
  return { rows, total: Number(total[0]?.c ?? 0), pageSize: AUDIT_PAGE_SIZE };
}

/** Denetim filtresi için aktör listesi (yalnızca kayıt bırakmış kullanıcılar). */
export async function listAuditActors() {
  const db = await getDb();
  const ids = await db.selectDistinct({ actorId: schema.auditLogs.actorId }).from(schema.auditLogs);
  const list = ids.map((r) => r.actorId).filter((x): x is string => Boolean(x));
  if (!list.length) return [];
  return db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, list)).orderBy(schema.users.name);
}

/* --------------------------------- Kullanım ------------------------------- */

export type UsageRow = { key: string; model: string; input: number; output: number; cache: number; calls: number; costUsd: number | null };

function withCost(rows: { key: string; model: string; input: unknown; output: unknown; cache: unknown; calls: unknown }[]): UsageRow[] {
  return rows.map((r) => {
    const input = Number(r.input ?? 0);
    const output = Number(r.output ?? 0);
    const cache = Number(r.cache ?? 0);
    return { key: r.key, model: r.model, input, output, cache, calls: Number(r.calls ?? 0), costUsd: estimateCostUsd(r.model, { input, output, cacheRead: cache }) };
  });
}

/** Özellik + model bazında toplamlar (tüm zamanlar). */
export async function usageByFeature(): Promise<UsageRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      key: schema.aiUsage.feature,
      model: schema.aiUsage.model,
      input: sum(schema.aiUsage.inputTokens),
      output: sum(schema.aiUsage.outputTokens),
      cache: sum(schema.aiUsage.cacheReadTokens),
      calls: count(),
    })
    .from(schema.aiUsage)
    .groupBy(schema.aiUsage.feature, schema.aiUsage.model)
    .orderBy(schema.aiUsage.feature);
  return withCost(rows);
}

/** Ay + model bazında toplamlar (son 12 ay). */
export async function usageByMonth(): Promise<UsageRow[]> {
  const db = await getDb();
  const since = new Date();
  since.setMonth(since.getMonth() - 11);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  const month = sql<string>`to_char(date_trunc('month', ${schema.aiUsage.createdAt}), 'YYYY-MM')`;
  const rows = await db
    .select({
      key: month,
      model: schema.aiUsage.model,
      input: sum(schema.aiUsage.inputTokens),
      output: sum(schema.aiUsage.outputTokens),
      cache: sum(schema.aiUsage.cacheReadTokens),
      calls: count(),
    })
    .from(schema.aiUsage)
    .where(gte(schema.aiUsage.createdAt, since))
    .groupBy(month, schema.aiUsage.model)
    .orderBy(desc(month));
  return withCost(rows);
}

export const FEATURE_LABELS: Record<string, string> = {
  qa: "Soru-cevap (asistan)",
  lesson_draft: "Ders taslağı",
  quiz_gen: "Sınav sorusu üretimi",
  article_eval: "Makale değerlendirme",
  article_suggest: "Makale önerisi",
  case_hint: "Olgu ipucu",
  discussion_summary: "Tartışma özeti",
  summary: "Özet",
};
