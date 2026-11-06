/**
 * Migrasyon çalıştırıcı (uygulama başlangıcında ve `npm run db:migrate` ile).
 * `drizzle/` klasöründeki SQL dosyalarını uygular.
 */
import path from "node:path";
import { sql } from "drizzle-orm";
import { acquirePgliteLock } from "./pglite-lock";

export async function runMigrations() {
  const url = process.env.DATABASE_URL || "";
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (url) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 1 });
    const db = drizzle(client);
    await db.execute(sql`create extension if not exists vector`);
    await migrate(db, { migrationsFolder });
    await client.end();
    return "postgres";
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dataDir = path.join(process.cwd(), "data", "pglite");
  const release = acquirePgliteLock(dataDir, "betik");
  const client = await PGlite.create({ dataDir, extensions: { vector } });
  const db = drizzle(client);
  await db.execute(sql`create extension if not exists vector`);
  await migrate(db, { migrationsFolder });
  await client.close();
  release();
  return "pglite";
}
