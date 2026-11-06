import type { NextConfig } from "next";

/**
 * Statik güvenlik başlıkları. CSP (nonce tabanlı) src/proxy.ts içinde üretilir;
 * burada yalnızca isteğe bağlı olmayan sabit başlıklar bulunur.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  // Kimlik doğrulamalı, tamamen dinamik bir uygulama: Cache Components kapalı.
  cacheComponents: false,
  poweredByHeader: false,
  reactStrictMode: true,
  output: "standalone",
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@electric-sql/pglite-pgvector",
    "@node-rs/argon2",
    "sharp",
    "unpdf",
    "postgres",
  ],
  images: {
    // Yüklenen görseller yalnızca yetkili /api/dosya rotası üzerinden sunulur.
    remotePatterns: [],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "160mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
