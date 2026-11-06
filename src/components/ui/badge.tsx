import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "ai";

const tones: Record<Tone, string> = {
  neutral: "bg-tint-neutral text-ink-muted ring-1 ring-inset ring-border",
  brand: "bg-tint-brand text-brand-700 dark:text-brand-200",
  success: "bg-tint-success text-emerald-700 dark:text-emerald-200",
  warning: "bg-tint-exam text-amber-800 dark:text-amber-200",
  danger: "bg-tint-danger text-red-700 dark:text-red-200",
  info: "bg-tint-clinical text-teal-700 dark:text-teal-200",
  ai: "bg-tint-ai text-violet-700 dark:text-violet-200",
};

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11.5px] font-medium leading-5", tones[tone], className)}
      {...props}
    />
  );
}

/** Yapay zekâ üretimi içeriği uzman onaylı içerikten ayırt eden etiket. */
export function AiBadge({ label = "Yapay zekâ taslağı" }: { label?: string }) {
  return (
    <Badge tone="ai" title="Bu içerik yapay zekâ tarafından üretildi ve uzman onayı gerektirir.">
      ✦ {label}
    </Badge>
  );
}
