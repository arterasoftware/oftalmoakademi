# OftalmoAkademi

Yapay zekâ destekli oftalmoloji asistan eğitim ve akademik paylaşım platformu (MVP). Türkçe arayüz, mobil uyumlu
PWA, davetli üyelik, üç rol (yönetici / öğretim üyesi / asistan), ders–makale–olgu–sınav modülleri, kaynak temelli
yapay zekâ asistanı, tartışma alanları, bildirimler ve yönetim paneli.

- Mimari ve güvenlik tasarımı: [docs/MIMARI.md](docs/MIMARI.md)
- Geliştirme sözleşmesi: [docs/GELISTIRME-REHBERI.md](docs/GELISTIRME-REHBERI.md)

## Hızlı başlangıç (geliştirme)

Gereksinim: Node.js 26 LTS. Veritabanı için **ek kurulum gerekmez** (gömülü PGlite kullanılır).

```bash
npm install
cp .env.example .env
# .env içinde APP_ENCRYPTION_KEY üretin:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# İlk yönetici için BOOTSTRAP_ADMIN_* alanlarını doldurun, sonra:
npm run db:migrate
npm run db:seed
npm run dev
```

Uygulama `http://localhost:3000` adresinde açılır. Yönetici ile giriş yapıp **Yönetim → Davetler** üzerinden
öğretim üyesi ve asistan davetleri oluşturun (bağlantı ekranda gösterilir; MVP'de e‑posta gönderimi yoktur).

Yapay zekâ özellikleri için `.env` dosyasına **ücretsiz** bir Google Gemini anahtarı (`GEMINI_API_KEY`, https://aistudio.google.com/apikey)
veya `ANTHROPIC_API_KEY` ekleyin; sağlayıcı Yönetim → Yapay zekâ ayarları'ndan seçilir. Gemini anahtarı varsa vektör arama da
Gemini embedding ile ücretsiz çalışır (alternatif: `VOYAGE_API_KEY`).

Bilimsel kaynaklar (PDF/metin) **Kaynaklar** sayfasından veya **Yönetim → Kaynaklar** sekmesinden eklenir, onaylanır ve silinir;
silme, indeks parçalarını ve ders bağlantılarını da kaldırır ve denetim kaydına yazılır.

### Asistan kipleri ve maliyet

Asistan iki kipte çalışır (Yönetim → Yapay zekâ ayarları → "Asistan kipi"):

- **Otomatik:** anahtar varsa kaynak temelli yapay zekâ yanıtı; anahtar yoksa veya model yanıt veremezse (kota, model
  kaldırılmış, ağ) aynı soru için kendiliğinden kaynak arama kipine düşer.
- **Yalnızca kaynak arama (sıfır maliyet):** hiçbir dış servis çağrılmaz. Asistan, öğretim üyelerinin **Sık Sorulan
  Sorular** (`/sss`) yanıtlarını ve onaylı kaynaklardaki en ilgili bölümleri sayfa numarasıyla, doğrudan alıntı olarak
  listeler. Yanıt uydurma riski yoktur.

Öğretim üyeleri SSS sayfasından soru-yanıt ekler, kaynağa bağlar ve yayımlar; yayımlanan yanıtlar asistan sohbetinde
her iki kipte de model yanıtından önce gösterilir.

Demo verisi (örnek kullanıcılar, kaynak, ders, olgu, sınav): `npm run db:demo` — hesap bilgileri betiğin
çıktısında yazdırılır.

> **Not:** Gömülü PGlite veritabanı aynı anda yalnızca **tek süreç** tarafından açılabilir. `db:*` betiklerini
> çalıştırmadan önce `npm run dev` sunucusunu durdurun (aksi hâlde betik `data/pglite.lock` nedeniyle açık bir hata
> verir). Geliştirmede bekleyen migrasyonlar sunucu açılışında otomatik uygulanır (`src/instrumentation.ts`); şema
> değişikliğinden sonra `npm run dev`'i yeniden başlatmak yeter. Üretimde PostgreSQL kullanıldığından tek süreç kısıtı
> yoktur; açılışta migrasyon için `AUTO_MIGRATE=1` verin.

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` / `npm start` | Üretim derlemesi / sunucu |
| `npm run typecheck` | TypeScript denetimi |
| `npm run lint` | ESLint |
| `npm test` | Birim testleri (vitest) |
| `npm run db:generate` | Şema değişikliğinden migrasyon üret |
| `npm run db:migrate` | Migrasyonları uygula |
| `npm run db:seed` | İlk yöneticiyi oluştur |
| `npm run db:demo` | Demo verisi |
| `node --env-file-if-exists=.env --import ./scripts/lib/register.mjs --import tsx scripts/seed-materials.ts` | Demo dersine örnek materyaller (PDF, görsel, 3B, video, bağlantı) |
| `npm run db:ingest -- <id|all>` | Kaynakları yeniden indeksle |

## Üretim dağıtımı

```bash
cp .env.example .env   # APP_ENCRYPTION_KEY, POSTGRES_PASSWORD, APP_URL, ANTHROPIC_API_KEY ...
docker compose up -d --build
docker compose exec app node --import ./scripts/lib/register.mjs --import tsx scripts/seed.ts
```

Adım adım Ubuntu kurulumu (Docker, `.env`, ilk yönetici, Caddy/Nginx, güvenlik duvarı, yedek, güncelleme):
**[docs/KURULUM-UBUNTU.md](docs/KURULUM-UBUNTU.md)**.

Uygulama yalnızca `127.0.0.1:3000` üzerinde dinler; TLS için `ops/Caddyfile.example` ile Caddy (veya
`ops/nginx.conf.example` ile Nginx) ters vekil kullanın; ikisinde de yükleme sınırı 160 MB. `docker-compose.yml`
`.env`'deki tüm değişkenleri (Gemini, NCBI, ilk yönetici …) uygulamaya aktarır. Yedekleme: `ops/backup.sh`
(günlük cron; veritabanı + yüklenen dosyalar), geri yükleme: `ops/restore.sh`.

Üretim için zorunlu ortam değişkenleri: `APP_ENCRYPTION_KEY` (32 bayt base64), `DATABASE_URL`
(PostgreSQL 16+/17, `vector` uzantısı), `APP_URL` (https). Dosyalar için `STORAGE_DRIVER=s3` seçilirse
`@aws-sdk/client-s3` paketi kurulmalıdır (`npm i @aws-sdk/client-s3`).

## Dizin yapısı

```
src/app/(auth)      giriş, MFA, davet kabul
src/app/(app)       uygulama kabuğu ve modüller (panel, dersler, makaleler, olgular, sinavlar, asistan, ...)
src/app/api         yetkili dosya sunumu, akışlı yapay zekâ sohbeti
src/db              Drizzle şeması, bağlantı, migrasyon
src/lib/auth        parola, oturum, MFA, davet, oran sınırlama, DAL
src/lib/ai          Anthropic istemcisi, istemler, RAG (parçalama, embedding, indeksleme, getirme)
src/lib/storage     depolama sürücüleri ve güvenli yükleme
src/lib/actions     server action'lar (modül başına)
src/lib/queries     okuma sorguları / DTO'lar
src/components      arayüz bileşenleri
drizzle/            SQL migrasyonları
scripts/            CLI betikleri (migrate, seed, demo, ingest)
ops/                dağıtım, ters vekil, yedekleme
docs/               mimari ve geliştirme dokümanları
```

## Otomatik makale taraması (PubMed)

Sunucu içi zamanlayıcı (varsayılan 7 günde bir) PubMed E-utilities ile alt dal sorgularını tarar: son 30 günde eklenen,
İngilizce, özetli RKÇ / meta-analiz / sistematik derleme / kılavuzlar. Kuyrukta veya arşivde olmayan çalışmalar, yayın türü +
dergi + özet ile **yapay zekâsız** puanlanır; her alt daldan en yüksek puanlı 3 tanesi "Öneri" olarak eklenir ve öğretim
üyelerine bildirim gider. Makaleler → Öneriler sayfasında "Şimdi tara" (personel) ve tarama ayarları/sorgular (yönetici)
bulunur; yapay zekâ varsa mevcut "Yapay zekâ ile değerlendir" düğmesi adayları ayrıca puanlar.
İsteğe bağlı ortam değişkenleri: `NCBI_API_KEY`, `NCBI_EMAIL` (kurumsal adres), `ARTICLE_SCAN_SCHEDULER=0` (zamanlayıcıyı kapatır;
çok örnekli dağıtımda dış cron kullanın).

## Sınav PDF'inden mini sınav

Sınavlar → "PDF'ten sınav": soru PDF'i yüklenir (dosya saklanmaz), numaralı sorular ve A-E şıkları **yapay zekâsız**
tanınır ("Cevap: C" satırları, yıldızlı şık ve belge sonundaki cevap anahtarı okunur); isteğe bağlı yapay zekâ ayrıştırması
düzensiz biçimler içindir. Önizlemede sorular düzenlenir, eksik doğru yanıtlar işaretlenir ve tek tıkla taslak sınav
oluşturulur; sorular mevcut onay akışından geçer. Taranmış (görüntü) PDF'ler desteklenmez.

## Dersler (sadeleştirilmiş)

Ders = başlık + alt dal + kısa açıklama + materyaller (PDF, görsel, 3B model, video, bağlantı, ses kaydı) + ders notu.
Ders notu yüklenen PDF'ten **yapay zekâsız** çıkarılabilir (belgedeki önemli cümleler, anahtar terimler kalın) veya
yapay zekâ ile üretilebilir; öğretim üyesi düzenleyip **doğrudan yayımlar** (onay akışı yok).

## Olgular (sadeleştirilmiş)

Olgu paylaşmak tek adımdır: başlık, alt dal, **olgu metni**, isteğe bağlı **görseller** (birden çok) ve **tek ses kaydı**;
kimliksizleştirme onayıyla gönderilince olgu hemen tartışmaya açılır (inceleme ve gizli tanı aşaması yoktur). Öğretim
üyesi olguyu gizleyebilir; yazar veya personel silebilir. Tartışmada metin, görsel (en fazla 4) ve sesli yanıt verilebilir.

## Sesli ve görselli yorum (tartışma alanları)

Ders, makale ve olgu tartışmalarında yorumlara ses ve görsel eklenebilir: tarayıcıda mikrofonla kayıt (MediaRecorder)
veya dosya yükleme (MP3, M4A, OGG/Opus, WAV, WebM). Yorum başına tek kayıt, en fazla 3 dakika / 25 MB;
metin isteğe bağlıdır (yalnızca ses gönderilebilir).

- Gönderimden önce kayıtta hasta kimlik bilgisi bulunmadığına dair onay kutusu zorunludur (KVKK).
- Ses yalnızca `/api/dosya/<id>` üzerinden ve oturumla sunulur; asistanlar yalnızca yayımlanmış içeriğin
  yorum seslerini dinleyebilir, silinen yorumun sesi erişilemez olur ve dosyası silinir.
- Sıfır maliyet ilkesi gereği transkript üretilmez; tartışma özeti ve arama yalnızca metin yorumlarını görür.
- Mikrofon erişimi için HTTPS (veya localhost) gerekir.

## Makale künyesi (DOI) ve tam metin PDF

Aday makale eklerken DOI girip **Ara** demek yeterlidir: künye (başlık, yazarlar, dergi, tarih, özet, PMID)
Crossref ve PubMed E-utilities üzerinden ücretsiz, anahtarsız getirilir ve form otomatik doldurulur; alanlar
düzenlenebilir. PDF yüklenirse DOI dosyanın ilk sayfalarından bulunur ve aynı sorgu yapılır. PDF `files`
tablosunda `ARTICLE_PDF` türüyle saklanır, yalnızca `/api/dosya` ile sunulur (asistanlar için makale
yayımlandığında) ve makale sayfasından kaldırılabilir. Tam metin yalnızca erişim/telif izni olan içerik için
yüklenmelidir.
