"use client";

import { createElement, useEffect, useState } from "react";

/**
 * glTF/GLB 3B model görüntüleyici (@google/model-viewer web bileşeni, paketle birlikte sunulur; CDN yok).
 * Dosya yetkili /api/dosya rotasından yüklenir.
 */
export function ModelViewer({ src, alt }: { src: string; alt: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    import("@google/model-viewer").then(() => active && setReady(true)).catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!ready) return <div className="grid h-72 w-full place-items-center rounded-xl bg-surface-muted text-sm text-ink-muted">3B görüntüleyici yükleniyor…</div>;
  return createElement("model-viewer", {
    src,
    alt,
    "camera-controls": "",
    "auto-rotate": "",
    "disable-zoom": "", // fare tekerleği sayfayı kaydırmaya devam etsin
    "interaction-prompt": "none",
    "touch-action": "pan-y",
    "shadow-intensity": "1",
    style: { width: "100%", height: "22rem", background: "transparent", borderRadius: "0.75rem" },
  });
}
