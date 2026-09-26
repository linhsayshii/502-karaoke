#!/usr/bin/env bash
# Sao lưu database vào backups/karaoke_<ngày>_<giờ>.sql.gz và xoá bản cũ hơn KEEP_DAYS ngày (mặc định 30).
# Dùng tay: ./scripts/backup.sh   — hoặc trong crontab (xem DEPLOYMENT.md mục 5).
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p backups
file="backups/karaoke_$(date +%Y%m%d_%H%M%S).sql.gz"

# Ghi ra file tạm, chỉ đổi tên khi pg_dump thành công: không bao giờ để lại hay ghi đè bằng bản hỏng
if ! docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner "$POSTGRES_DB"' | gzip > "$file.tmp"; then
  rm -f "$file.tmp"
  echo "$(date '+%F %T') Sao lưu thất bại" >&2
  exit 1
fi
mv "$file.tmp" "$file"

find backups -name 'karaoke_*.sql.gz' -mtime "+${KEEP_DAYS:-30}" -delete
echo "$(date '+%F %T') Đã sao lưu: $file ($(du -h "$file" | cut -f1))"
