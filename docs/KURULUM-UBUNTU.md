# OftalmoAkademi — Ubuntu sunucu kurulumu

Bu rehber, uygulamayı bir Ubuntu 22.04 / 24.04 sunucusunda Docker Compose ile (uygulama + PostgreSQL/pgvector)
ve Caddy ters vekiliyle (otomatik HTTPS) yayına almayı anlatır. Komutlar sunucuda, `sudo` yetkili bir kullanıcıyla çalıştırılır.

## 1. Gereksinimler

| Kalem | En az | Önerilen |
|---|---|---|
| İşlemci / bellek | 2 çekirdek, 4 GB RAM | 4 çekirdek, 8 GB RAM (imaj derlemesi bellek ister) |
| Disk | 20 GB | 50 GB+ (yüklenen PDF/video ve yedekler için) |
| Ağ | Alan adı (A kaydı sunucuya), 80 ve 443 portları açık | |
| Dışarı erişim | `generativelanguage.googleapis.com` (Gemini), `eutils.ncbi.nlm.nih.gov` (PubMed), `api.crossref.org` (DOI) | |

## 2. Docker kurulumu

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER   # oturumu kapatıp açın
```

`docker compose version` en az **2.24** olmalıdır (Ubuntu'nun kendi `docker.io` paketi değil, yukarıdaki Docker deposu kullanılmalı).

## 3. Proje dosyalarını sunucuya kopyalama

Geliştirme makinesinden (Mac) — geliştirme verisi, bağımlılıklar ve gizli anahtarlar **kopyalanmaz**:

```bash
rsync -av --exclude node_modules --exclude .next --exclude data --exclude .env --exclude .git \
  ~/Desktop/Akademi/oftalmoakademi/ kullanici@sunucu:/opt/oftalmoakademi/
```

Sunucuda klasörün sahibini ayarlayın: `sudo chown -R $USER /opt/oftalmoakademi`.

## 4. Ortam değişkenleri (`.env`)

```bash
cd /opt/oftalmoakademi
cp .env.example .env && chmod 600 .env
openssl rand -base64 32   # → APP_ENCRYPTION_KEY
openssl rand -base64 24   # → POSTGRES_PASSWORD
nano .env
```

Doldurulması gerekenler:

| Değişken | Değer |
|---|---|
| `NODE_ENV` | `production` |
| `APP_URL` | `https://alan-adiniz.edu.tr` |
| `APP_ENCRYPTION_KEY` | yukarıda üretilen 32 bayt base64 (**kaybedilirse MFA sırları ve oturumlar çözülemez; güvenli yerde saklayın**) |
| `POSTGRES_PASSWORD` | yukarıda üretilen parola |
| `DATABASE_URL` | **boş bırakın** (compose kendisi kurar) |
| `GEMINI_API_KEY` | Google AI Studio anahtarı (yapay zekâ; boşsa asistan kaynak arama kipinde çalışır) |
| `BOOTSTRAP_ADMIN_EMAIL` / `_NAME` / `_PASSWORD` | ilk yönetici (en az 12 karakter parola) |
| `NCBI_EMAIL` | (isteğe bağlı) kurumsal iletişim adresi, PubMed taraması için |

## 5. Uygulamayı başlatma

```bash
docker compose up -d --build          # ilk derleme 3-10 dk sürebilir
docker compose ps                     # app ve db "healthy" olmalı
docker compose logs -f app            # "[db] migrasyonlar güncel" ve Next.js "Ready" satırları
```

İlk yöneticiyi oluşturun (yalnızca hiç kullanıcı yokken çalışır):

```bash
docker compose exec app node --import ./scripts/lib/register.mjs --import tsx scripts/seed.ts
```

Ardından `.env` içindeki `BOOTSTRAP_ADMIN_PASSWORD` satırını silin ve `docker compose up -d` ile yeniden başlatın.
Diğer kullanıcılar yönetim panelinden **davetle** eklenir.

## 6. HTTPS: Caddy ters vekil

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
sudo cp ops/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile        # alan adını yazın
sudo systemctl reload caddy
```

Nginx tercih edilirse `ops/nginx.conf.example` (certbot ile TLS) kullanılabilir. Her iki örnekte de yükleme sınırı
160 MB'tır (uygulamadaki en büyük yükleme: ders videosu 150 MB) ve yapay zekâ yanıt akışı ara belleğe alınmaz.

Güvenlik duvarı:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

Uygulama portu (3000) yalnızca sunucunun kendisine açıktır; dışarıdan erişilemez.

## 7. Yedekleme

```bash
./ops/backup.sh                       # elle deneme: ops/backup/ altında db-*.dump ve files-*.tgz
crontab -e
# her gece 03:00
0 3 * * * /opt/oftalmoakademi/ops/backup.sh >> /var/log/oftalmoakademi-backup.log 2>&1
```

Yedekler 30 gün tutulur (`BACKUP_KEEP_DAYS`). **Yedekleri sunucu dışına da kopyalayın** (kurum depolama alanı, ikinci sunucu).
Geri yükleme: `./ops/restore.sh ops/backup/db-…dump ops/backup/files-…tgz` (onay ister, mevcut verinin üzerine yazar).

## 8. Güncelleme

```bash
# geliştirme makinesinden yeni kodu kopyalayın (3. adımdaki rsync), sonra sunucuda:
cd /opt/oftalmoakademi
./ops/backup.sh                       # önce yedek
docker compose up -d --build          # yeni migrasyonlar açılışta otomatik uygulanır
docker image prune -f                 # eski imajları temizle
```

## 9. Kurulum sonrası kontrol listesi

- [ ] `https://alan-adiniz` açılıyor, tarayıcıda kilit simgesi var (HTTPS).
- [ ] Yönetici girişi yapıldı, **Profil → İki adımlı doğrulama** açıldı.
- [ ] Yönetim → Yapay zekâ ayarları: sağlayıcı Gemini; YZ Asistanı'na bir soru sorulduğunda yanıtın altında "Kaynak arama" yerine model yanıtı geliyor.
- [ ] Bir öğretim üyesi davet edildi ve davet bağlantısıyla hesap açtı.
- [ ] Ders sayfasında PDF yüklendi, tartışmada mikrofonla ses kaydı yapılabildi (yalnızca HTTPS'te çalışır).
- [ ] Makaleler → Öneriler: "Şimdi tara" PubMed'den aday getirdi (`docker compose logs app | grep makale-tarama`).
- [ ] `./ops/backup.sh` çalıştı ve cron kuruldu.

## 10. Sorun giderme

| Belirti | Çözüm |
|---|---|
| `app` kapsayıcısı yeniden başlıyor | `docker compose logs app` — çoğunlukla eksik `APP_ENCRYPTION_KEY`/`APP_URL` veya veritabanı parolası |
| Büyük dosya yüklemesi "413" hatası | Ters vekilde `max_size` / `client_max_body_size` 160 MB olmalı |
| Asistan "kaynak arama" kipinde | `.env`'de `GEMINI_API_KEY` boş veya sunucudan Google'a erişim yok |
| PubMed taraması "ulaşılamadı" | Sunucunun dış erişimi / kurum vekil sunucusu; geçici NCBI kesintilerinde sonraki tarama tekrar dener |
| Mikrofon izni çıkmıyor | Site HTTPS değil veya tarayıcı izni engellenmiş |

## 11. KVKK ve veri notları

- Olgu, görsel ve ses kayıtları kimliksizleştirilmiş olmalıdır; formlarda onay zorunludur.
- Gemini **ücretsiz katmanında** gönderilen içerik Google tarafından ürün geliştirmede kullanılabilir. Gerçek kullanımda
  ücretli katman (veya kurumla veri işleme sözleşmesi bulunan bir hizmet) seçin ya da Yönetim → Yapay zekâ ayarlarında
  asistan kipini "Yalnızca kaynak arama" yapın.
- Veritabanı ve dosyalar sunucuda kalır; dışarıya yalnızca yapay zekâ isteği (etkinse) ve PubMed/Crossref sorguları çıkar.
