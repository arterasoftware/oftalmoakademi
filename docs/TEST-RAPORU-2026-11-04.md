# Rol bazlı uçtan uca test raporu — 4 Kasım 2026

Ortam: yerel geliştirme (`npm run dev`, gömülü PGlite), Gemini ücretsiz katman, uygulama içi tarayıcı.
Hesaplar: demo yönetici, öğretim üyesi (Ayşe Demir), asistanlar (asistan1 MFA'lı, asistan2, asistan3) ve davetle oluşturulan yeni asistan.

## Kapsam ve sonuç özeti

| Alan | Senaryo | Sonuç |
|---|---|---|
| Giriş | Yanlış parola, askıya alınmış hesap, doğru giriş, çıkış | ✅ |
| MFA | Yanlış kod reddi, TOTP ile giriş | ✅ |
| Davet | Boş/kayıtlı e-posta reddi, davet oluşturma, bağlantıyla hesap açma, uyumsuz parola, tek kullanımlık bağlantı | ✅ |
| Yetki | Öğretim üyesi → /yonetim; asistan → kaynaklar, raporlar, yeni ders/olgu/SSS, sınav düzenleme, yönetim | ✅ /yetkisiz |
| Yetki | Asistan: incelemedeki ders ve etkileşimli sayfası, başkasının sohbeti | ✅ 404 |
| Yönetici | Askıya alma / etkinleştirme, kendi hesabı koruması, denetim kayıtları, kullanım, YZ ayarı doğrulama (99 → "En fazla 16"), kaynak ekleme/silme | ✅ |
| Ders | Boş taslak → içerik (liste, bölüm, tablo) → bağlantı materyali → içerikten etkileşimli sayfa (6 adım, kartlar) → asistanlara açma → incelemeye gönderme → yöneticinin onayı → yayın | ✅ |
| Ders | Yazar kendi dersini onaylayamıyor; ikinci personel/yönetici gerekiyor | ✅ (tasarım gereği) |
| Makale | Aday ekleme, seçme, YZ ile Türkçe özet, yayın, asistan görünümü | ✅ |
| Olgu | Gizli tanılı olgu oluşturma, yayın; asistan görünümünde gizli alanların HTML'de bulunmaması; yorum; YZ Sokratik ipucu (tanı sızdırmadı) | ✅ |
| Sınav | Asistan: 4 soru tipi (ÇS, D/Y, eşleştirme, çoklu seçim), gözden geçirme, onay penceresi, gönderim; personel: kapatma, sonuç yayını; asistan sonuç sayfası (4/4, alt branş tablosu) ve raporlar | ✅ |
| SSS | Öğretim üyesi ekleme/yayın, arama, asistan görünümünde düzenleme düğmesi yok | ✅ |
| Asistan (sohbet) | Kaynak arama kipi, otomatik kip, kapsam dışı soruda "Kaynak yetersiz" | ✅ |
| Diğer | Bildirimler (tümünü okundu), takvim, profil parola doğrulaması | ✅ |

## Bulunan ve düzeltilen hatalar

1. **Yönetim genel bakış maliyet kartı** sağlayıcı Gemini iken Claude modelini ve sahte bir dolar tutarı gösteriyordu. Artık kullanım satırları modele göre toplanır, maliyet satırın kendi modeliyle hesaplanır ve kart etkin sağlayıcı/modeli gösterir (`src/lib/queries/admin.ts`, `src/app/(app)/yonetim/page.tsx`).
2. **Olgu oluşturma mesajı**: "İncelemeye gönder" ile oluşturulan olguda "Taslak kaydedildi… incelemeye gönderebilirsiniz" yazıyordu. Mesaj artık duruma göre (`olgular/[id]/duzenle/page.tsx`).
3. **Makale Türkçe özeti yalnızca yapay zekâ ile üretilebiliyordu**; yapay zekâsız kurulumda makale özeti girilemiyor, YZ taslağı düzeltilemiyordu. Yeni "Özeti düzenle / elle yaz" formu (`makaleler/[id]/summary-editor.tsx`, `saveArticleSummaryAction`); elle yazılan özet "Öğretim üyesi özeti" rozetiyle gösterilir; özetsiz yayımda onay penceresi.
4. **Sınav listesi** gönderim sonrası geçmiş bir tarih için "Sonuçlar … tarihinde açıklanacak" diyordu; artık yalnızca gelecekteki tarih gösterilir, aksi hâlde "öğretim üyesi yayımladığında".

## Notlar (hata değil, karar gerektirir)

- Olguda yazar öğretim üyesi kendi olgusunu yayımlayabiliyor; derste ikinci bir personel gerekiyor. Tutarlılık istenirse olguya da aynı kural eklenebilir.
- Gelişim raporları askıdaki asistanı listelemiyor (beklenen davranış).
- Google ücretsiz katmanı istemleri ürün geliştirmede kullanabilir; olgu metinleri kimliksiz olsa da KVKK sorumlusunun onayı önerilir (Yönetim → YZ ayarları'nda uyarı var).

## Bu turda test edilmeyenler

- Dosya yüklemeleri (PDF kaynak, görsel, 3B, video, ses) uygulama içi tarayıcıda dosya seçici olmadığı için bu turda tekrarlanmadı; önceki oturumda doğrulanmıştı.
- Modelin yanıt veremediği durumda (kota/503) arama kipine otomatik geri düşüş yalnızca birim testiyle sınandı.
- E-posta gönderimi (MVP'de yok), S3 depolama, üretim PostgreSQL.

## Test verileri

Geliştirme veritabanında kalan test içerikleri: "Diyabetik Retinopati: Sınıflama ve Tedavi (test dersi)" (yayımlı), "İki taraflı görme bulanıklığı olan diyabetik hasta (test olgusu)" (tartışmaya açık), CLARITY makalesi (yayımlı), 1 SSS girdisi, kullanıcı `yeni.asistan@demo.local` (parolası `docs/DEMO-HESAPLAR.md` düzeninde değil; gerekirse yöneticiden sıfırlanır). İstenirse silinebilir. Demo sınavı kapatıldı ve sonuçları yayımlandı; asistan3 yeniden etkin; asistan kipi "Otomatik".

## Ek: 5 Kasım 2026 — kenar çubuğu ve çıkış (BUG-5)

- **Bulgu:** Masaüstünde kenar çubuğu sayfanın tüm yüksekliğine uzuyordu; alt kısmındaki
  Bildirimler/Profil bağlantıları (ve dolayısıyla tek çıkış düğmesi olan profil sayfası) uzun
  sayfalarda ekran dışında kalıyordu. Kullanıcı çıkış yapamıyor izlenimi buradan kaynaklanıyordu.
- **Düzeltme:** Kenar çubuğu pencere yüksekliğine sabitlendi (`sticky top-0 h-dvh`; menü bölümü
  kendi içinde kaydırılır). Ayrıca her sayfadan erişilebilen bir **Çıkış yap** düğmesi eklendi:
  kenar çubuğunun altına (masaüstü) ve üst çubuğa simge olarak (mobil). Profil sayfasındaki
  düğme korunmuştur; üçü de aynı `logoutAction`'ı kullanır (oturum iptali + denetim kaydı).
- **Doğrulama:** Masaüstünde kaydırılmış sayfada kenar çubuğu altındaki düğme görünür ve tıklanınca
  /giris'e yönlendiriyor; mobil üst çubuktaki simge de aynı şekilde çalışıyor. Tip denetimi, lint ve
  birim testleri (7 dosya / 23 test) temiz.

## Ek: 5 Kasım 2026 — sesli yorum özelliği

- **Eklendi:** Tartışma yorumlarına ses eki (kayıt veya dosya), yorum başına tek kayıt, 3 dk / 25 MB, metin isteğe bağlı,
  kimliksizleştirme onayı zorunlu. Yorum kartında yerleşik oynatıcı ve süre rozeti. Silinen yorumun sesi silinir.
- **Değişen dosyalar:** `src/db/schema.ts`, `drizzle/0004_comment_audio.sql`, `src/lib/storage/files.ts`,
  `src/components/audio/audio-recorder.tsx` (yeni, olgu kaydediciyle ortak), `src/components/cases/case-audio-manager.tsx`,
  `src/lib/queries/discussion.ts`, `src/lib/actions/discussion.ts`, `src/components/discussion/comment-form.tsx`,
  `src/components/discussion/comment-item.tsx`, `src/app/api/dosya/[id]/route.ts`, `src/lib/ai/discussion-summary.ts`.
- **Doğrulama (yerleşik tarayıcı, asistan2 ile yayımlı test dersinde):** metinsiz ve sessiz gönderim istemci tarafında
  reddedildi; ses var ama onay kutusu yokken sunucu "onaylamalısınız" hatası döndürdü ve seçilen ses formda korundu;
  onayla gönderimde yorum "Sesli yorum" rozeti ve oynatıcıyla listelendi (1 sn WAV, 0:01); `/api/dosya/<id>` oturumla 200,
  çerezsiz 401; sahibi olmayan başka bir asistan (yayımlı ders) 200; yorum silinince dosya 404. Mobil görünümde form
  ve kaydedici düzgün yerleşti. Tip denetimi, lint ve birim testleri temiz.
- **Düzeltilenler:** "use server" dosyasından sabit dışa aktarımı (Next hatası) kaldırıldı; eylemli formlarda gereksiz
  `encType` (React uyarısı) kaldırıldı; React'in eylem sonrası form sıfırlamasında kaydın kaybolmaması için kaydedici
  son dosyayı geri yüklüyor; yorum formuna istemci tarafı ön denetim eklendi.
- **Doğrulanamayan:** gerçek mikrofon kaydı (yerleşik tarayıcıda mikrofon yok); yayımlanmamış hedefte 403 kuralı yalnızca
  kod incelemesiyle.

## Ek: 5 Kasım 2026 — makale DOI araması ve tam metin PDF

- **İstek:** Aday makale eklerken DOI ile künyenin otomatik gelmesi ve PDF'in doğrudan yüklenebilmesi; alanların tek tek girilmemesi.
- **Yapılan:** `lib/articles/metadata.ts` (Crossref + PubMed E-utilities, anahtarsız, 10 sn zaman aşımı, DOI normalleştirme, PDF ilk 3 sayfadan DOI çıkarımı);
  `lookupArticleDoiAction`, `uploadArticlePdfAction` (ARTICLE_PDF türü, 40 MB), `removeArticlePdfAction`; aday formu yeniden yazıldı
  (DOI + Ara, PDF yükle, başlık/alt branş görünür, künye ayrıntıları açılır bölümde ve düzenlenebilir); aynı DOI ile ikinci kayıt reddedilir;
  makale sayfasında "Tam metin (PDF)" bağlantısı ve personel için "PDF'i kaldır"; `/api/dosya` asistanlara makale yayımlanınca izin verir.
  Migrasyon: `drizzle/0005_article_pdf.sql`.
- **Doğrulama:** Birim testleri (DOI normalleştirme/çıkarımı) eklendi; tip denetimi ve lint temiz. Tarayıcı doğrulaması sunucu yeniden başlatıldıktan sonra yapılacak.

## Ek: 5 Kasım 2026 — olgu modülü sadeleştirmesi ve görselli yorum

- **İstek:** Olgu sayfasında tek metin alanı, tek görsel alanı (çoklu), ses kaydı; altında asistan ve hocaların metin/görsel/ses ile
  tartışması. Kararlar: gizli tanı mekanizması kaldırıldı, doğrudan paylaşım (onay yok), eski veriler korunmadı.
- **Yapılan:** `clinical_cases` yeniden kuruldu (title, subspecialty, status PUBLISHED/HIDDEN, body, audioFileId, …); `case_audio` tablosu
  kaldırıldı; `case_images` sadeleşti; yeni `comment_images` tablosu ve `COMMENT_IMAGE` dosya türü. Migrasyon `drizzle/0006_case_simplify.sql`
  (elle yazıldı; CASE yorumları ve eski olgular silinir). Olgu sorguları/eylemleri/sayfaları ve bileşenleri yeniden yazıldı
  (`case-form`, `case-card`, `case-workflow` → gizle/aç, sil, YZ özeti; `case-image-list`); yorum formuna "Görsel ekle" (en fazla 4) eklendi;
  dosya sunum kuralları yeni modele göre yeniden yazıldı; ana sayfa ve yönetim panelinden "olgu incelemede" sayaçları kaldırıldı; demo seed güncellendi.
- **Doğrulama (tarayıcı, sunucu yeniden başlatıldıktan sonra):** Asistan olgu paylaştı (metin + 2 görsel + WAV ses) → olgu sayfasında metin,
  galeri, ses oynatıcı, "Düzenle", YZ ipucu kartı ve tartışma göründü; görselli yorum gönderildi ve küçük resimle listelendi; düzenleme
  sayfasında görsel silindi ve başlık güncellendi. Öğretim üyesi olguyu gizledi (rozet "Gizlendi", listede "Gizlenen olgular (1)");
  yazar olmayan asistan için olgu sayfası 404, görsel 403, listede yok. Öğretim üyesi olguyu sildi → /olgular'a yönlendi, dosya 404.
  Not: makale DOI/PDF akışı da aynı oturumda doğrulandı (Crossref künye, PDF'ten DOI, aynı DOI reddi, asistan PDF 403).

## Ek: 5 Kasım 2026 — ders modülü sadeleştirmesi

- **İstek:** Öğretim üyesi doğrudan belge/görsel/3B model/video/bağlantı/ses eklesin; yüklenen belgeden (PDF) kısa, vurgulu
  ders notu üretilsin (yapay zekâ ile ve yapay zekâsız). Kararlar: doğrudan yayın; içerik editörü ve etkileşimli sayfa kaldırıldı.
- **Yapılan:** `lessons` tablosu sadeleşti (description, notes, notesSource/Model/UpdatedAt; durumlar DRAFT/PUBLISHED/ARCHIVED);
  `material_kind` enum'una AUDIO eklendi; migrasyon `drizzle/0007_lesson_simplify.sql` (eski dersler silinir).
  Yeni: `lib/lessons/auto-notes.ts` (+6 test), `lib/ai/lesson-notes.ts`, `components/lessons/lesson-form.tsx`,
  `lesson-notes-editor.tsx`; materyal yöneticisine ses kaydı (kaydedici/dosya); ders sayfaları ve iş akışı yeniden yazıldı
  (yayımla/yayından kaldır/arşivle/sil). Silinen: etkileşimli sayfa ve runner, içerik editörü, YZ ders taslağı.
  Sınav soru üretimi ders notu + PDF metnini kullanır; panel ve yönetimden "ders incelemede" sayacı kaldırıldı.
- **Doğrulama (tarayıcı):** Öğretim üyesi yeni ders oluşturdu (başlık/alt dal/açıklama → düzenleme sayfası); PDF (iki bölümlü deneme belgesi)
  ve WAV ses materyali eklendi; "Belgeden not çıkar" belgenin cümlelerinden bölümlü, anahtar terimleri kalın not üretti; "Yapay zekâ ile not üret"
  Gemini ile özet/hedefler/önemli noktalar/tuzaklar/sorular üretti; Kaydet ve Yayımla çalıştı (rozet "Yayında"). Asistan: ders listede ve sayfada
  görünüyor, not başlıklarıyla render ediliyor, PDF ve ses dosyaları 200 dönüyor, tartışma açık, yönetim düğmeleri yok.
- **Bulunup düzeltilen:** (1) Not üretme düğmesi `useActionState` eylemini geçiş dışında çağırdığı için çalışmıyordu → `startTransition`.
  (2) Kaydet sonrası not kaynağı "Elle yazıldı"ya dönüyordu (textarea \r\n satır sonları) → sunucuda normalize edildi.
  (3) Not kaynak satırı `_…_` ile ham görünüyordu → düz metin.
- Test verisi: "Test dersi: Primer açık açılı glokomda tedavi ilkeleri" (yayında) geliştirme veritabanında bırakıldı.

## Ek: 5 Kasım 2026 — sınav PDF'inden mini sınav

- **Yapılan:** `/sinavlar/pdf` sayfası; `lib/exams/pdf-questions.ts` (+4 test: üç numara biçimi, satır içi şıklar, çok satırlı kök, "Cevap:",
  yıldız ve cevap anahtarı, ardışık olmayan numaralar), `lib/ai/pdf-questions.ts`, `actions/exam-import.ts` (ayrıştır / içe aktar),
  `components/exams/pdf-import.tsx` (önizleme: dahil et, kök/şık düzenle, doğru yanıt radyo, açıklama; başlık/tür/alt branş/süre).
  Sınav listesine "PDF'ten sınav" bağlantısı eklendi.
- **Doğrulama (tarayıcı):** Dört soruluk deneme PDF'i (A) satır başı şıklar, B) satır içi şıklar + "Cevap: B", C) yıldızlı şık, D) yanıtsız;
  sonda "1-B 2-B 3-A" anahtarı) yapay zekâsız ayrıştırıldı: 4 soru, yanıtlar B/B/A, 4. soru "belirlenemedi" uyarısıyla; oluştur düğmesi
  yanıt işaretlenene kadar devre dışı. Yanıt ve alt branş seçilip oluşturulunca sınav düzenleme sayfasına yönlendi: "4 soru, 0 onaylı",
  olağan onay akışı. Tip denetimi, lint ve 37 birim testi temiz.
  Yapay zekâ ayrıştırması (Gemini) aynı PDF'te 4 soruyu buldu, yanıtları B/B/A olarak aldı ve belgede olmayan 4. yanıtı tahmin etmedi.

## Ek: 6 Kasım 2026 — makale arka plan taraması (PubMed)

- **Yapılan:** `articles` tablosuna origin / pub_types / scan_score / scan_query (migrasyon `drizzle/0008_article_scan.sql`);
  `lib/articles/pubmed.ts` (+5 test, gerçek PubMed XML örneği `tests/fixtures/pubmed-sample.xml`), `lib/articles/scan.ts`,
  `lib/articles/scan-scheduler.ts`, `actions/article-scan.ts` (Şimdi tara: saatte 4; ayarlar: yalnızca yönetici), öneriler sayfasında
  tarama kartı, kaynak sekmeleri (Tümü / PubMed taraması / Elle) ve aday rozetleri (tarama puanı, yayın türü, özet, PubMed bağlantısı).
- **Doğrulama (tarayıcı, öğretim üyesi):** Sunucu açılışından ~2,5 dk sonra planlı tarama kendiliğinden çalıştı: 8 alt daldan 18 aday,
  sıradaki tarama +7 gün; öğretim üyesine "Makale taraması: 18 yeni çalışma önerisi" bildirimi geldi. Adaylarda tarama puanı, yayın türü
  rozetleri (RKÇ, meta-analiz, sistematik derleme, kılavuz), özet ve PubMed bağlantısı göründü; "PubMed taraması / Elle" sekmeleri doğru sayıyor.
  Öğretim üyesinde "Şimdi tara" var, yönetici ayarları yok. 31 adayda 31 farklı PMID (mükerrer yok).
- **Bulunup düzeltilen:** (1) Elle tekrar tarama aynı havuzdan sıradaki adayları ekleyip kuyruğu şişiriyordu (2. taramada +13) → sınır
  "alt dal başına bekleyen tarama adayı" oldu; 3. taramada 0 eklendi, dolu alt dal raporlandı. (2) Tarama kilidi modül değişkeniydi;
  zamanlayıcı ve eylem farklı modül kopyalarında çalışabildiği için süreç geneline (globalThis) taşındı, eklemeden hemen önce PMID yeniden denetleniyor.
  (3) Dergi adı PubMed'in küçük harfli tam adı yerine ISO kısaltmasıyla kaydediliyor (yeni taramalardan itibaren).
- **Doğrulanamayan:** Yönetici ayar formu tarayıcıda denenmedi (yönetici parolasının test betiğine aktarılması izin sisteminde engellendi);
  eylem sunucuda `assertAdmin` ile korunuyor, tip denetiminden geçiyor. Tip denetimi, lint ve 42 birim testi temiz.
