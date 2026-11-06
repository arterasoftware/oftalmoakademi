import type { Article, Lesson } from "@/db/schema";

/** Badge bileşeninin kabul ettiği tonlar (src/components/ui/badge.tsx ile eş). */
export type StatusTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "ai";

export type StatusMeta = { label: string; tone: StatusTone };

export const LESSON_STATUS: Record<Lesson["status"], StatusMeta> = {
  DRAFT: { label: "Taslak", tone: "neutral" },
  PUBLISHED: { label: "Yayında", tone: "success" },
  ARCHIVED: { label: "Arşivlendi", tone: "neutral" },
};

export const ARTICLE_STATUS: Record<Article["status"], StatusMeta> = {
  SUGGESTED: { label: "Öneri", tone: "warning" },
  SELECTED: { label: "Seçildi", tone: "info" },
  PUBLISHED: { label: "Yayımlandı", tone: "success" },
  REJECTED: { label: "Reddedildi", tone: "neutral" },
};

export type CalendarKind = "LESSON" | "ARTICLE" | "EXAM" | "OTHER";

export const CALENDAR_KIND: Record<CalendarKind, StatusMeta> = {
  LESSON: { label: "Ders", tone: "brand" },
  ARTICLE: { label: "Makale", tone: "info" },
  EXAM: { label: "Sınav", tone: "warning" },
  OTHER: { label: "Etkinlik", tone: "neutral" },
};

/** Takvim etkinliğinin bağlantısı (sözleşme: LESSON→/dersler/ID, ARTICLE→/makaleler/ID, EXAM→/sinavlar/ID). */
export function calendarEventLink(kind: string, refId: string | null): string | null {
  if (!refId) return null;
  switch (kind) {
    case "LESSON":
      return `/dersler/${refId}`;
    case "ARTICLE":
      return `/makaleler/${refId}`;
    case "EXAM":
      return `/sinavlar/${refId}`;
    default:
      return null;
  }
}
