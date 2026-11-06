"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/yonetim", label: "Genel bakış" },
  { href: "/yonetim/kullanicilar", label: "Kullanıcılar" },
  { href: "/yonetim/davetler", label: "Davetler" },
  { href: "/yonetim/kaynaklar", label: "Kaynaklar" },
  { href: "/yonetim/denetim", label: "Denetim kayıtları" },
  { href: "/yonetim/yz-ayarlari", label: "Yapay zekâ ayarları" },
  { href: "/yonetim/kullanim", label: "Kullanım" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Yönetim sekmeleri" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = t.href === "/yonetim" ? pathname === "/yonetim" : pathname.startsWith(t.href);
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 px-3 py-2 text-sm font-medium",
                  active ? "border-brand-600 text-brand-700 dark:text-brand-200" : "border-transparent text-ink-muted hover:border-border hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
