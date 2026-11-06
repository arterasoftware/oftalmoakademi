import * as React from "react";

/**
 * Sayfa başlığı: üst bilgi (bölüm/kırıntı), başlık, kısa açıklama ve sağda eylemler.
 * Tüm sayfalarda aynı düzen; kullanıcı nerede olduğunu ve ne yapabileceğini bir bakışta görür.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink sm:text-[26px]">{title}</h1>
        {description && <div className="mt-1.5 text-[14px] text-ink-muted">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Sayfa içi bölüm başlığı: tutarlı hiyerarşi için. */
export function SectionTitle({ children, count, actions }: { children: React.ReactNode; count?: number; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[17px] font-semibold tracking-tight text-ink">
        {children}
        {typeof count === "number" && <span className="ml-1.5 text-sm font-normal text-ink-muted">({count})</span>}
      </h2>
      {actions}
    </div>
  );
}
