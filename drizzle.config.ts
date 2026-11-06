import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Yalnızca migrasyon dosyası üretimi için kullanılır; bağlantı bilgisi gerekmez.
  dbCredentials: { url: process.env.DATABASE_URL || "postgres://localhost:5432/oftalmoakademi" },
  strict: true,
  verbose: true,
});
