# OftalmoAkademi — Geliştirme Rehberi (modül sözleşmesi)

Bu dosya, kod tabanına katkı yapan herkesin (ve yapay zekâ ajanlarının) uyması gereken sözleşmedir.

## Ortam
- Node 26 LTS (bu oturumda PATH'e eklenmesi gerekir):
  `export PATH="/private/tmp/claude-501/-Users-yilmaz-Library-Application-Support-Claude-scratch-workspaces-89d2b425-d9ce-4b96-a521-5553a40237de-fb06c3aa-b959-4afc-845a-5c118d2d2b1e-scratch-2026-11-03-417a66/8922a199-1ba4-4a7e-9912-d17ee5043846/scratchpad/tools/node/bin:$PATH"`
- Next.js **16.4** (App Router, Turbopack). Eğitim verinizdeki Next'ten farklıdır: `params`/`searchParams` **Promise**'tir, `cookies()`/`headers()` **async**'tir, tipler `PageProps<"/rota">`, `LayoutProps<"/">`, `RouteContext<"/api/x/[id]">` olarak global gelir (`npx next typegen` üretir). Middleware yerine `src/proxy.ts`. Belgeler: `node_modules/next/dist/docs/01-app/`.
- `cacheComponents` kapalı; sayfalar dinamiktir. `revalidatePath` kullanılabilir.
- Veritabanı: Drizzle ORM. Geliştirmede gömülü PGlite (`./data/pglite`), üretimde PostgreSQL+pgvector. **Şema: `src/db/schema.ts` — değiştirmeyin.** Yeni alan gerekiyorsa rapor edin.
- Komutlar: `npm run typecheck` (zorunlu, hatasız), `npm run lint`, `npm test`, `npm run db:migrate`.
- Turbopack bazen `src/lib/queries` altındaki ortak modül değişikliklerini sayfalara yansıtmaz; böyle bir tutarsızlıkta dev sunucusunu yeniden başlatın.
- Dev sunucu zaten `http://localhost:3001` üzerinde çalışıyor (yeniden başlatmayın; dosya değişiklikleri otomatik yüklenir).
- **PGlite tek süreçlidir.** Dev sunucusu açıkken `db:*` betiklerini veya veritabanına erişen tsx betiklerini çalıştırmayın; `data/pglite.lock` kilidi ikinci süreci açık hata ile durdurur. Veri doğrulamak için uygulama arayüzünü kullanın.

## Katmanlar
- `src/db` — `getDb()` (async), `schema`, `ftsConfig()`.
- `src/lib/auth/dal.ts` — Sunucu bileşenlerinde `requireUser()`, `requireStaff()`, `requireAdmin()`, `requireRole(...)` (yönlendirme yapar). Server action / route handler içinde `assertUser()`, `assertStaff()`, `assertAdmin()` (AuthError fırlatır). `isStaff(role)`, `ROLE_LABELS`.
- `src/lib/audit.ts` — `audit(actorId, "entity.action", {type,id}, metadata)`: **her onay/yayın/silme/yönetim işleminde çağrılmalı**.
- `src/lib/notifications.ts` — `notifyUsers(ids, {type,title,body,link})`, `notifyRoles(["RESIDENT"], ...)`, `unreadCount`.
- `src/lib/action-result.ts` — `ActionResult<T>`, `fail()`, `success()`, `zodFieldErrors()`. Form action imzası: `(prev: ActionResult|null, formData: FormData) => Promise<ActionResult>` ve istemcide `useActionState`.
- `src/lib/validation.ts` — `emailSchema`, `uuidSchema`, `longText(max)`, `shortText(max)`; her girdi **zod** ile doğrulanır.
- `src/lib/auth/rate-limit.ts` — `consumeRateLimit(key, limit, windowSec)`; AI ve yükleme uçlarında kullanın (`RATE_LIMITS.aiPerUser` vb.).
- `src/lib/storage/files.ts` — `saveImageUpload({ownerId, kind, file})` (EXIF temizler, WebP'ye çevirir), `savePdfUpload`, `saveMaterialUpload({kind: PDF|IMAGE|MODEL3D|VIDEO})`, `deleteFile`. Dosyalar yalnızca `/api/dosya/[id]` ile sunulur (`<img src="/api/dosya/ID">`).
- `src/lib/ai/client.ts` — `anthropic()`, `aiAvailable()`, `getAiSettings()` (model, effort), `recordUsage()`, `assertCompleted(msg)`, `textOf(msg)`, `wrapUntrusted(label, text)`. İstemler `src/lib/ai/prompts.ts`.
- `src/lib/ai/rag/retrieve.ts` — `retrieve(query, {limit, sourceIds})` hibrit arama; `formatContext(chunks)` -> `<kaynak n="1">` blokları; `sourceFullTexts(sourceIds)`.
- `src/lib/ai/rag/ingest.ts` — `ingestSource(sourceId)`.
- `src/lib/ai/discussion-summary.ts` — `summarizeDiscussion(...)`.
- `src/components/ui` — `Button`, `SubmitButton`, `Input`, `Textarea`, `Select`, `Field`, `Card*` (`CardHeader tone="brand|clinical|exam|ai|success|danger|neutral|none"`), `Badge`, `AiBadge`, `Alert`, `PageHeader`, `SectionTitle`, `EmptyState`. Tasarım ilkeleri: `docs/TASARIM.md`.
- `src/components/discussion/discussion.tsx` — `<Discussion targetType="LESSON|ARTICLE|CASE" targetId path="/dersler/ID" />` (sunucu bileşeni; ders/makale/olgu detayına eklenir).
- `src/lib/utils.ts` — `cn`, `slugify`, `formatDate`, `formatDateTime`, `relativeTime`, `initials`.

## Yapay zekâ çağrı kuralları (Anthropic SDK)
- Model: `(await getAiSettings()).model` (varsayılan `claude-opus-5-5`). **Tarih son eki ekleme, `temperature`/`budget_tokens`/prefill kullanma.**
- `thinking` parametresini **gönderme** (model varsayılan olarak adaptif düşünür); derinliği `output_config: { effort: settings.effort }` ile ayarla.
- Yapılandırılmış çıktı: `client.messages.parse({ ..., output_config: { format: zodOutputFormat(Schema) } })` (`import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"`), `response.parsed_output` null ise hata ver.
- Uzun üretimlerde `client.messages.stream(...)` + `await stream.finalMessage()`; `max_tokens` cimri olmasın (yapılandırılmış ders taslağı için 16000, sohbet akışı için 8000).
- Her çağrıdan sonra `assertCompleted(message)` ve `recordUsage({userId, feature, model: message.model, usage: message.usage})`.
- Kullanıcı/belge metni istem içinde `wrapUntrusted("kullanici", text)` ile sarmalanır; sistem talimatı `system` alanına.
- Yapay zekâ çıktısı her yerde `<AiBadge />` ile etiketlenir ve uzman onayı akışından geçmeden yayımlanmaz.
- `aiAvailable()` false ise ilgili düğmeleri devre dışı bırak ve "Yapay zekâ yapılandırılmamış" uyarısı göster; sayfa çökmesin.

## Rotalar (Türkçe, kimlik tabanlı)
- Dersler: `/dersler`, `/dersler/yeni`, `/dersler/[id]`, `/dersler/[id]/duzenle`, `/dersler/[id]/etkilesimli` (materyaller: `src/lib/actions/materials.ts`, `src/components/lessons/*`)
- Makaleler: `/makaleler`, `/makaleler/[id]`, `/makaleler/oneriler` (personel)
- Olgular: `/olgular`, `/olgular/yeni`, `/olgular/[id]`, `/olgular/[id]/duzenle`
- Asistan raporları (personel): `/asistanlar`, `/asistanlar/[id]`, CSV: `/api/raporlar/asistanlar.csv`
- Sınavlar: `/sinavlar`, `/sinavlar/[id]` (katıl/sonuç), `/sinavlar/[id]/duzenle` (personel), `/sinavlar/yeni`
- Takvim: `/takvim`; Ana sayfa: `/panel`; YZ asistanı: `/asistan`; Kaynaklar: `/kaynaklar`; Yönetim: `/yonetim/**`; Profil: `/profil`; Bildirimler: `/bildirimler`.

## Takvim ve bildirim sözleşmesi
- `calendar_events.kind` ∈ `LESSON | ARTICLE | EXAM | OTHER`, `refId` = ilgili kayıt id'si. Bağlantı: LESSON→`/dersler/ID`, ARTICLE→`/makaleler/ID`, EXAM→`/sinavlar/ID`.
- Ders yayımlanınca / makale yayımlanınca / sınav zamanlanınca ilgili modül bir `calendar_events` satırı ekler ve asistanlara bildirim gönderir (`notifyRoles(["RESIDENT","FACULTY"], ...)`).

## Güvenlik kuralları (zorunlu)
- Yetki kontrolü **her** server action ve sayfada; URL'den gelen id'ler `uuidSchema` ile doğrulanır; kaynak sahipliği (yazar/rol) sunucuda kontrol edilir.
- Asistan yalnızca kendi taslaklarını görür/düzenler; yayımlanmamış içerik asistanlara **gösterilmez** (liste sorguları durumla filtrelenir).
- Olgu modülünde `finalDiagnosis`, `management`, `teachingPoints`, `facultyCommentary` ve `isHiddenUntilReveal` görseller asistanlara yalnızca `REVEALED/CLOSED` durumunda döner (DTO'da alanı **hiç gönderme**).
- Yorum/metin alanlarında HTML render etme (`dangerouslySetInnerHTML` yasak); `whitespace-pre-wrap` ile düz metin.
- Hata mesajlarında iç detay (SQL, stack) sızdırma.
- Türkçe arayüz; mobil öncelikli (alt menü 5 öğe; içerik `max-w-6xl`).
