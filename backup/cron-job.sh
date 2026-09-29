#!/bin/sh
# Việc crond chạy theo BACKUP_CRON: sao lưu, ghi log ra stdout của container
# (docker compose logs backup) và backups/backup.log. backup.log chỉ giữ
# 1000 dòng cuối khi vượt 2000 dòng (vài năm log), để không lớn mãi.
log=/backups/backup.log

if [ -f "$log" ] && [ "$(wc -l < "$log")" -gt 2000 ]; then
  tail -n 1000 "$log" > "$log.tmp" && mv "$log.tmp" "$log"
fi

/usr/local/bin/backup.sh 2>&1 | tee -a "$log" > /proc/1/fd/1
