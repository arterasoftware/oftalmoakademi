import "server-only";
import { and, eq, isNull, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { randomToken, sha256Hex } from "@/lib/crypto";
import type { UserRole } from "@/db/schema";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createInvitation(opts: { email: string; name?: string; role: UserRole; invitedBy: string }) {
  const db = await getDb();
  const token = randomToken(32);
  const [row] = await db
    .insert(schema.invitations)
    .values({
      email: opts.email.trim().toLowerCase(),
      name: opts.name?.trim() || null,
      role: opts.role,
      tokenHash: sha256Hex(token),
      invitedBy: opts.invitedBy,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    })
    .returning();
  return { invitation: row, token };
}

export async function findValidInvitation(token: string) {
  if (!token || token.length < 20) return null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.invitations)
    .where(
      and(
        eq(schema.invitations.tokenHash, sha256Hex(token)),
        isNull(schema.invitations.acceptedAt),
        isNull(schema.invitations.revokedAt),
        gt(schema.invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
