import type { schema } from "@/db";

export type ExamStatus = (typeof schema.examStatusEnum.enumValues)[number];
export type QuestionStatus = (typeof schema.questionStatusEnum.enumValues)[number];
export type ExamType = (typeof schema.examTypeEnum.enumValues)[number];

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "ai";

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  DRAFT: "Taslak",
  IN_REVIEW: "İncelemede",
  APPROVED: "Onaylı / Zamanlandı",
  OPEN: "Açık",
  CLOSED: "Kapandı",
  RESULTS_PUBLISHED: "Sonuçlar yayımlandı",
};

export const EXAM_STATUS_TONES: Record<ExamStatus, BadgeTone> = {
  DRAFT: "neutral",
  IN_REVIEW: "warning",
  APPROVED: "info",
  OPEN: "success",
  CLOSED: "neutral",
  RESULTS_PUBLISHED: "brand",
};

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  DRAFT: "Taslak",
  APPROVED: "Onaylı",
  REJECTED: "Reddedildi",
};

export const QUESTION_STATUS_TONES: Record<QuestionStatus, BadgeTone> = {
  DRAFT: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  WEEKLY: "Haftalık mini sınav",
  MONTHLY: "Aylık asistan sınavı",
};

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "Kolay",
  2: "Orta",
  3: "Zor",
};

export const OPTION_KEYS = ["A", "B", "C", "D", "E"] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];

export const QUESTION_TYPE_LABELS: Record<"MULTIPLE_CHOICE" | "MULTI_SELECT" | "TRUE_FALSE" | "MATCHING", string> = {
  MULTIPLE_CHOICE: "Çoktan seçmeli",
  MULTI_SELECT: "Çoklu seçim (birden fazla doğru)",
  TRUE_FALSE: "Doğru / Yanlış",
  MATCHING: "Eşleştirme",
};
