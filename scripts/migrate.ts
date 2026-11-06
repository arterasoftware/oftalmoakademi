import { runMigrations } from "../src/db/migrate";

runMigrations()
  .then((driver) => {
    console.log(`Migrasyonlar uygulandı (${driver}).`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Migrasyon hatası:", e);
    process.exit(1);
  });
