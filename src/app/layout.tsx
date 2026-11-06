import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SwRegister } from "@/components/layout/sw-register";

export const metadata: Metadata = {
  title: { default: "OftalmoAkademi", template: "%s · OftalmoAkademi" },
  description: "Yapay zekâ destekli oftalmoloji asistan eğitim ve akademik paylaşım platformu",
  applicationName: "OftalmoAkademi",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "OftalmoAkademi" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1c53f0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
