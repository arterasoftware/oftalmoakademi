import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  customType,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/*  Özel tipler                                                                */
/* -------------------------------------------------------------------------- */

/** tsvector: tam metin arama için. Uygulama katmanı insert sırasında doldurur. */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/** pgvector: embedding (isteğe bağlı). 1024 boyut (voyage-3). */
export const vector1024 = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string) {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(Number);
  },
});

/* -------------------------------------------------------------------------- */
/*  Enum'lar                                                                   */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "FACULTY", "RESIDENT"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "SUSPENDED"]);

export const subspecialtyEnum = pgEnum("subspecialty", [
  "RETINA",
  "KORNEA",
  "GLOKOM",
  "NOROOFTALMOLOJI",
  "PEDIATRIK",
  "UVEIT",
  "OKULOPLASTIK",
  "KATARAKT",
  "REFRAKSIYON",
  "DIGER",
]);

export const SUBSPECIALTY_LABELS: Record<(typeof subspecialtyEnum.enumValues)[number], string> = {
  RETINA: "Retina",
  KORNEA: "Kornea",
  GLOKOM: "Glokom",
  NOROOFTALMOLOJI: "Nörooftalmoloji",
  PEDIATRIK: "Pediatrik Oftalmoloji",
  UVEIT: "Üveit",
  OKULOPLASTIK: "Oküloplastik Cerrahi",
  KATARAKT: "Katarakt",
  REFRAKSIYON: "Refraksiyon",
  DIGER: "Diğer",
};

/** Ders yaşam döngüsü: taslak -> incelemede -> onaylı -> yayımlandı (veya düzenlemeye geri gönderildi) */
export const lessonStatusEnum = pgEnum("lesson_status", ["DRAFT", "PUBLISHED", "ARCHIVED"]);

export const articleStatusEnum = pgEnum("article_status", [
  "SUGGESTED", // yapay zekâ önerdi
  "SELECTED", // öğretim üyesi seçti, özet hazırlanıyor
  "PUBLISHED",
  "REJECTED",
]);

export const caseStatusEnum = pgEnum("case_status", [
  "PUBLISHED", // paylaşıldı, tartışmaya açık
  "HIDDEN", // öğretim üyesi gizledi (yalnızca personel ve yazar görür)
]);

export const examTypeEnum = pgEnum("exam_type", ["WEEKLY", "MONTHLY"]);
export const examStatusEnum = pgEnum("exam_status", [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED", // sorular onaylı, zamanlanmış
  "OPEN",
  "CLOSED",
  "RESULTS_PUBLISHED",
]);

export const questionStatusEnum = pgEnum("question_status", ["DRAFT", "APPROVED", "REJECTED"]);

export const sourceTypeEnum = pgEnum("source_type", ["PDF", "TEXT", "URL"]);
export const sourceStatusEnum = pgEnum("source_status", ["PENDING", "PROCESSING", "READY", "FAILED"]);

export const discussionTargetEnum = pgEnum("discussion_target", ["LESSON", "ARTICLE", "CASE"]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "LESSON_PUBLISHED",
  "ARTICLE_PUBLISHED",
  "CASE_PUBLISHED",
  "CASE_REVEALED",
  "EXAM_SCHEDULED",
  "EXAM_RESULTS",
  "COMMENT_REPLY",
  "CONTENT_RETURNED",
  "CONTENT_APPROVED",
  "REVIEW_REQUESTED",
  "SYSTEM",
]);

export const fileKindEnum = pgEnum("file_kind", ["CASE_IMAGE", "SOURCE_DOCUMENT", "QUESTION_IMAGE", "LESSON_IMAGE", "LESSON_MATERIAL", "CASE_AUDIO", "COMMENT_AUDIO", "ARTICLE_PDF", "COMMENT_IMAGE"]);

/** Soru türleri: çoktan seçmeli (tek doğru), çoklu seçim, doğru/yanlış, eşleştirme */
export const questionTypeEnum = pgEnum("question_type", ["MULTIPLE_CHOICE", "MULTI_SELECT", "TRUE_FALSE", "MATCHING"]);

/** Ders materyali türleri: dosya (PDF, görsel, 3B model, video) veya dış bağlantı */
export const materialKindEnum = pgEnum("material_kind", ["PDF", "IMAGE", "MODEL3D", "VIDEO", "LINK", "AUDIO"]);

export const aiContextEnum = pgEnum("ai_context", ["GENERAL", "LESSON", "CASE", "ARTICLE"]);

/* -------------------------------------------------------------------------- */
/*  Kullanıcı, oturum, davet, güvenlik                                         */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    title: text("title"), // Prof. Dr., Dr. Öğr. Üyesi, Arş. Gör. Dr. ...
    role: userRoleEnum("role").notNull().default("RESIDENT"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    residencyYear: integer("residency_year"), // asistanlık yılı (1-5)
    passwordHash: text("password_hash").notNull(),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecretEnc: text("mfa_secret_enc"), // AES-256-GCM ile şifreli TOTP sırrı
    mfaRecoveryHashes: jsonb("mfa_recovery_hashes").$type<string[]>(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(), // SHA-256(token); ham token yalnızca çerezde
    mfaVerified: boolean("mfa_verified").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // mutlak süre
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(), // hareketsizlik
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    role: userRoleEnum("role").notNull().default("RESIDENT"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invitations_token_hash_idx").on(t.tokenHash), index("invitations_email_idx").on(t.email)],
);

/** Oran sınırlama ve kaba kuvvet koruması için sabit pencere sayaçları. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(), // ör. "login:ip:1.2.3.4" veya "login:email:x@y"
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // ör. "lesson.publish", "user.invite", "auth.login"
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_actor_idx").on(t.actorId), index("audit_created_idx").on(t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_unread_idx").on(t.userId, t.readAt)],
);

/** Anahtar-değer uygulama ayarları (yapay zekâ ayarları, takvim varsayılanları vb.). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Dosyalar ve bilimsel kaynaklar (RAG)                                       */
/* -------------------------------------------------------------------------- */

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    kind: fileKindEnum("kind").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(), // depolama sürücüsündeki anahtar
    originalName: text("original_name").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_owner_idx").on(t.ownerId)],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    type: sourceTypeEnum("type").notNull(),
    citation: text("citation"), // APA/Vancouver biçiminde atıf
    authors: text("authors"),
    year: integer("year"),
    url: text("url"),
    doi: text("doi"),
    licenseNote: text("license_note"), // telif / kullanım izni açıklaması (zorunlu)
    subspecialty: subspecialtyEnum("subspecialty"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    rawText: text("raw_text"), // TEXT türü kaynaklar için
    status: sourceStatusEnum("status").notNull().default("PENDING"),
    errorMessage: text("error_message"),
    chunkCount: integer("chunk_count").notNull().default(0),
    approved: boolean("approved").notNull().default(false), // uzman onayı
    approvedBy: uuid("approved_by").references(() => users.id),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sources_status_idx").on(t.status)],
);

export const sourceChunks = pgTable(
  "source_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    content: text("content").notNull(),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    section: text("section"),
    tokenCount: integer("token_count"),
    tsv: tsvector("tsv"),
    embedding: vector1024("embedding"),
  },
  (t) => [
    index("source_chunks_source_idx").on(t.sourceId, t.idx),
    index("source_chunks_tsv_idx").using("gin", t.tsv),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Dersler                                                                    */
/* -------------------------------------------------------------------------- */


export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    subspecialty: subspecialtyEnum("subspecialty").notNull(),
    status: lessonStatusEnum("status").notNull().default("DRAFT"),
    /** Kısa açıklama (asistan ne öğrenecek?) */
    description: text("description"),
    /** Ders notu (basit Markdown); belgeden otomatik/YZ ile üretilir, öğretim üyesi düzenler */
    notes: text("notes"),
    notesSource: text("notes_source").$type<"manual" | "auto" | "ai">(),
    notesModel: text("notes_model"),
    notesUpdatedAt: timestamp("notes_updated_at", { withTimezone: true }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    discussionLocked: boolean("discussion_locked").notNull().default(false),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lessons_slug_idx").on(t.slug),
    index("lessons_status_idx").on(t.status),
    index("lessons_published_idx").on(t.publishedAt),
  ],
);

export const lessonMaterials = pgTable(
  "lesson_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    kind: materialKindEnum("kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }), // PDF/IMAGE/MODEL3D/VIDEO yüklemeleri
    url: text("url"), // LINK veya harici VIDEO (YouTube/Vimeo)
    extractedText: text("extracted_text"), // PDF'ten çıkarılan metin (etkileşimli sayfa için)
    order: integer("order").notNull().default(0),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lesson_materials_lesson_idx").on(t.lessonId, t.order)],
);

export const lessonSources = pgTable(
  "lesson_sources",
  {
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.lessonId, t.sourceId] })],
);

/* -------------------------------------------------------------------------- */
/*  Haftanın makalesi (Journal Club)                                           */
/* -------------------------------------------------------------------------- */

export type ArticleSummary = {
  structuredSummaryTr: string; // Türkçe yapılandırılmış özet
  background: string;
  methods: string;
  keyFindings: string[];
  strengths: string[];
  weaknesses: string[];
  clinicalImplications: string;
  discussionQuestions: string[];
  /** "ai": yapay zekâ taslağı · "manual": öğretim üyesi yazdı/düzenledi (etiket için) */
  source?: "ai" | "manual";
};

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    authors: text("authors"),
    journal: text("journal"),
    publishedOn: text("published_on"), // dergi yayın tarihi (metin; "2026 Mar" gibi)
    doi: text("doi"),
    pmid: text("pmid"),
    url: text("url"),
    abstract: text("abstract"),
    /** Tam metin PDF (yalnızca erişim/telif izni çerçevesinde; /api/dosya ile sunulur) */
    pdfFileId: uuid("pdf_file_id").references(() => files.id, { onDelete: "set null" }),
    /** Adayın kaynağı: elle (DOI/PDF/form) veya otomatik PubMed taraması */
    origin: text("origin").$type<"manual" | "pubmed_scan">().notNull().default("manual"),
    /** PubMed yayın türleri (Meta-Analysis, Randomized Controlled Trial …) */
    pubTypes: jsonb("pub_types").$type<string[]>(),
    /** Yapay zekâsız tarama puanı (0-100): yayın türü + dergi + güncellik */
    scanScore: integer("scan_score"),
    /** Taramada hangi alt dal aramasıyla bulundu */
    scanQuery: text("scan_query"),
    subspecialty: subspecialtyEnum("subspecialty"),
    status: articleStatusEnum("status").notNull().default("SUGGESTED"),
    aiRationale: text("ai_rationale"), // neden önerildi
    aiQualityNotes: jsonb("ai_quality_notes").$type<{
      design: string;
      clinicalImportance: string;
      novelty: string;
      limitations: string;
      score: number;
    }>(),
    summary: jsonb("summary").$type<ArticleSummary>(),
    weekOf: timestamp("week_of", { withTimezone: true }), // hangi haftanın makalesi
    suggestedBy: uuid("suggested_by").references(() => users.id), // null -> yapay zekâ
    selectedBy: uuid("selected_by").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    discussionLocked: boolean("discussion_locked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("articles_status_idx").on(t.status), index("articles_week_idx").on(t.weekOf)],
);

/* -------------------------------------------------------------------------- */
/*  Klinik olgular                                                             */
/* -------------------------------------------------------------------------- */

export const clinicalCases = pgTable(
  "clinical_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    subspecialty: subspecialtyEnum("subspecialty").notNull(),
    status: caseStatusEnum("status").notNull().default("PUBLISHED"),
    /** Olgu metni (öykü, bulgular, soru); kimliksizleştirilmiş olmalıdır */
    body: text("body").notNull(),
    /** Tek ses kaydı (isteğe bağlı) */
    audioFileId: uuid("audio_file_id").references(() => files.id, { onDelete: "set null" }),
    audioDurationSec: integer("audio_duration_sec"),
    deidentificationConfirmed: boolean("deidentification_confirmed").notNull().default(false),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    aiSummary: text("ai_summary"), // tartışma sonu yapay zekâ özeti
    discussionLocked: boolean("discussion_locked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cases_status_idx").on(t.status), index("cases_author_idx").on(t.authorId)],
);

/** Olgu görselleri (birden çok; kimliksizleştirilmiş) */
export const caseImages = pgTable(
  "case_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => clinicalCases.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    caption: text("caption"),
    order: integer("order").notNull().default(0),
  },
  (t) => [index("case_images_case_idx").on(t.caseId)],
);

/* -------------------------------------------------------------------------- */
/*  Tartışma / yorumlar (ders, makale, olgu için ortak)                       */
/* -------------------------------------------------------------------------- */

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: discussionTargetEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    parentId: uuid("parent_id"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }), // null -> yapay zekâ
    body: text("body").notNull(),
    isAi: boolean("is_ai").notNull().default(false),
    aiCitations: jsonb("ai_citations").$type<{ sourceId: string; title: string; chunkId: string; page?: number }[]>(),
    isPinned: boolean("is_pinned").notNull().default(false),
    isFacultyCorrection: boolean("is_faculty_correction").notNull().default(false),
    /** Sesli yorum: kayıt dosyası (kimliksizleştirilmiş olmalı) ve süresi; metin boş olabilir */
    audioFileId: uuid("audio_file_id").references(() => files.id, { onDelete: "set null" }),
    audioDurationSec: integer("audio_duration_sec"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_target_idx").on(t.targetType, t.targetId, t.createdAt)],
);

/** Yorum görselleri (tartışma yanıtlarına eklenen görseller; kimliksizleştirilmiş) */
export const commentImages = pgTable(
  "comment_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
  },
  (t) => [index("comment_images_comment_idx").on(t.commentId)],
);

/* -------------------------------------------------------------------------- */
/*  Sınavlar                                                                   */
/* -------------------------------------------------------------------------- */

export type QuestionOption = { key: string; text: string }; // key: "A".."E"
/** Eşleştirme sorusu çiftleri: sol öğe -> doğru sağ öğe */
export type MatchingPair = { left: string; right: string };

export const exams = pgTable(
  "exams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    type: examTypeEnum("type").notNull(),
    status: examStatusEnum("status").notNull().default("DRAFT"),
    description: text("description"),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }), // haftalık mini sınav için
    durationMinutes: integer("duration_minutes").notNull().default(10),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    resultsAt: timestamp("results_at", { withTimezone: true }), // sonuçların açıklanma zamanı
    shuffleQuestions: boolean("shuffle_questions").notNull().default(true),
    /** Katılımcı kısıtı: boş -> tüm aktif asistanlar */
    participantUserIds: jsonb("participant_user_ids").$type<string[]>(),
    /** Alt branş dağılımı hedefi (yalnızca bilgi/ planlama): { RETINA: 8, ... } */
    distribution: jsonb("distribution").$type<Partial<Record<(typeof subspecialtyEnum.enumValues)[number], number>>>(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exams_status_idx").on(t.status), index("exams_starts_idx").on(t.startsAt)],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
    type: questionTypeEnum("type").notNull().default("MULTIPLE_CHOICE"),
    stem: text("stem").notNull(), // soru kökü (klinik senaryo dâhil)
    options: jsonb("options").$type<QuestionOption[]>().notNull(), // MC/MULTI/TF seçenekleri; MATCHING için boş
    pairs: jsonb("pairs").$type<MatchingPair[]>(), // yalnızca MATCHING
    /** MC/TF: "A"; MULTI_SELECT: "A,C" (sıralı, virgüllü); MATCHING: kullanılmaz (pairs) */
    correctKey: text("correct_key").notNull(),
    explanation: text("explanation").notNull(),
    subspecialty: subspecialtyEnum("subspecialty").notNull(),
    difficulty: integer("difficulty").notNull().default(2), // 1 kolay - 3 zor
    imageFileId: uuid("image_file_id").references(() => files.id, { onDelete: "set null" }),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    sourceRef: text("source_ref"), // kaynak atfı
    aiGenerated: boolean("ai_generated").notNull().default(false),
    status: questionStatusEnum("status").notNull().default("DRAFT"),
    approvedBy: uuid("approved_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("questions_exam_idx").on(t.examId, t.order)],
);

export const examAttempts = pgTable(
  "exam_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionOrder: jsonb("question_order").$type<string[]>().notNull(), // karıştırılmış soru sırası
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    flagged: jsonb("flagged").$type<string[]>().notNull().default([]),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    score: integer("score"), // doğru sayısı
    total: integer("total"),
    /** Alt branş bazlı analiz: { RETINA: { correct: 3, total: 5 } } */
    breakdown: jsonb("breakdown").$type<Record<string, { correct: number; total: number }>>(),
  },
  (t) => [uniqueIndex("attempts_exam_user_idx").on(t.examId, t.userId), index("attempts_user_idx").on(t.userId)],
);

/* -------------------------------------------------------------------------- */
/*  Takvim                                                                     */
/* -------------------------------------------------------------------------- */

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    kind: text("kind").notNull(), // LESSON | ARTICLE | EXAM | OTHER
    refId: uuid("ref_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calendar_starts_idx").on(t.startsAt)],
);

/* -------------------------------------------------------------------------- */
/*  Sık sorulan sorular (öğretim üyesi yanıtları; yapay zekâsız asistan temeli) */
/* -------------------------------------------------------------------------- */

export const faqEntries = pgTable(
  "faq_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    /** Yanıtın dayandığı kaynak (isteğe bağlı); kaynak silinirse bağ kopar, yanıt kalır. */
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    /** Sayfa / bölüm notu, ör. "s. 12-13" */
    sourceNote: text("source_note"),
    subspecialty: subspecialtyEnum("subspecialty"),
    published: boolean("published").notNull().default(false),
    tsv: tsvector("tsv"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("faq_published_idx").on(t.published, t.subspecialty), index("faq_tsv_idx").using("gin", t.tsv)],
);

export const faqEntriesRelations = relations(faqEntries, ({ one }) => ({
  source: one(sources, { fields: [faqEntries.sourceId], references: [sources.id] }),
  author: one(users, { fields: [faqEntries.createdBy], references: [users.id] }),
}));

export type FaqEntry = typeof faqEntries.$inferSelect;

/* -------------------------------------------------------------------------- */
/*  Yapay zekâ sohbetleri (kaynak temelli soru-cevap)                         */
/* -------------------------------------------------------------------------- */

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contextType: aiContextEnum("context_type").notNull().default("GENERAL"),
    contextId: uuid("context_id"),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_conv_user_idx").on(t.userId, t.updatedAt)],
);

export type AiCitation = { sourceId: string; chunkId: string; title: string; page?: number | null; excerpt: string };

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    citations: jsonb("citations").$type<AiCitation[]>(),
    insufficientEvidence: boolean("insufficient_evidence").notNull().default(false),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_msg_conv_idx").on(t.conversationId, t.createdAt)],
);

/** Yapay zekâ kullanım kaydı (maliyet takibi) */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    feature: text("feature").notNull(), // lesson_draft | qa | quiz_gen | article_eval | case_hint | summary
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);

/* -------------------------------------------------------------------------- */
/*  İlişkiler                                                                  */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  notifications: many(notifications),
}));

export const lessonsRelations = relations(lessons, ({ one, many }) => ({
  author: one(users, { fields: [lessons.authorId], references: [users.id] }),
  sources: many(lessonSources),
  materials: many(lessonMaterials),
}));

export const lessonMaterialsRelations = relations(lessonMaterials, ({ one }) => ({
  lesson: one(lessons, { fields: [lessonMaterials.lessonId], references: [lessons.id] }),
  file: one(files, { fields: [lessonMaterials.fileId], references: [files.id] }),
}));

export const lessonSourcesRelations = relations(lessonSources, ({ one }) => ({
  lesson: one(lessons, { fields: [lessonSources.lessonId], references: [lessons.id] }),
  source: one(sources, { fields: [lessonSources.sourceId], references: [sources.id] }),
}));

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  file: one(files, { fields: [sources.fileId], references: [files.id] }),
  chunks: many(sourceChunks),
  uploader: one(users, { fields: [sources.uploadedBy], references: [users.id] }),
}));

export const sourceChunksRelations = relations(sourceChunks, ({ one }) => ({
  source: one(sources, { fields: [sourceChunks.sourceId], references: [sources.id] }),
}));

export const casesRelations = relations(clinicalCases, ({ one, many }) => ({
  author: one(users, { fields: [clinicalCases.authorId], references: [users.id] }),
  images: many(caseImages),
}));

export const caseImagesRelations = relations(caseImages, ({ one }) => ({
  case: one(clinicalCases, { fields: [caseImages.caseId], references: [clinicalCases.id] }),
  file: one(files, { fields: [caseImages.fileId], references: [files.id] }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  audioFile: one(files, { fields: [comments.audioFileId], references: [files.id] }),
  images: many(commentImages),
}));

export const commentImagesRelations = relations(commentImages, ({ one }) => ({
  comment: one(comments, { fields: [commentImages.commentId], references: [comments.id] }),
  file: one(files, { fields: [commentImages.fileId], references: [files.id] }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  lesson: one(lessons, { fields: [exams.lessonId], references: [lessons.id] }),
  questions: many(questions),
  attempts: many(examAttempts),
  creator: one(users, { fields: [exams.createdBy], references: [users.id] }),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  exam: one(exams, { fields: [questions.examId], references: [exams.id] }),
  image: one(files, { fields: [questions.imageFileId], references: [files.id] }),
}));

export const examAttemptsRelations = relations(examAttempts, ({ one }) => ({
  exam: one(exams, { fields: [examAttempts.examId], references: [exams.id] }),
  user: one(users, { fields: [examAttempts.userId], references: [users.id] }),
}));

export const articlesRelations = relations(articles, ({ one }) => ({
  selector: one(users, { fields: [articles.selectedBy], references: [users.id] }),
}));

export const aiConversationsRelations = relations(aiConversations, ({ many, one }) => ({
  messages: many(aiMessages),
  user: one(users, { fields: [aiConversations.userId], references: [users.id] }),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, { fields: [aiMessages.conversationId], references: [aiConversations.id] }),
}));

/* -------------------------------------------------------------------------- */
/*  Tip dışa aktarımları                                                        */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type UserRole = User["role"];
export type Session = typeof sessions.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type LessonMaterial = typeof lessonMaterials.$inferSelect;
export type MaterialKind = (typeof materialKindEnum.enumValues)[number];
export type Article = typeof articles.$inferSelect;
export type ClinicalCase = typeof clinicalCases.$inferSelect;
export type CaseImage = typeof caseImages.$inferSelect;
export type QuestionType = (typeof questionTypeEnum.enumValues)[number];
export type Comment = typeof comments.$inferSelect;
export type Exam = typeof exams.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type ExamAttempt = typeof examAttempts.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type SourceChunk = typeof sourceChunks.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type FileRecord = typeof files.$inferSelect;
export type Subspecialty = (typeof subspecialtyEnum.enumValues)[number];
