import "server-only";
import { and, asc, gte, lt } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type CalendarEventRow = typeof schema.calendarEvents.$inferSelect;

export type MonthRef = { year: number; month: number }; // month: 1-12

/** `?ay=2026-11` biçimini ayrıştırır; geçersizse içinde bulunulan ay. */
export function parseMonthParam(v: string | string[] | undefined, now = new Date()): MonthRef {
  const s = Array.isArray(v) ? v[0] : v;
  const m = s ? /^(\d{4})-(\d{1,2})$/.exec(s) : null;
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function monthParam(ref: MonthRef) {
  return `${ref.year}-${String(ref.month).padStart(2, "0")}`;
}

export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const d = new Date(ref.year, ref.month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function monthRange(ref: MonthRef): { start: Date; end: Date } {
  return { start: new Date(ref.year, ref.month - 1, 1), end: new Date(ref.year, ref.month, 1) };
}

/** Ayın tüm etkinlikleri (başlangıç saatine göre). */
export async function listEventsForMonth(ref: MonthRef): Promise<CalendarEventRow[]> {
  const { start, end } = monthRange(ref);
  const db = await getDb();
  return db
    .select()
    .from(schema.calendarEvents)
    .where(and(gte(schema.calendarEvents.startsAt, start), lt(schema.calendarEvents.startsAt, end)))
    .orderBy(asc(schema.calendarEvents.startsAt));
}

/** Yaklaşan etkinlikler (ana sayfa için). */
export async function listUpcomingEvents(days = 14, limit = 5): Promise<CalendarEventRow[]> {
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400_000);
  const db = await getDb();
  return db
    .select()
    .from(schema.calendarEvents)
    .where(and(gte(schema.calendarEvents.startsAt, now), lt(schema.calendarEvents.startsAt, end)))
    .orderBy(asc(schema.calendarEvents.startsAt))
    .limit(limit);
}
