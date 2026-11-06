/** Ders formu için tarih yardımcıları (saf fonksiyonlar). */

/** `<input type="datetime-local">` için yerel saat biçimi (YYYY-MM-DDTHH:mm). */
export function toDatetimeLocal(d: Date | null | undefined): string {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** datetime-local değerini Date'e çevirir; boşsa null, geçersizse undefined. */
export function parseDatetimeLocal(v: unknown): Date | null | undefined {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
