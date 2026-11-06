import "server-only";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000; // 6 saatte bir "zamanı geldi mi?" denetimi
const FIRST_CHECK_MS = 2 * 60 * 1000; // açılıştan 2 dk sonra ilk denetim

type G = typeof globalThis & { __oaArticleScanTimer?: ReturnType<typeof setInterval> };

/**
 * Sunucu içi basit zamanlayıcı (tek örnek dağıtım için). Ayarlardaki aralık dolduysa taramayı başlatır.
 * Çok örnekli dağıtımda ARTICLE_SCAN_SCHEDULER=0 yapılıp tarama dış bir cron ile tetiklenmelidir.
 */
export function startArticleScanScheduler() {
  const g = globalThis as G;
  if (g.__oaArticleScanTimer) return;
  const tick = async () => {
    try {
      const { runScanIfDue } = await import("./scan");
      const r = await runScanIfDue();
      if (r) console.log(`[makale-tarama] planlı tarama: ${r.added} yeni aday${r.failedQueries.length ? `, başarısız: ${r.failedQueries.join(", ")}` : ""}`);
    } catch (e) {
      console.error("[makale-tarama] zamanlayıcı", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(tick, FIRST_CHECK_MS);
  g.__oaArticleScanTimer = setInterval(tick, CHECK_EVERY_MS);
}
