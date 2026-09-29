#!/bin/sh
# Container "unhealthy" khi lần sao lưu gần nhất lỗi, hoặc đã hơn 26 giờ
# không có lần sao lưu thành công (lịch hằng ngày bị trễ/không chạy).
status=/backups/.backup-status
[ -f "$status" ] || exit 0 # chưa đến lần sao lưu đầu tiên
read -r result time _ < "$status"
[ "$result" = ok ] || exit 1
[ $(( $(date +%s) - time )) -le $(( 26 * 3600 )) ]
