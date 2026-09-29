#!/bin/sh
# Khởi động service sao lưu: kiểm tra cấu hình, rồi để crond chạy backup.sh
# theo BACKUP_CRON (mặc định 09:00 hằng ngày, giờ theo TZ).
set -eu

# crond chạy job với môi trường tối giản: ghi lại các biến cần dùng để
# backup.sh đọc (file chỉ root đọc được vì có mật khẩu).
umask 077
export -p | grep -E '^export (PG[A-Z]+|WEBDAV_[A-Z_]+|KEEP_DAYS|TZ)=' > /run/backup.env || true
umask 022

if ! printf '%s\n' "$BACKUP_CRON" | grep -Eq '^[^[:space:]]+([[:space:]]+[^[:space:]]+){4}$'; then
  echo "BACKUP_CRON không hợp lệ: '$BACKUP_CRON' (cần 5 trường, ví dụ '0 9 * * *')" >&2
  exit 1
fi

mkdir -p /etc/crontabs
# Log ra stdout của container (docker compose logs backup) và backups/backup.log.
echo "$BACKUP_CRON /usr/local/bin/backup.sh 2>&1 | tee -a /backups/backup.log > /proc/1/fd/1" > /etc/crontabs/root

echo "$(date '+%F %T %Z') Service sao lưu đã chạy, lịch: '$BACKUP_CRON' (TZ=$TZ)"
# Báo lỗi cấu hình ngay bây giờ thay vì đợi đến giờ sao lưu; không dừng
# service khi lỗi (sao lưu vào ./backups vẫn chạy nếu WebDAV tạm hỏng).
backup.sh --check || true

exec crond -f -l 8
