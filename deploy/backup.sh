#!/usr/bin/env bash
# SMMv2 — Sao lưu database PostgreSQL vào /var/backups/smmv2, giữ 7 bản gần nhất.
# Cron tự chạy 03:30 mỗi ngày (cài bởi install.sh); chạy tay: sudo bash deploy/backup.sh
set -euo pipefail
DIR=/var/backups/smmv2
mkdir -p "$DIR"
FILE="$DIR/db-$(date +%Y%m%d-%H%M).sql.gz"
su postgres -c "pg_dump smmv2" | gzip > "$FILE"
ls -1t "$DIR"/db-*.sql.gz | tail -n +8 | xargs -r rm -f
echo "Đã sao lưu: $FILE"
