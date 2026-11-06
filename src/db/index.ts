import "server-only";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/lib/env";
import path from "node:path";
import { acquirePgliteLock } from "./pglite-lock";

/**
 * Veritabanı erişim katmanı.
 *
 * - Üretim: DATABASE_URL (PostgreSQL 16+ ve pgvector).
 * - Geliştirme: DATABASE_URL boşsa gömülü PGlite (./data/pglite). Aynı SQL lehçesi,
 *   aynı şema; bu sayede yerel geliştirme için Docker gerekmez.
 *
 * Tüm modüller yalnızca bu `db` nesnesini kullanır; sürücü farkı burada gizlenir.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Globals = typeof globalThis & { __oftalmoDb?: Promise<Db>; __oftalmoFtsConfig?: string };
const g = globalThis as Globals;

async function createDb(): Promise<Db> {
  const url = env().DATABASE_URL;
  if (url) {
    const client = postgres(url, {
      max: 10,
      prepare: false,
      ssl: url.includes("sslmode=require") ? "require" : undefined,
    });
    const db = drizzlePg(client, { schema, casing: "snake_case" }) as unknown as Db;
    await ensureExtensions(db);
    return db;
  }

  // Gömülü PGlite
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const dataDir = path.join(process.cwd(), "data", "pglite");
  acquirePgliteLock(dataDir, "uygulama");
  const client = await PGlite.create({ dataDir, extensions: { vector } });
  const db = drizzlePglite(client, { schema, casing: "snake_case" }) as unknown as Db;
  await ensureExtensions(db);
  return db;
}

async function ensureExtensions(db: Db) {
  const { sql } = await import("drizzle-orm");
  try {
    await db.execute(sql`create extension if not exists vector`);
  } catch {
    // pgvector yoksa embedding sütunu oluşturulamaz; migrasyon hata verir.
  }
  // Tam metin arama yapılandırması: türkçe varsa onu, yoksa 'simple' kullan.
  try {
    const r = await db.execute(sql`select 1 as ok from pg_ts_config where cfgname = 'turkish'`);
    const rows = (r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[]);
    g.__oftalmoFtsConfig = Array.isArray(rows) && rows.length > 0 ? "turkish" : "simple";
  } catch {
    g.__oftalmoFtsConfig = "simple";
  }
}

export function getDb(): Promise<Db> {
  if (!g.__oftalmoDb) g.__oftalmoDb = createDb();
  return g.__oftalmoDb;
}

/** Tam metin arama için kullanılacak PostgreSQL text search yapılandırması. */
export function ftsConfig(): string {
  return g.__oftalmoFtsConfig ?? "simple";
}

export { schema };
