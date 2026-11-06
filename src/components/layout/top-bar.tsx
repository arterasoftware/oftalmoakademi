"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, UserCircle2 } from "lucide-react";
import { findLocation, subLocationLabel } from "./nav-config";
import { TONE_ACTIVE } from "./app-nav";
import { cn } from "@/lib/utils";
import { LogoutButton } from "./logout-button";

/**
 * Üst çubuk: kullanıcının nerede olduğunu gösteren kırıntı izi (modül rengiyle),
 * bildirim ve profil kısayolları. Mobilde marka + konum.
 */
export function TopBar({ unread }: { unread: number }) {
  const pathname = usePathname();
  const loc = findLocation(pathname);
  const sub = subLocationLabel(pathname);
  const tone = TONE_ACTIVE[loc?.tone ?? "neutral"];

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/panel" className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-600 text-[11px] font-bold text-white lg:hidden" aria-label="Ana sayfa">
            OA
          </Link>
          <nav aria-label="Konum" className="flex min-w-0 items-center gap-1 text-sm">
            {loc ? (
              <>
                <Link href={loc.href} className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 font-medium", tone.bg, tone.text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", tone.bar)} aria-hidden />
                  {loc.label}
                </Link>
                {sub && (
                  <>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                    <span className="truncate text-ink-muted">{sub}</span>
                  </>
                )}
              </>
            ) : (
              <span className="text-ink-muted">OftalmoAkademi</span>
            )}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Link href="/bildirimler" className="relative rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label={`Bildirimler${unread ? ` (${unread} okunmamış)` : ""}`}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-surface" aria-hidden />}
          </Link>
          <Link href="/profil" className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink lg:hidden" aria-label="Profilim">
            <UserCircle2 className="h-5 w-5" />
          </Link>
          <LogoutButton iconOnly className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted hover:text-ink lg:hidden" />
        </div>
      </div>
    </header>
  );
}
