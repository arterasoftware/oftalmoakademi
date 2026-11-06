# OftalmoAkademi — Mimari ve Güvenlik Tasarımı

Bu doküman, "OftalmoAkademi — Yazılım Geliştirme Proje Tanımı ve Teknik İhtiyaç Dokümanı"nda tanımlanan platformun
MVP (ilk sürüm) mimarisini, güvenlik kararlarını, yapay zekâ entegrasyonunu, veri koruma yaklaşımını ve
yol haritasını açıklar. Belgedeki 13. bölümde yazılım ekibinden istenen başlıkların her biri burada yanıtlanır.

## 1. Tasarım ilkeleri

1. **İnsan onayı olmadan yayın yok.** Yapay zekâ yalnızca taslak üretir; ders, makale özeti, sınav sorusu ve olgu
   yayını her zaman öğretim üyesi/yönetici onayından geçer. Taslaklar arayüzde "✦ Yapay zekâ taslağı" etiketiyle
   ayrışır.
2. **Kaynak temelli yapay zekâ.** Soru-cevap yalnızca sisteme yüklenmiş, telif notu girilmiş ve uzman onaylı
   kaynaklara dayanır (RAG). Kaynak yoksa model çağrılmaz, "kaynak yetersiz" yanıtı verilir.
3. **En az ayrıcalık.** Üç rol (yönetici, öğretim üyesi, asistan), her sunucu işleminde sunucu tarafında yetki ve
   sahiplik kontrolü. Yayımlanmamış içerik asistanlara hiçbir katmanda gönderilmez.
4. **Hasta gizliliği tasarımla.** Olgu formu kesin yaş yerine yaş aralığı yazılmasını ister; metin, görsel ve ses için
   tek bir zorunlu kimliksizleştirme/izin onayı vardır; görseller yeniden kodlanarak tüm EXIF/XMP/IPTC üst verisi atılır;
   dosyalar yalnızca yetkili rotadan sunulur ve tarayıcıda önbelleklenmez.
5. **Basit, denetlenebilir güvenlik.** Üçüncü taraf kimlik kütüphanesi yerine ~200 satırlık, okunabilir bir
   oturum katmanı (Argon2id, veritabanı oturumları, özetlenmiş belirteçler, TOTP MFA, oran sınırlama).
6. **Tek klinikten çok merkeze ölçeklenebilirlik.** Şema ve kod kurumdan bağımsızdır; ikinci aşamada
   `organizations` tablosu ve satır düzeyinde kurum kimliği eklenerek çok merkezli yapıya geçilebilir.

## 2. Genel mimari

```
 Tarayıcı / PWA (iPhone, Android, tablet, masaüstü)
          │ HTTPS (HSTS, CSP nonce, SameSite çerez)
          ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  Next.js 16 (App Router) — tek dağıtım birimi                │
 │  • proxy.ts: CSP nonce + oturum ön kontrolü                  │
 │  • Sunucu bileşenleri: DAL (requireUser/requireStaff/...)    │
 │  • Server Actions: zod doğrulama → yetki → iş kuralı → audit │
 │  • Route handler: /api/dosya/[id] (yetkili dosya akışı)      │
 │                   /api/asistan/sohbet (akışlı yanıt)         │
 │  • src/lib: auth, audit, notifications, storage, ai/rag      │
 └──────┬───────────────────┬───────────────────┬───────────────┘
        │ Drizzle ORM       │ Depolama sürücüsü │ Anthropic SDK (+ Voyage embedding, isteğe bağlı)
        ▼                   ▼                   ▼
  PostgreSQL 17        Özel dosya deposu     Claude API (claude-opus-5-5)
  + pgvector           (yerel disk / S3)     yalnızca sunucudan, anahtar ortam değişkeninde
  (geliştirmede gömülü PGlite)
```

**Neden tek Next.js uygulaması?** MVP'de ayrı bir API sunucusu, bakım yükü ve yüzey alanı ekler. Server
Actions + route handler'lar "güvenli API ve iş mantığı katmanı" gereksinimini karşılar; tüm giriş noktaları aynı
DAL'dan geçer. İkinci aşamada ihtiyaç olursa (ör. yerel mobil uygulama) aynı iş mantığı REST/JSON uçlarına
açılabilir.

### Teknoloji seçimleri

| Katman | Seçim | Gerekçe |
|---|---|---|
| Ön yüz / sunucu | Next.js 16, React 19, TypeScript, Tailwind v4 | Belgedeki öneri; PWA desteği; tek dil |
| Veritabanı | PostgreSQL 17 + pgvector; geliştirmede PGlite (gömülü, aynı SQL) | Belgedeki öneri; tam metin arama + vektör aynı veritabanında; yerel geliştirme için Docker gerekmez |
| ORM | Drizzle | SQL'e yakın, tip güvenli, migrasyonlar sürümlenir |
| Kimlik | Özel oturum katmanı: Argon2id, DB oturumları, TOTP MFA | Küçük, okunabilir, denetlenebilir; dış kimlik sağlayıcı bağımlılığı yok (ileride SSO eklenebilir) |
| Yapay zekâ | Sağlayıcıdan bağımsız katman (`src/lib/ai/provider.ts`): **Google Gemini** (ücretsiz katman, varsayılan) veya **Anthropic Claude** (ücretli); yapılandırılmış çıktı (JSON şema) her ikisinde de | Ücretsiz başlangıç; yönetim panelinden tek ayarla sağlayıcı değişimi; ileride Ollama (yerel) aynı katmana eklenebilir. Gemini'de birincil model yoğunsa (503) `GEMINI_FALLBACK_MODELS` sırayla denenir; model adları Google tarafında sık değiştiğinden Yönetim panelinden güncellenebilir |
| Embedding | Gemini `gemini-embedding-001` (ücretsiz) veya Voyage AI; 1024 boyut | Anahtar yoksa yalnızca Türkçe tam metin arama ile çalışır (hibrit arama: FTS + vektör, RRF ile birleştirme); sağlayıcı değişince yeniden indeksleme gerekir |
| Dosya | Yerel disk (MVP) veya S3 uyumlu (MinIO/R2) sürücü | Şifreli, özel depolama; aynı arayüz |
| Dağıtım | Docker Compose (uygulama + pgvector), Caddy/Nginx ters vekil, TLS | Üniversite sunucusu veya bulut VM üzerinde çalışır |

## 3. Veri modeli (özet)

Tam şema: `src/db/schema.ts` (23 tablo). Ana varlıklar ve yaşam döngüleri:

- **users / sessions / invitations / rate_limits / audit_logs / notifications / settings** — kimlik, güvenlik, yönetim.
- **sources → source_chunks** — bilimsel kaynaklar (PDF/metin), parçalanmış ve indekslenmiş (tsvector + embedding).
  Her kaynakta `licenseNote` (telif/izin) ve `approved` (uzman onayı) alanı vardır.
- **lessons (+ lesson_sources)** — `DRAFT → IN_REVIEW → APPROVED → PUBLISHED` (veya `RETURNED`, `ARCHIVED`).
  İçerik yapılandırılmış JSON: öğrenme hedefleri, temel bilgiler, bölümler, klinik ipuçları, tablolar, görsel
  önerileri, önemli noktalar, kaynaklar.
- **articles** — `SUGGESTED → SELECTED → PUBLISHED` (veya `REJECTED`); yapay zekâ puanı/gerekçesi ve Türkçe
  yapılandırılmış özet.
- **clinical_cases (+ case_images)** — `DRAFT → IN_REVIEW → PUBLISHED (tanı gizli) → REVEALED → CLOSED`.
  Gizli alanlar (kesin tanı, yönetim, eğitici sonuç, öğretim üyesi değerlendirmesi) asistan DTO'sunda yer almaz.
- **comments** — ders/makale/olgu için ortak tartışma; sabitleme, öğretim üyesi düzeltmesi, yapay zekâ yanıtı
  etiketi, yumuşak silme.
- **exams → questions, exam_attempts** — `DRAFT → IN_REVIEW → APPROVED → OPEN → CLOSED → RESULTS_PUBLISHED`;
  her soru ayrı onaylanır; deneme süresi sunucuda (`deadlineAt`) uygulanır; alt branş bazlı analiz.
- **calendar_events** — eğitim takvimi (ders/makale/sınav/diğer).
- **ai_conversations / ai_messages / ai_usage** — kaynak atıflı sohbet geçmişi ve token/maliyet takibi.

## 4. Güvenlik tasarımı

### Kimlik doğrulama ve oturum
- Parolalar **Argon2id** (m=19 MiB, t=2) ile özetlenir; politika NIST 800‑63B: ≥12 karakter, yaygın parola ve
  e‑posta içerme kontrolü.
- Oturum belirteci 256 bit rastgele; veritabanında yalnızca **SHA‑256 özeti** tutulur. Çerez: `HttpOnly`,
  `Secure`, `SameSite=Lax`. Mutlak süre 7 gün, hareketsizlik 12 saat; parola değişince diğer oturumlar düşer.
- **MFA (TOTP)**: isteğe bağlı, kullanıcı profilinden; sır AES‑256‑GCM ile şifreli saklanır; 8 tek kullanımlık
  kurtarma kodu (yalnızca özetleri). MFA tamamlanmadan korumalı sayfa/işlem açılmaz.
- **Davetli üyelik**: yönetici davet üretir (7 gün geçerli, tek kullanımlık, özeti saklanan belirteç).
- **Oran sınırlama** (veritabanı tabanlı, çok örnekli dağıtımda da çalışır): giriş (IP ve e‑posta), MFA, yapay
  zekâ çağrıları, yüklemeler, yorumlar. Başarısız girişlerde zamanlama sızıntısını azaltmak için kullanıcı
  yokken de parola doğrulaması çalıştırılır.

### Yetkilendirme
- `proxy.ts` yalnızca iyimser ön kontrol yapar; **asıl karar** her sunucu bileşeni/server action'da DAL
  (`requireUser`, `requireStaff`, `assertRole`...) ile verilir.
- Nesne düzeyinde sahiplik: asistan yalnızca kendi taslaklarını görür/düzenler; dosya sunumu
  (`/api/dosya/[id]`) olgu/sınav durumuna göre karar verir (gizlenmiş olgunun görsel ve sesine asistan erişemez).
- Tüm girdiler **zod** ile doğrulanır; kimlikler UUID şemasından geçer; serbest metinlerde üst sınır vardır.

### Uygulama katmanı sertleştirme
- **CSP** nonce tabanlı (`script-src 'self' 'nonce-…' 'strict-dynamic'`), `frame-ancestors 'none'`,
  `object-src 'none'`, `form-action 'self'`; ayrıca HSTS (preload), `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, COOP/CORP başlıkları.
- Server Actions'ta Next.js'in **Origin/Host eşleşmesi** CSRF'ye karşı koruma sağlar; çerez `SameSite=Lax`.
- Kullanıcı metni asla HTML olarak işlenmez (`dangerouslySetInnerHTML` yok).
- **Dosya yükleme**: tür, dosya imzasından (magic bytes) doğrulanır; görseller sharp ile yeniden kodlanır
  (EXIF/XMP/IPTC temizlenir, en uzun kenar 2400 px, WebP); PDF boyut/imza kontrolü; dosyalar `public/` dışında,
  0600 izinle veya S3'te sunucu tarafı şifreli (SSE) saklanır; `Cache-Control: private, no-store`.
- **Denetim kaydı**: giriş/çıkış, MFA, davet, rol değişimi, onay/yayın/geri gönderme, silme, yapay zekâ ayarı,
  tartışma kilitleme — aktör, IP, varlık, meta veri ile `audit_logs` tablosunda; yönetim panelinden izlenir.
- Hata mesajları iç detay (SQL/stack) içermez; üretimde `poweredByHeader` kapalı, `robots: noindex`.
- Service worker yalnızca uygulama kabuğunu ve statik varlıkları önbellekler; **içerik ve API yanıtları
  cihazda saklanmaz**.

### Yapay zekâ güvenliği
- API anahtarı yalnızca sunucuda; istemci asla Anthropic'e doğrudan konuşmaz.
- Kullanıcı/belge metni istemde `<kullanici>`/`<kaynak>` etiketleriyle **veri olarak** sarmalanır; sistem
  istemi bu etiketlerdeki talimatlara uyulmamasını zorunlu kılar (prompt injection azaltımı).
- Olgu ipucu istemi yalnızca olgu metni ve görsel açıklamalarını alır; sistem istemi kesin tanı önermeyi yasaklar.
- Model yanıtı `stop_reason` kontrolünden geçer (`refusal`, `max_tokens`); kullanım `ai_usage` tablosunda
  kaydedilir; kullanıcı başına saatlik çağrı sınırı vardır.
- Yönetim panelinden model, çaba düzeyi, bağlam parça sayısı ve "kaynaksız yanıt" izni ayarlanır (varsayılan kapalı).

## 5. Yapay zekâ entegrasyonu ve kaynak indeksleme (RAG)

```
PDF/metin ──► metin çıkarımı (unpdf, sayfa bazlı) ──► parçalama (~900 kar., 120 örtüşme, başlık sezgisi)
          ──► tsvector ('turkish' yapılandırması) [+ Voyage embedding, 1024 boyut]
          ──► source_chunks (sayfa aralığı, bölüm, token tahmini)

Soru ──► websearch_to_tsquery (FTS, ts_rank_cd) ┐
     ──► embedding ◄──► pgvector kosinüs        ├─► Reciprocal Rank Fusion ─► ilk N parça
                                                ┘
     ──► <kaynak n="1" baslik konum> blokları + sistem istemi ──► Claude (akışlı) ──► [n] atıflı yanıt
     ──► atıflar ayrıştırılır, ai_messages'a kaydedilir; kaynak yoksa model çağrılmaz
```

Özellik bazında kullanım:

| Özellik | Girdi | Çıktı | Onay |
|---|---|---|---|
| Ders taslağı | Seçilen onaylı kaynakların tam metni + konu | Yapılandırılmış JSON (zod şeması ile doğrulanır) | Öğretim üyesi düzenler/onaylar |
| Soru-cevap | Soru + hibrit getirme sonuçları | Akışlı, `[n]` atıflı yanıt; kaynak yoksa "kaynak yetersiz" | Öğretim üyesi tartışmada düzeltebilir |
| Makale önerisi | Personelin girdiği adaylar (künye + özet) | Puan (0‑100), gerekçe, kalite notları; Türkçe yapılandırılmış özet | Öğretim üyesi seçer ve yayımlar |
| Sınav sorusu | Ders içeriği + kaynaklar | 5 seçenekli, açıklamalı, kaynak atıflı sorular | Her soru ayrı onaylanır |
| Olgu ipucu | Olgu metni + görsel açıklamaları + ilgili kaynak parçaları | Sokratik ipuçları (tanı verilmez) | Tartışmada "yapay zekâ" etiketiyle |
| Tartışma özeti | Yorumlar (öğretim üyesi düzeltmeleri öncelikli) | Öğrenme noktaları özeti | "Uzman görüşü yerine geçmez" notu |

**PubMed taraması**: MVP'de otomatik dış tarama yoktur (dış ağ bağımlılığı ve telif/erişim sınırları nedeniyle
bilinçli olarak ikinci aşamaya bırakıldı). Öğretim üyesi/yönetici adayları künye+özetle girer; yapay zekâ
değerlendirir. İkinci aşamada PubMed E‑utilities ile haftalık otomatik aday toplama eklenecektir (tasarımda
`articles.pmid` alanı bunun için hazırdır).

## 6. Kullanıcı ve hasta verilerinin korunması (KVKK)

- **Veri minimizasyonu**: Olgu formunda kimlik alanı yoktur; metinde kesin yaş/doğum tarihi/tarih/protokol numarası
  yazılmaması istenir (yaş aralığı yeterlidir). Formda zorunlu kimliksizleştirme/izin onayı alınır ve kayıt altına alınır.
- **Görsel üst verisi**: Tüm görseller yeniden kodlanır; EXIF/XMP/IPTC (cihaz, konum, hasta adı alanları) atılır.
  Görüntü üzerine yazılmış metinler için kullanıcı uyarılır (kırpma sorumluluğu paylaşan hekimdedir); öğretim
  üyesi onayı ikinci kontrol katmanıdır.
- **Erişim kontrolü ve iz**: Her dosya isteği yetki kontrolünden geçer ve `no-store` ile sunulur; önemli işlemler
  denetim kaydındadır.
- **Şifreleme**: Aktarımda TLS; durağan veride disk/volume şifrelemesi (sunucu düzeyi) + S3 SSE; MFA sırları
  uygulama düzeyinde AES‑256‑GCM.
- **Saklama/silme**: Yorumlar yumuşak silinir (moderasyon izi), kullanıcı askıya alınabilir; "hesap kapatma ve
  verileri anonimleştirme" işlemi 2. aşamada yönetim paneline eklenecektir (şema `onDelete: set null` ile buna
  hazırdır). Yedekler 30 gün tutulur (`ops/backup.sh`).
- **Yapay zekâ sağlayıcısı**: Anthropic API varsayılan olarak girdileri model eğitiminde kullanmaz; kurumsal
  sözleşme ve veri işleme ekiyle (DPA) kullanılmalıdır. Olgu metinleri zaten kimliksizdir; yine de kurum
  KVKK sorumlusunun yazılı onayı önerilir. Gerekirse bölgesel veri işleme (`inference_geo`) ayarı eklenebilir.

## 7. Ekranlar ve kullanıcı akışları (MVP)

- **Giriş / MFA / Davet kabul** — `/giris`, `/giris/mfa`, `/davet/[token]`
- **Ana sayfa** — haftanın dersi, makalesi, açık sınavlar, son olgular, bildirimler, (personel) onay kuyruğu
- **Dersler** — sadeleştirilmiş model (2026-11-05): öğretim üyesi başlık/alt dal/açıklama girer, aynı sayfada
  **materyal** ekler (PDF, görsel, 3B model, video, bağlantı, **ses kaydı**) ve **ders notu** yazar. Not, yüklenen PDF'in
  metninden **yapay zekâsız** çıkarılabilir (`lib/lessons/auto-notes.ts`: bölüm/cümle ayrımı, terim sıklığıyla cümle seçimi,
  anahtar terim vurgusu; belge cümleleri yeniden yazılmaz) ya da yapay zekâ ile üretilebilir (`lib/ai/lesson-notes.ts`);
  her durumda öğretim üyesi düzenler. Yayın **doğrudan** (taslak → yayında → arşiv); ikinci personel onayı, yapılandırılmış
  içerik editörü ve etkileşimli ders sayfası kaldırıldı. Sınav sorusu üretimi ders notu + PDF metnini bağlam olarak kullanır.
- **Makaleler** — haftanın makalesi, künye + Türkçe özet + tartışma soruları → personel: aday girişi, YZ
  değerlendirme, seçim, özet üretimi, yayın
  **Otomatik PubMed taraması (2026-11-06):** `lib/articles/pubmed.ts` (saf: sorgu kurma, efetch XML ayrıştırma — kaynakça
  DOI'leri atlanır —, yayın türü/dergi katmanı/özet ile 0-100 puan), `lib/articles/scan.ts` (esearch → mevcut PMID/DOI eleme →
  efetch → alt dal başına en iyi N aday `origin=pubmed_scan` olarak SUGGESTED; FACULTY/ADMIN'e bildirim; ayarlar `settings.article_scan`),
  `lib/articles/scan-scheduler.ts` (instrumentation'dan başlar; 6 saatte bir "zamanı geldi mi" denetimi; tek tarama kilidi).
  NCBI istek sınırına uyulur (anahtarsız 3/sn), geçici hatalarda 3 deneme; ulaşılamayan aramalar raporlanır.
- **Olgular** — sadeleştirilmiş model (2026-11-05): tek formda **olgu metni + birden çok görsel + tek ses kaydı**
  (tarayıcıda mikrofonla kayıt veya dosya; kimliksizleştirme onayı zorunlu). Asistan ya da öğretim üyesi paylaşınca olgu
  **hemen tartışmaya açılır** (inceleme/gizli tanı aşaması yok). Altındaki tartışmada herkes metin, görsel (en fazla 4)
  ve sesli yanıt verebilir. Personel olguyu gizleyebilir/yeniden açabilir ve YZ tartışma özeti üretebilir; yazar veya
  personel olguyu (tartışmasıyla birlikte) silebilir. Asistanlar YZ Sokratik ipucu isteyebilir.
- **Sınavlar** — soru türleri: çoktan seçmeli, çoklu seçim (birden fazla doğru), doğru/yanlış, eşleştirme (sağ sütun katılımcıya
  deterministik karıştırılmış gelir; eşleşme sunucuda puanlanır) → liste → sınav ekranı (geri sayım, işaretleme, önceki/sonraki, gözden geçirme, tamamla) →
  sonuç (puan, alt branş analizi, açıklamalar) → personel: oluştur, YZ soru üret, soru onayla, zamanla, aç/kapat,
  sonuç yayımla
  **PDF'ten içe aktarma (2026-11-05):** `lib/exams/pdf-questions.ts` numaralı soru/şık/cevap anahtarı sezgisel ayrıştırıcısı
  (yapay zekâsız, test edilmiş); `lib/ai/pdf-questions.ts` düzensiz biçimler için yapay zekâ ayrıştırması (doğru yanıt yalnızca belgede
  varsa). `actions/exam-import.ts`: PDF metni işlenir (dosya saklanmaz), önizlemede düzenlenen sorular DRAFT sınav + DRAFT sorular olarak
  kaydedilir ve olağan onay akışına girer.
- **YZ Asistanı** — sohbet, kaynak atıfları, "kaynak yetersiz" durumu
- **Asistanlar (personel)** — gelişim raporları: kohort tablosu (ortalama, son aylık sınav, eğilim, zayıf alt branş, katılım), sınav bazlı kohort sonuçları, alt branş doğruluğu; kişi bazlı rapor (aylık eğilim ve alt branş çubukları kohort ortalamasıyla karşılaştırmalı, sınav geçmişi, yorum/olgu katılımı); CSV dışa aktarma (denetim kaydına yazılır)
- **Kaynaklar** (personel) — PDF/metin yükle, indeksle, onayla, arama testi
- **Takvim**, **Bildirimler**, **Profil** (gelişim, parola, MFA), **Yönetim** (kullanıcılar, davetler, denetim,
  YZ ayarları, kullanım/maliyet)

## 8. Geliştirme aşamaları ve süre tahmini

| Aşama | İçerik | Süre (2 geliştirici) |
|---|---|---|
| 0 — Bu depo | Mimari, güvenlik katmanı, tüm MVP modüllerinin çalışır ilk sürümü | tamamlandı |
| 1 — Sertleştirme ve pilot hazırlık | Uçtan uca testler (Playwright), e‑posta ile davet/bildirim, hata izleme (Sentry), yük testi, güvenlik gözden geçirmesi (bağımsız sızma testi önerilir), KVKK dokümantasyonu | 3–4 hafta |
| 2 — Pilot (tek klinik) | Gerçek kaynaklarla RAG kalitesi ayarı, öğretim üyesi geri bildirimi, soru bankası, erişilebilirlik iyileştirmeleri | 6–8 hafta |
| 3 — İleri aşama | PubMed otomatik tarama, canlı Journal Club (video), görüntü temelli sınavlar, kıdeme göre kişiselleştirme, çok merkezli yapı (organizations), yerel mobil uygulamalar (Capacitor ile aynı kod tabanı) | 3–6 ay |

## 9. Maliyet tahmini

**İlk kurulum (pilot, tek klinik)**: Bu depodaki yazılımın üzerine 1. aşama (3–4 hafta × 2 geliştirici) +
güvenlik testi. Altyapı kurulumu 1–2 gün.

**Aylık işletme (≈40 asistan + 10 öğretim üyesi)** — kaba tahmin:

| Kalem | Tahmin |
|---|---|
| Sunucu (4 vCPU / 8 GB, PostgreSQL aynı makinede) veya üniversite VM | 20–60 USD |
| Nesne depolama + yedek (ilk yıl < 50 GB) | 1–5 USD |
| Claude API (`claude-opus-5-5`: 4 USD / 1M girdi, 20 USD / 1M çıktı) — haftada 2 ders taslağı (~150k girdi, 10k çıktı), 40 sınav sorusu, 1 makale değerlendirmesi, ~600 soru‑cevap (ortalama 6k girdi, 600 çıktı) | 25–60 USD; istem önbelleği ile düşer; `claude-sonnet-5-5` ile ~%50 daha az |
| Voyage embedding (isteğe bağlı; 1000 sayfa ≈ 1M token) | < 1 USD |
| Alan adı / TLS (Caddy ile ücretsiz sertifika) | ~1 USD |

Yönetim paneli "Kullanım" sekmesi gerçek token tüketimini ve tahmini maliyeti gösterir.

## 10. Bakım, güncelleme ve destek

- Bağımlılık güncellemeleri aylık (`npm outdated`, `npm audit`); Next/React büyük sürümleri çeyreklik.
- Yedekler: günlük `pg_dump` + dosya arşivi (`ops/backup.sh`), 30 gün saklama, aylık geri yükleme provası
  (`ops/restore.sh`).
- İzleme: uygulama günlükleri (stdout → journald/Docker), `audit_logs`, `ai_usage`; 1. aşamada Sentry ve
  uptime izleme.
- Destek modeli: pilot süresince haftalık geri bildirim toplantısı; hata düzeltme SLA'sı 2 iş günü.

## 11. Fikrî mülkiyet ve teslim

Depo (kaynak kod, veritabanı şeması/migrasyonları, tasarım dosyaları, bu dokümanlar) proje sahibine
devredilecek şekilde düzenlenmiştir; üçüncü taraf bileşenler yalnızca izin verici açık kaynak lisanslarıdır
(MIT/Apache‑2.0/BSD; `npm ls --json` ile liste alınabilir). Tek harici ticari bağımlılık yapay zekâ API'leridir
ve değiştirilebilir soyutlamanın (`src/lib/ai/client.ts`, `embed.ts`) arkasındadır.

## 12. Tasarım

Arayüz ilkeleri ve belirteçler için bkz. [TASARIM.md](TASARIM.md).

## 13. Bilinen sınırlar (MVP)

- E‑posta gönderimi yok: davet bağlantıları yönetici tarafından elle paylaşılır; bildirimler uygulama içidir.
- PubMed otomatik taraması yok (bkz. §5).
- Taranmış (OCR'sız) PDF'lerden metin çıkarılamaz; OCR'lı PDF yüklenmelidir.
- Canlı video, oyunlaştırma, çok merkezli yapı 2.–3. aşama.


## Asistan kipleri: yapay zekâsız kaynak arama ve SSS

- `lib/assistant/mode.ts` — kip kararı: yönetici `assistantMode = search_only` seçmişse ya da hiçbir sağlayıcı anahtarı yoksa
  **search**, aksi hâlde **ai**.
- `lib/assistant/search-answer.ts` — saf fonksiyonlar: sorgu terimleri, parça içinden en ilgili pencere (`bestSnippet`),
  terim vurgusu ve MarkdownLite uyumlu yanıt derleme (`buildSearchAnswer`). Model çağrısı yoktur; her satır ya öğretim
  üyesi yanıtı ya da kaynağın kendi cümlesidir. Atıf listesi `AiCitation` biçimindedir, UI aynı bileşenle gösterir.
- `faq_entries` tablosu — öğretim üyesi soru-yanıtları (`published`, isteğe bağlı `source_id` + `source_note`, alt branş,
  `tsv` tam metin). Yalnızca yayımlananlar asistanlara ve sohbete çıkar. Kaynak silinirse bağ `set null` olur, yanıt kalır.
- `api/asistan/sohbet` — her soruda kaynak getirme ve SSS araması paralel çalışır. **search** kipinde yanıt tek parça döner
  (`X-Answer-Mode: search`, `model = kaynak-arama`). **ai** kipinde SSS bloğu akıştan önce gönderilir; model hiç metin
  üretemeden hata verirse (429/503/404) aynı sorgu için arama yanıtı üretilip kalıcılaştırılır (otomatik geri düşüş).

## Sesli yorum

Tartışma yorumları (`comments`) isteğe bağlı bir ses eki taşır: `audio_file_id` (`files`, `kind = COMMENT_AUDIO`,
silinince `set null`) ve `audio_duration_sec`. Kayıt ve dosya seçimi ortak `AudioRecorder` bileşeniyle yapılır
(olgu ses kayıtlarıyla aynı kod). Sunucu, ses türünü dosya imzasından doğrular (`saveAudioUpload`), metin yoksa
ses, ses yoksa metin ister ve ses için kimliksizleştirme onayı zorunludur. Yetki: `/api/dosya` sesli yorumu yalnızca
yorum silinmemişse ve asistan hedef içeriği (yayımlı ders/makale, yayımlı/açıklanmış/kapanmış olgu) görebiliyorsa sunar.
Transkript yoktur (sıfır maliyet); yapay zekâ tartışma özeti sesli yorumları "(sesli yorum; metin yok)" olarak işaretler.
