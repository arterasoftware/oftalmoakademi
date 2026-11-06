#!/bin/sh
# Geri yükleme (proje kökünde veya herhangi bir yerden):
#   ./ops/restore.sh ops/backup/db-YYYYMMDD-HHMM.dump [ops/backup/files-YYYYMMDD-HHMM.tgz]
# DİKKAT: mevcut veritabanı içeriğinin üzerine yazar.
set -eu
DUMP=${1:?dump dosyası gerekli}
FILES=${2:-}
DUMP=$(cd "$(dirname "$DUMP")" && pwd)/$(basename "$DUMP")
[ -n "$FILES" ] && FILES=$(cd "$(dirname "$FILES")" && pwd)/$(basename "$FILES")
cd "$(dirname "$0")/.."

printf "Veritabanı %s ile değiştirilecek. Devam için 'evet' yazın: " "$DUMP"
read -r ANSWER
[ "$ANSWER" = "evet" ] || { echo "İptal edildi."; exit 1; }

docker compose exec -T db pg_restore -U oftalmo -d oftalmoakademi --clean --if-exists --no-owner < "$DUMP"
if [ -n "$FILES" ]; then
  docker compose exec -T app sh -c 'mkdir -p /app/data && cd /app/data && tar xzf -' < "$FILES"
  echo "Dosyalar geri yüklendi."
fi
docker compose restart app
echo "Geri yükleme tamamlandı."
