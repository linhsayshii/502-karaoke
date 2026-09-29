#!/bin/sh
# Sao lưu database vào /backups/karaoke_<ngày>_<giờ>.sql.gz (định dạng giống
# scripts/backup.sh, khôi phục theo DEPLOYMENT.md mục 5.2), rồi tải lên WebDAV
# nếu có WEBDAV_URL. Xoá bản cũ hơn KEEP_DAYS ngày ở /backups và hơn
# WEBDAV_KEEP_DAYS ngày trên WebDAV (0 = giữ mãi).
#
#   backup.sh           sao lưu ngay (crond gọi theo BACKUP_CRON)
#   backup.sh --check   chỉ kiểm tra kết nối database và WebDAV
set -eu
set -o pipefail

# Biến môi trường khi chạy từ crond (xem entrypoint.sh).
if [ -r /run/backup.env ]; then . /run/backup.env; fi

DIR=/backups
STATUS="$DIR/.backup-status"
KEEP_DAYS="${KEEP_DAYS:-30}"
WEBDAV_URL="${WEBDAV_URL:-}"
WEBDAV_USERNAME="${WEBDAV_USERNAME:-}"
WEBDAV_PASSWORD="${WEBDAV_PASSWORD:-}"
WEBDAV_KEEP_DAYS="${WEBDAV_KEEP_DAYS:-$KEEP_DAYS}"
# Chỉ đụng tới các file đúng mẫu tên này, không bao giờ xoá file khác.
PATTERN='karaoke_[0-9]\{8\}_[0-9]\{6\}\.sql\.gz'

log() { echo "$(date '+%F %T') $*"; }
fail() {
  log "LỖI: $*" >&2
  [ "$MODE" = check ] || echo "fail $(date +%s) $*" > "$STATUS" 2>/dev/null || true
  exit 1
}

MODE=backup
[ "${1:-}" = --check ] && MODE=check

for n in "$KEEP_DAYS" "$WEBDAV_KEEP_DAYS"; do
  case "$n" in '' | *[!0-9]*) fail "KEEP_DAYS / WEBDAV_KEEP_DAYS phải là số ngày (0 = giữ mãi), đang là '$n'" ;; esac
done

# ---- WebDAV ---------------------------------------------------------------

BASE="${WEBDAV_URL%/}/"
TMP_BODY=$(mktemp)
trap 'rm -f "$TMP_BODY"' EXIT

# curl với tài khoản WebDAV. Mật khẩu đi qua stdin (-K -) để không lộ trên
# danh sách tiến trình. In ra mã HTTP (000 = không kết nối được); nội dung
# trả về nằm ở $TMP_BODY.
dav() {
  {
    if [ -n "$WEBDAV_USERNAME" ]; then
      printf 'user = "%s"\n' "$(printf '%s:%s' "$WEBDAV_USERNAME" "$WEBDAV_PASSWORD" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    fi
  } | curl -K - --silent --show-error --connect-timeout 30 --retry 3 --retry-delay 10 \
    --output "$TMP_BODY" --write-out '%{http_code}' "$@" || true
}

explain() {
  case "$1" in
    000) echo "không kết nối được tới WebDAV (sai WEBDAV_URL, máy chủ tắt hoặc lỗi mạng/SSL)" ;;
    401) echo "sai WEBDAV_USERNAME hoặc WEBDAV_PASSWORD (HTTP 401)" ;;
    403) echo "tài khoản WebDAV không có quyền ghi thư mục này (HTTP 403)" ;;
    404) echo "không tìm thấy đường dẫn trên WebDAV (HTTP 404)" ;;
    409) echo "thư mục cha của WEBDAV_URL chưa tồn tại (HTTP 409)" ;;
    507) echo "WebDAV hết dung lượng (HTTP 507)" ;;
    *) echo "WebDAV trả về HTTP $1" ;;
  esac
}

# Thư mục WEBDAV_URL phải tồn tại; tạo nó (chỉ cấp cuối) nếu chưa có.
ensure_folder() {
  code=$(dav --request PROPFIND --header 'Depth: 0' "$BASE")
  case "$code" in
    207) return 0 ;;
    404)
      code=$(dav --request MKCOL "$BASE")
      case "$code" in
        201) log "Đã tạo thư mục WebDAV $BASE" ;;
        405) ;; # đã có (lần thử trước tạo xong nhưng không nhận được trả lời)
        *) fail "không tạo được thư mục $BASE: $(explain "$code")" ;;
      esac
      ;;
    *) fail "không mở được thư mục $BASE: $(explain "$code")" ;;
  esac
}

# Kích thước (byte) của một file trên WebDAV, theo DAV:getcontentlength.
remote_size() {
  code=$(dav --request PROPFIND --header 'Depth: 0' --header 'Content-Type: application/xml' \
    --data '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/></d:prop></d:propfind>' \
    "$1")
  [ "$code" = 207 ] || return 1
  tr -d '\r\n' < "$TMP_BODY" | grep -o 'getcontentlength[^>]*>[[:space:]]*[0-9][0-9]*' | grep -o '[0-9][0-9]*$' | head -n 1
}

upload() {
  file="$1"
  name=$(basename "$file")
  size=$(wc -c < "$file" | tr -d ' ')
  ensure_folder
  code=$(dav --upload-file "$file" --max-time 3600 "$BASE$name")
  case "$code" in
    200 | 201 | 204) ;;
    *) fail "tải $name lên WebDAV thất bại: $(explain "$code")" ;;
  esac
  remote=$(remote_size "$BASE$name" || true)
  if [ "$remote" != "$size" ]; then
    dav --request DELETE "$BASE$name" > /dev/null
    fail "file $name trên WebDAV có $remote byte, khác bản gốc $size byte; đã xoá bản lỗi"
  fi
  log "Đã tải lên WebDAV: $BASE$name ($size byte)"
}

# Xoá trên WebDAV các bản sao lưu cũ hơn WEBDAV_KEEP_DAYS ngày (theo ngày trong tên file).
prune_remote() {
  [ "$WEBDAV_KEEP_DAYS" -gt 0 ] || return 0
  cutoff=$(date -d "@$(( $(date +%s) - WEBDAV_KEEP_DAYS * 86400 ))" +%Y%m%d)
  code=$(dav --request PROPFIND --header 'Depth: 1' --header 'Content-Type: application/xml' \
    --data '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>' \
    "$BASE")
  if [ "$code" != 207 ]; then
    log "Cảnh báo: không đọc được danh sách file WebDAV để dọn bản cũ: $(explain "$code")"
    return 0
  fi
  # Tên file ở cuối mỗi <href> (href kết thúc ngay trước '<'): file tên khác
  # như karaoke_..._.sql.gz.bak không khớp.
  for old in $(grep -o "$PATTERN<" "$TMP_BODY" | tr -d '<' | sort -u || true); do
    day=$(echo "$old" | cut -c9-16)
    [ "$day" -lt "$cutoff" ] || continue
    code=$(dav --request DELETE "$BASE$old")
    case "$code" in
      200 | 204) log "Đã xoá bản cũ trên WebDAV: $old" ;;
      404) ;; # đã bị xoá từ trước
      *) log "Cảnh báo: không xoá được $old trên WebDAV: $(explain "$code")" ;;
    esac
  done
}

# ---- kiểm tra ---------------------------------------------------------------

if [ "$MODE" = check ]; then
  pg_isready --quiet --timeout=10 || fail "không kết nối được database ($PGHOST)"
  psql --no-psqlrc --quiet --tuples-only --command 'SELECT 1' > /dev/null || fail "không đăng nhập được database"
  log "Database: kết nối được."
  [ -w "$DIR" ] || fail "không ghi được vào thư mục $DIR"
  if [ -n "$WEBDAV_URL" ]; then
    ensure_folder
    log "WebDAV: kết nối và ghi được vào $BASE"
  else
    log "Cảnh báo: chưa đặt WEBDAV_URL, chỉ sao lưu vào thư mục backups/ trên máy chủ."
  fi
  exit 0
fi

# ---- sao lưu ----------------------------------------------------------------

# Hai lần chạy chồng nhau (cron + chạy tay) thì lần sau dừng.
exec 9> /tmp/backup.lock
flock -n 9 || fail "một lần sao lưu khác đang chạy"

mkdir -p "$DIR"
file="$DIR/karaoke_$(date +%Y%m%d_%H%M%S).sql.gz"
# Không bao giờ ghi đè một bản đã có (hai lần chạy trong cùng một giây).
while [ -e "$file" ]; do
  sleep 1
  file="$DIR/karaoke_$(date +%Y%m%d_%H%M%S).sql.gz"
done

# Ghi ra file tạm, kiểm tra gzip, rồi mới đổi tên: không bao giờ để lại bản hỏng.
if ! pg_dump --no-owner | gzip > "$file.tmp"; then
  rm -f "$file.tmp"
  fail "pg_dump thất bại"
fi
if ! gzip -t "$file.tmp"; then
  rm -f "$file.tmp"
  fail "file nén bị lỗi"
fi
mv "$file.tmp" "$file"
# Cùng chủ sở hữu với thư mục backups/, để scripts/backup.sh chạy trên máy
# chủ (không phải root) vẫn xoá được bản cũ.
chown "$(stat -c %u:%g "$DIR")" "$file" 2> /dev/null || true
log "Đã sao lưu: $file ($(du -h "$file" | cut -f1))"

if [ "$KEEP_DAYS" -gt 0 ]; then
  find "$DIR" -maxdepth 1 -name 'karaoke_*.sql.gz' -mtime "+$KEEP_DAYS" -exec rm -f {} \; || true
fi

if [ -n "$WEBDAV_URL" ]; then
  upload "$file"
  prune_remote
fi

echo "ok $(date +%s)" > "$STATUS"
