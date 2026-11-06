/**
 * CLI betikleri için modül çözümleme kancası: Next dışı ortamda `server-only`
 * paketini boş bir modülle değiştirir (bu paket yalnızca Sunucu Bileşeni bağlamında yüklenebilir).
 * registerHooks hem ESM hem CommonJS çözümlemesini kapsar.
 */
import { registerHooks } from "node:module";

const stub = new URL("./server-only-stub.mjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: stub, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
