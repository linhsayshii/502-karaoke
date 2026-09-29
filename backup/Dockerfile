# syntax=docker/dockerfile:1

# Service sao lưu: pg_dump hằng ngày vào ./backups và tải lên WebDAV.
# Cùng bản PostgreSQL với service db (pg_dump phải cùng hoặc mới hơn máy chủ).
FROM postgres:17-alpine

# curl: gọi WebDAV; tzdata: giờ chạy theo TZ (Asia/Ho_Chi_Minh)
RUN apk add --no-cache curl tzdata

COPY --chmod=755 backup.sh entrypoint.sh healthcheck.sh /usr/local/bin/

ENV TZ=Asia/Ho_Chi_Minh \
    BACKUP_CRON="0 9 * * *" \
    KEEP_DAYS=30

HEALTHCHECK --interval=5m --timeout=10s --start-period=1m CMD ["healthcheck.sh"]

ENTRYPOINT ["entrypoint.sh"]
