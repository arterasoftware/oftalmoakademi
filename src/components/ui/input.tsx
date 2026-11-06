import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[15px] text-ink shadow-[inset_0_1px_1px_rgba(15,23,42,0.03)] placeholder:text-ink-faint transition-colors hover:border-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70 sm:text-sm";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, "min-h-28 resize-y leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(base, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1.5 block text-[13px] font-medium text-ink", className)} {...props}>
      {children}
    </label>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="mt-1 text-[13px] text-red-600" role="alert">
      {errors[0]}
    </p>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-snug text-ink-muted">{children}</p>;
}

export function Field({
  label,
  htmlFor,
  errors,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  errors?: string[];
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !errors?.length && <Hint>{hint}</Hint>}
      <FieldError errors={errors} />
    </div>
  );
}
