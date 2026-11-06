import * as React from "react";
import { Info, CheckCircle2, AlertTriangle, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";
const tones: Record<Tone, { box: string; icon: React.ReactNode }> = {
  info: { box: "border-brand-200/70 bg-tint-brand text-ink dark:border-brand-900", icon: <Info className="h-4 w-4 text-brand-600" /> },
  success: { box: "border-emerald-200/70 bg-tint-success text-ink dark:border-emerald-900", icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" /> },
  warning: { box: "border-amber-200/70 bg-tint-exam text-ink dark:border-amber-900", icon: <AlertTriangle className="h-4 w-4 text-amber-600" /> },
  danger: { box: "border-red-200/70 bg-tint-danger text-ink dark:border-red-900", icon: <OctagonAlert className="h-4 w-4 text-red-600" /> },
};

export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children?: React.ReactNode; className?: string }) {
  const t = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-lg border px-3.5 py-3 text-[13.5px] leading-snug", t.box, className)}>
      <span className="mt-0.5 shrink-0" aria-hidden>
        {t.icon}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-ink-muted" : undefined}>{children}</div>}
      </div>
    </div>
  );
}
