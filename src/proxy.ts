import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (eski adıyla middleware):
 *  1) Her istek için nonce tabanlı Content-Security-Policy üretir.
 *  2) Oturum çerezi yoksa korumalı sayfalardan /giris'e iyimser yönlendirme yapar.
 *     (Asıl yetki kontrolü sunucu bileşenlerinde DAL ile yapılır; bu yalnızca ön filtredir.)
 */

const PUBLIC_PATHS = ["/giris", "/davet", "/manifest.webmanifest", "/sw.js", "/offline", "/yetkisiz", "/ikon"];
const SESSION_COOKIE = "oa_session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind v4 ve Next inline stilleri için; harici stil kaynağı yok.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    // Ders videoları yalnızca YouTube (gizlilik modu) ve Vimeo gömme ile
    "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!isPublic && !hasSession && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.search = pathname !== "/" ? `?sonraki=${encodeURIComponent(pathname)}` : "";
    const res = NextResponse.redirect(url);
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  if (pathname === "/" || pathname === "/giris") {
    if (hasSession && pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/panel";
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
