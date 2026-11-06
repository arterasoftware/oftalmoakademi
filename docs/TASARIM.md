# OftalmoAkademi — Tasarım İlkeleri

Arayüz, evrensel kullanılabilirlik ve insan-bilgisayar etkileşimi ilkelerine göre düzenlenmiştir:

| İlke | Uygulama |
|---|---|
| **Konum görünürlüğü** (sistem durumunun görünürlüğü) | Üst çubukta modül renkli kırıntı izi ("● Olgular › Ayrıntı"); kenar menüsünde aktif öğe için hafif ton + sol vurgu çubuğu; mobil alt çubukta üst çizgi ve tonlu ikon. Her sayfa aynı `PageHeader` düzeniyle başlar (üst bilgi, başlık, açıklama, eylemler). |
| **Tanıma > hatırlama** | Menü üç bölüme ayrılır: Eğitim, Araçlar, Eğitim yönetimi. Modül ikonları ve renkleri tutarlıdır (mavi: dersler/makaleler, camgöbeği: olgular, amber: sınavlar/raporlar, mor: yapay zekâ/kaynaklar). |
| **Hafif renklendirme ile yapı ayrımı** | Kart başlıkları gövdeden hafif tonla ayrılır; uyarılar (bilgi/başarı/dikkat/hata) ikon + açık arka plan ile; sayfa zemini (`surface-sunken`) kartlardan (`surface`) bir ton koyudur. Doygun renk yalnızca eylem (birincil düğme) ve durum için kullanılır. |
| **Tutarlılık ve standartlar** | Tek buton/giriş/rozet/kart bileşen seti (`src/components/ui`); 8 px ritim, 12–14 px köşe yarıçapı, 15 px temel yazı boyutu, sıkı başlık izleme. |
| **Erişilebilirlik** | Klavye odak halkası tüm etkileşimli öğelerde; `aria-current="page"`; renk tek başına anlam taşımaz (metin/ikon eşlik eder); WCAG AA kontrast hedefi; `prefers-reduced-motion` desteği; açık/koyu tema sistem tercihini izler. |
| **Hata önleme ve geri bildirim** | Geri alınamaz işlemlerde onay; form hataları alanın altında; işlem sonucu başarı/hata kutusuyla aynı sayfada; yükleme durumları düğmede. |
| **Minimal ve odaklı** | Gölgeler çok hafif; dekoratif öğe yok; içerik genişliği 72 rem ile sınırlı; mobilde 5 öğeli alt menü, güvenli alan boşlukları. |

Belirteçler `src/app/globals.css` içinde tanımlıdır (`--surface*`, `--ink*`, `--tint-*`); Tailwind utility'leri (`bg-tint-exam`, `text-ink-muted` vb.) bunlara bağlıdır. Yeni bir modül eklerken `src/components/layout/nav-config.ts` içine bölüm ve tonunu kaydetmek yeterlidir; kırıntı izi ve aktif durum otomatik çalışır.
