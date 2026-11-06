/**
 * Sunucu başlangıç kancası (Next.js instrumentation).
 * Geliştirmede (gömülü PGlite) bekleyen migrasyonlar açılışta otomatik uygulanır; böylece şema değişikliğinden
 * sonra yalnızca `npm run dev`'i yeniden başlatmak yeter. Üretimde `AUTO_MIGRATE=1` ile açılır (tek örnek dağıtım).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const auto = process.env.AUTO_MIGRATE === "1" || (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production");
  if (auto) {
    try {
      const { runMigrations } = await import("@/db/migrate");
      const driver = await runMigrations();
      console.log(`[db] migrasyonlar güncel (${driver})`);
    } catch (e) {
      console.error("[db] açılışta migrasyon uygulanamadı:", e instanceof Error ? e.message : e);
    }
  }
  // Haftalık PubMed makale taraması (ayarlardan açılıp kapatılır; ARTICLE_SCAN_SCHEDULER=0 ile tamamen devre dışı)
  if (process.env.ARTICLE_SCAN_SCHEDULER !== "0" && process.env.NODE_ENV !== "test") {
    const { startArticleScanScheduler } = await import("@/lib/articles/scan-scheduler");
    startArticleScanScheduler();
  }
}
