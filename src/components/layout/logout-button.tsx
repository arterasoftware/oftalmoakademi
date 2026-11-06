"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";
import { logoutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

/**
 * Her sayfadan erişilebilen çıkış düğmesi (kenar çubuğu alt kısmı ve mobil üst çubuk).
 * Profil sayfasındaki düğmeyle aynı sunucu eylemini kullanır.
 */
export function LogoutButton({ className, iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  return (
    <form action={logoutAction} className={iconOnly ? "contents" : undefined}>
      <Inner className={className} iconOnly={iconOnly} />
    </form>
  );
}

function Inner({ className, iconOnly }: { className?: string; iconOnly: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-label={iconOnly ? "Çıkış yap" : undefined} title="Çıkış yap" className={cn(className, pending && "opacity-60")}>
      <LogOut className={iconOnly ? "h-5 w-5" : "h-4 w-4 shrink-0"} aria-hidden />
      {!iconOnly && <span>{pending ? "Çıkış yapılıyor…" : "Çıkış yap"}</span>}
    </button>
  );
}
