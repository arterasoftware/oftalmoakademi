import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "none" | "brand" | "clinical" | "exam" | "ai" | "success" | "danger" | "neutral";
const headerTones: Record<Tone, string> = {
  none: "",
  brand: "bg-tint-brand",
  clinical: "bg-tint-clinical",
  exam: "bg-tint-exam",
  ai: "bg-tint-ai",
  success: "bg-tint-success",
  danger: "bg-tint-danger",
  neutral: "bg-surface-muted",
};

/** Kart: ince kenarlık, çok hafif gölge; başlık alanı hafif tonla gövdeden ayrılır. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("overflow-hidden rounded-xl border border-border bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return <div className={cn("flex flex-col gap-0.5 border-b border-border px-5 py-3.5", headerTones[tone], className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-semibold leading-tight text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] text-ink-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 border-t border-border bg-surface-muted/60 px-5 py-3", className)} {...props} />;
}
