#!/bin/sh
# Günlük yedek: PostgreSQL dökümü + yüklenen dosyalar (STORAGE_DRIVER=local).
# Sunucuda cron örneği (proje klasörü /opt/oftalmoakademi ise):
#   0 3 * * * /opt/oftalmoakademi/ops/backup.sh >> /var/log/oftalmoakademi-backup.log 2>&1
set -eu
# Betik nereden çağrılırsa çağrılsın proje kökünde çalış (docker compose dosyası orada)
cd "$(dirname "$0")/.."
STAMP=$(date +%Y%m%d-%H%M)
DEST=${BACKUP_DIR:-./ops/backup}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-30}
mkdir -p "$DEST"
chmod 700 "$DEST"

# 1) Veritabanı (özel biçim, sıkıştırılmış)
docker compose exec -T db pg_dump -U oftalmo -Fc oftalmoakademi > "$DEST/db-$STAMP.dump"

# 2) Yüklenen dosyalar: çalışan uygulama kapsayıcısından okunur (birim adına bağımlı değil)
docker compose exec -T app sh -c 'mkdir -p /app/data/storage && tar czf - -C /app/data storage' > "$DEST/files-$STAMP.tgz"

# Boş/bozuk yedek uyarısı
[ -s "$DEST/db-$STAMP.dump" ] || { echo "HATA: veritabanı yedeği boş" >&2; exit 1; }

# Eski yedekleri sil
find "$DEST" -name "db-*.dump" -mtime +"$KEEP_DAYS" -delete
find "$DEST" -name "files-*.tgz" -mtime +"$KEEP_DAYS" -delete
echo "Yedek tamamlandı: $DEST/db-$STAMP.dump, $DEST/files-$STAMP.tgz"
