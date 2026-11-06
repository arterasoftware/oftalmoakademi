"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BookOpen,
  Newspaper,
  Stethoscope,
  ClipboardCheck,
  Sparkles,
  Calendar,
  Library,
  Settings,
  Users,
  Bell,
  UserCircle2,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "./logout-button";
import { NAV_SECTIONS, MOBILE_NAV_HREFS, type NavItem, type NavTone } from "./nav-config";
import type { UserRole } from "@/db/schema";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  "book-open": BookOpen,
  newspaper: Newspaper,
  stethoscope: Stethoscope,
  "clipboard-check": ClipboardCheck,
  sparkles: Sparkles,
  calendar: Calendar,
  library: Library,
  settings: Settings,
  users: Users,
  bell: Bell,
  user: UserCircle2,
  "circle-help": CircleHelp,
};

/** Modül tonu -> aktif durum renkleri (hafif arka plan + vurgu çubuğu + ikon rengi) */
export const TONE_ACTIVE: Record<NavTone, { bg: string; text: string; bar: string }> = {
  brand: { bg: "bg-tint-brand", text: "text-brand-700 dark:text-brand-200", bar: "bg-brand-600" },
  clinical: { bg: "bg-tint-clinical", text: "text-teal-700 dark:text-teal-200", bar: "bg-teal-600" },
  exam: { bg: "bg-tint-exam", text: "text-amber-800 dark:text-amber-200", bar: "bg-amber-500" },
  ai: { bg: "bg-tint-ai", text: "text-violet-700 dark:text-violet-200", bar: "bg-violet-600" },
  neutral: { bg: "bg-tint-neutral", text: "text-ink", bar: "bg-ink-muted" },
};

function visible(items: NavItem[], role: UserRole): NavItem[] {
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = ICONS[item.icon] ?? Home;
  const tone = TONE_ACTIVE[item.tone ?? "neutral"];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.description}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
        active ? cn(tone.bg, tone.text) : "text-ink-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      {active && <span className={cn("absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r", tone.bar)} aria-hidden />}
      <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "" : "text-ink-faint group-hover:text-ink-muted")} aria-hidden />
      <span className="truncate">{item.label}</span>
      {badge ? <span className="ml-auto rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] leading-none text-white">{badge > 99 ? "99+" : badge}</span> : null}
    </Link>
  );
}

export function Sidebar({ role, unread, userName, roleLabel }: { role: UserRole; unread: number; userName: string; roleLabel: string }) {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex" aria-label="Ana menü">
      <Link href="/panel" className="flex items-center gap-2.5 px-4 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-[13px] font-bold text-white">OA</span>
        <span className="text-[15px] font-semibold tracking-tight text-ink">OftalmoAkademi</span>
      </Link>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section) => {
          const items = visible(section.items, role);
          if (items.length === 0) return null;
          return (
            <div key={section.label}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{section.label}</p>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-0.5 border-t border-border px-3 py-3">
        <NavLink item={{ href: "/bildirimler", label: "Bildirimler", icon: "bell", tone: "neutral" }} active={isActive(pathname, "/bildirimler")} badge={unread} />
        <Link
          href="/profil"
          aria-current={isActive(pathname, "/profil") ? "page" : undefined}
          className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors", isActive(pathname, "/profil") ? "bg-tint-neutral text-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink")}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-muted text-[11px] font-semibold text-ink">{userName.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{userName}</span>
            <span className="block truncate text-[11px] text-ink-faint">{roleLabel}</span>
          </span>
        </Link>
        <LogoutButton className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink" />
      </div>
    </nav>
  );
}

export function MobileNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const items = NAV_SECTIONS.flatMap((s) => visible(s.items, role)).filter((i) => MOBILE_NAV_HREFS.includes(i.href));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface/95 pb-safe backdrop-blur lg:hidden" aria-label="Alt menü">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? Home;
        const active = isActive(pathname, item.href);
        const tone = TONE_ACTIVE[item.tone ?? "neutral"];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? tone.text : "text-ink-faint")}
          >
            {active && <span className={cn("absolute top-0 h-0.5 w-8 rounded-b", tone.bar)} aria-hidden />}
            <span className={cn("grid h-7 w-10 place-items-center rounded-lg", active && tone.bg)}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
