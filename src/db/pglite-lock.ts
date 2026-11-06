import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

/**
 * PGlite tek süreçlidir: aynı veri dizinini iki sürecin (ör. dev sunucusu + seed betiği)
 * aynı anda açması veri bozulmasına yol açar. Bu kilit, ikinci süreci açık bir hata ile durdurur.
 */
export function acquirePgliteLock(dataDir: string, owner: string) {
  mkdirSync(path.dirname(dataDir), { recursive: true });
  const lockPath = `${dataDir}.lock`;
  if (existsSync(lockPath)) {
    try {
      const { pid, owner: other } = JSON.parse(readFileSync(lockPath, "utf8")) as { pid: number; owner: string };
      if (pid !== process.pid && isAlive(pid)) {
        throw new Error(
          `Gömülü veritabanı başka bir süreç tarafından kullanılıyor (${other}, pid ${pid}). ` +
            `Önce o süreci (ör. 'npm run dev') durdurun; PGlite aynı anda tek süreç tarafından açılabilir.`,
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Gömülü veritabanı")) throw e;
      // bozuk kilit dosyası: üzerine yaz
    }
  }
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, owner, at: new Date().toISOString() }));
  const release = () => {
    try {
      const cur = JSON.parse(readFileSync(lockPath, "utf8")) as { pid: number };
      if (cur.pid === process.pid) unlinkSync(lockPath);
    } catch {
      /* yok say */
    }
  };
  process.once("exit", release);
  return release;
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
