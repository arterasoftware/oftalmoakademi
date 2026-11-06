/**
 * Kaynak indeksleme (CLI). Kullanım:
 *   npm run db:ingest -- <sourceId>   # tek kaynağı yeniden indeksler
 *   npm run db:ingest -- all          # tüm kaynakları yeniden indeksler
 *   npm run db:ingest -- failed       # yalnızca FAILED/PENDING durumundakileri indeksler
 */
import { runMigrations } from "../src/db/migrate";

async function main() {
  const arg = process.argv[2]?.trim();
  if (!arg) {
    console.error("Kullanım: npm run db:ingest -- <sourceId|all|failed>");
    process.exit(1);
  }
  await runMigrations();
  const { getDb, schema } = await import("../src/db");
  const { ingestSource } = await import("../src/lib/ai/rag/ingest");
  const { inArray, eq } = await import("drizzle-orm");
  const db = await getDb();

  let ids: { id: string; title: string }[];
  if (arg === "all") {
    ids = await db.select({ id: schema.sources.id, title: schema.sources.title }).from(schema.sources);
  } else if (arg === "failed") {
    ids = await db
      .select({ id: schema.sources.id, title: schema.sources.title })
      .from(schema.sources)
      .where(inArray(schema.sources.status, ["FAILED", "PENDING"]));
  } else {
    if (!/^[0-9a-f-]{36}$/i.test(arg)) {
      console.error("Geçersiz kaynak kimliği.");
      process.exit(1);
    }
    ids = await db.select({ id: schema.sources.id, title: schema.sources.title }).from(schema.sources).where(eq(schema.sources.id, arg));
    if (!ids.length) {
      console.error("Kaynak bulunamadı.");
      process.exit(1);
    }
  }

  let ok = 0;
  let failed = 0;
  for (const s of ids) {
    const t0 = Date.now();
    try {
      const { chunks } = await ingestSource(s.id);
      ok++;
      console.log(`✔ ${s.title} (${s.id}): ${chunks} parça, ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
    } catch (e) {
      failed++;
      console.error(`✘ ${s.title} (${s.id}): ${e instanceof Error ? e.message : e}`);
    }
  }
  await db.insert(schema.auditLogs).values({ actorId: null, action: "system.ingest_cli", metadata: { arg, ok, failed } });
  console.log(`Tamamlandı: ${ok} başarılı, ${failed} başarısız.`);
  process.exit(failed ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
