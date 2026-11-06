import { cn } from "@/lib/utils";

/** Yüzde çubuğu; `compare` verilirse kohort ortalaması işaretlenir. */
export function PercentBar({ value, compare, label, hint }: { value: number | null; compare?: number | null; label: string; hint?: string }) {
  const v = value ?? 0;
  const tone = value === null ? "bg-slate-300" : v >= 75 ? "bg-emerald-500" : v >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-ink">{label}</span>
        <span className="tabular-nums text-ink-muted">
          {value === null ? "—" : `%${v}`}
          {hint && <span className="ml-1 text-xs">({hint})</span>}
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={`${label}: ${value === null ? "veri yok" : `%${v}`}`}>
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
        {typeof compare === "number" && (
          <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: `${Math.max(0, Math.min(100, compare))}%` }} title={`Kohort ortalaması %${compare}`} aria-hidden />
        )}
      </div>
    </div>
  );
}

export function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-faint">—</span>;
  const cls = value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-ink-muted";
  return (
    <span className={cn("tabular-nums font-medium", cls)}>
      {value > 0 ? "▲" : value < 0 ? "▼" : "•"} {Math.abs(value)} puan
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}
