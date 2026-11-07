#!/usr/bin/env bash
# SMMv2 — Cập nhật lên bản mới nhất từ GitHub main: kéo code, cài thư viện,
# đồng bộ database, build lại và khởi động lại dịch vụ. Chạy bằng root:
#   sudo bash /opt/smmv2/deploy/update.sh
set -euo pipefail
APP_DIR=/opt/smmv2
APP_USER=smmv2
cd "$APP_DIR"
echo "==> Kéo code mới nhất"
sudo -u "$APP_USER" -H git pull --ff-only
echo "==> Cài thư viện"
sudo -u "$APP_USER" -H npm install --no-audit --no-fund
echo "==> Đồng bộ database"
sudo -u "$APP_USER" -H npx prisma db push
echo "==> Build lại"
sudo -u "$APP_USER" -H npm run build
echo "==> Khởi động lại dịch vụ"
systemctl restart smmv2
sleep 2
systemctl is-active smmv2 && echo "Xong — đã cập nhật và đang chạy."
