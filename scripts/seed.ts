/**
 * İlk yönetici hesabını oluşturur (davet sistemi için bir başlangıç noktası gerekir).
 * Kullanım: BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_PASSWORD ortam değişkenleriyle `npm run db:seed`.
 * Yalnızca hiç kullanıcı yokken çalışır.
 */
import { runMigrations } from "../src/db/migrate";

async function main() {
  await runMigrations();
  const { getDb, schema } = await import("../src/db");
  const { hashPassword, passwordPolicyError } = await import("../src/lib/auth/password");
  const { count } = await import("drizzle-orm");

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !name || !password) {
    console.error("BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME ve BOOTSTRAP_ADMIN_PASSWORD gerekli.");
    process.exit(1);
  }
  const policy = passwordPolicyError(password, email);
  if (policy) {
    console.error(policy);
    process.exit(1);
  }
  const db = await getDb();
  const [{ c }] = await db.select({ c: count() }).from(schema.users);
  if (Number(c) > 0) {
    console.log("Kullanıcı tablosu boş değil; ilk yönetici oluşturma atlandı.");
    process.exit(0);
  }
  await db.insert(schema.users).values({ email, name, role: "ADMIN", passwordHash: await hashPassword(password), title: "Yönetici" });
  await db.insert(schema.auditLogs).values({ actorId: null, action: "system.bootstrap_admin", metadata: { email } });
  console.log(`İlk yönetici oluşturuldu: ${email}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
