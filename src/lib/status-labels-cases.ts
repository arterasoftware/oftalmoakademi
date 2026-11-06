import type { schema } from "@/db";

export type CaseStatus = (typeof schema.caseStatusEnum.enumValues)[number];
export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "ai";

/** Olgu durumları için arayüz etiketi ve rozet tonu. */
export const CASE_STATUS: Record<CaseStatus, { label: string; tone: BadgeTone; description: string }> = {
  PUBLISHED: { label: "Tartışmaya açık", tone: "brand", description: "Herkes görür; asistanlar ve öğretim üyeleri tartışır." },
  HIDDEN: { label: "Gizlendi", tone: "neutral", description: "Öğretim üyesi gizledi; yalnızca personel ve yazar görür." },
};

export const CASE_STATUSES = Object.keys(CASE_STATUS) as CaseStatus[];

/** Asistanların listede görebildiği durumlar (başkalarının olguları için). */
export const RESIDENT_VISIBLE_STATUSES: CaseStatus[] = ["PUBLISHED"];

export const MAX_CASE_IMAGES = 8;
/** Olgu ses kaydı üst sınırı (saniye) */
export const CASE_AUDIO_MAX_SEC = 600;
