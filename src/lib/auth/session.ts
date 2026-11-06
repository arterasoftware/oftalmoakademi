import "server-only";
import { cookies } from "next/headers";
import { and, eq, lt, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { randomToken, sha256Hex } from "@/lib/crypto";
import { isProd } from "@/lib/env";

export const SESSION_COOKIE = "oa_session";
/** Mutlak oturum süresi: 7 gün. */
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000;
/** Hareketsizlik süresi: 12 saat. */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;

export type SessionWithUser = {
  session: typeof schema.sessions.$inferSelect;
  user: typeof schema.users.$inferSelect;
};

export async function createSession(opts: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
  mfaVerified: boolean;
}): Promise<{ token: string; id: string }> {
  const db = await getDb();
  const token = randomToken(32);
  const now = Date.now();
  const [row] = await db
    .insert(schema.sessions)
    .values({
      userId: opts.userId,
      tokenHash: sha256Hex(token),
      mfaVerified: opts.mfaVerified,
      expiresAt: new Date(now + SESSION_ABSOLUTE_MS),
      idleExpiresAt: new Date(now + SESSION_IDLE_MS),
      ip: opts.ip ?? null,
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
    })
    .returning({ id: schema.sessions.id });
  return { token, id: row.id };
}

/** Belirteci doğrular; geçerliyse hareketsizlik süresini kaydırır. */
export async function validateSessionToken(token: string): Promise<SessionWithUser | null> {
  if (!token || token.length < 20) return null;
  const db = await getDb();
  const tokenHash = sha256Hex(token);
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt.getTime() < now || row.session.idleExpiresAt.getTime() < now) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, row.session.id));
    return null;
  }
  if (row.user.status !== "ACTIVE") return null;

  // Hareketsizlik süresini en fazla dakikada bir güncelle (yazma yükünü azaltır)
  if (now - row.session.lastSeenAt.getTime() > 60_000) {
    await db
      .update(schema.sessions)
      .set({
        lastSeenAt: new Date(now),
        idleExpiresAt: new Date(Math.min(now + SESSION_IDLE_MS, row.session.expiresAt.getTime())),
      })
      .where(eq(schema.sessions.id, row.session.id));
  }
  return row;
}

export async function markSessionMfaVerified(sessionId: string) {
  const db = await getDb();
  await db.update(schema.sessions).set({ mfaVerified: true }).where(eq(schema.sessions.id, sessionId));
}

export async function invalidateSession(sessionId: string) {
  const db = await getDb();
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

export async function invalidateAllUserSessions(userId: string, exceptSessionId?: string) {
  const db = await getDb();
  if (exceptSessionId) {
    const { ne } = await import("drizzle-orm");
    await db
      .delete(schema.sessions)
      .where(and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, exceptSessionId)));
  } else {
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  }
}

export async function purgeExpiredSessions() {
  const db = await getDb();
  const now = new Date();
  await db.delete(schema.sessions).where(or(lt(schema.sessions.expiresAt, now), lt(schema.sessions.idleExpiresAt, now)));
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_ABSOLUTE_MS / 1000),
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/", maxAge: 0 });
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}
