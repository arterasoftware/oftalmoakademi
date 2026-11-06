"use client";

import { useEffect } from "react";

/** Service worker kaydı (PWA). Yalnızca üretimde veya HTTPS/localhost'ta çalışır. */
export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
