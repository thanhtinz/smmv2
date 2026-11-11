#!/usr/bin/env bash
# ============================================================
#  SMMv2 — Bộ cài MỘT LỆNH trên VPS Ubuntu 22.04 / 24.04
#
#  Cách chạy (trên VPS, quyền root):
#    git clone https://github.com/thanhtinz/smmv2.git
#    cd smmv2
#    sudo DOMAIN=tenmien.com bash deploy/install.sh
#
#  Biến môi trường tuỳ chọn:
#    DOMAIN        (bắt buộc) tên miền chính, đã trỏ A về IP của VPS này
#    GITHUB_TOKEN  token GitHub nếu repo là private và máy chưa clone sẵn
#    REPO          mặc định https://github.com/thanhtinz/smmv2.git
#
#  Script làm hết: swap, Node 20, PostgreSQL, Caddy (HTTPS tự động),
#  systemd, cron đồng bộ đơn + sao lưu hằng ngày.
# ============================================================
set -euo pipefail

APP_DIR=/opt/smmv2
APP_USER=smmv2
REPO="${REPO:-https://github.com/thanhtinz/smmv2.git}"
DOMAIN="${DOMAIN:-}"

step() { echo; echo "==> $*"; }

if [ "$(id -u)" != "0" ]; then
  echo "Hãy chạy bằng root: sudo DOMAIN=tenmien.com bash deploy/install.sh" >&2
  exit 1
fi
if [ -z "$DOMAIN" ]; then
  echo "Thiếu DOMAIN. Ví dụ: sudo DOMAIN=shopcuaban.com bash deploy/install.sh" >&2
  exit 1
fi
if ! grep -Eq "Ubuntu (22|24)\." /etc/os-release 2>/dev/null; then
  echo "Cảnh báo: script viết cho Ubuntu 22.04/24.04 — hệ hiện tại: $(grep PRETTY_NAME /etc/os-release 2>/dev/null || echo 'không rõ'). Vẫn tiếp tục sau 5 giây (Ctrl+C để dừng)..."
  sleep 5
fi

# ---------- 1. Swap 2GB nếu máy ít RAM ----------
step "Kiểm tra RAM / swap"
if [ -z "$(swapon --show 2>/dev/null)" ] && [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 4096 ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q "/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
  echo "Đã tạo swap 2GB (build Next.js trên VPS nhỏ rất cần)."
fi

# ---------- 2. Gói hệ thống ----------
step "Cài gói nền (curl, git, ufw...)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg ufw openssl > /dev/null

# ---------- 3. Node.js 20 LTS ----------
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  step "Cài Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null
fi
echo "Node: $(node -v) · npm: $(npm -v)"

# ---------- 4. PostgreSQL ----------
step "Cài PostgreSQL + tạo database"
apt-get install -y -qq postgresql > /dev/null
systemctl enable --now postgresql
DB_PASS="$(openssl rand -hex 18)"
if su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='smmv2'\"" | grep -q 1; then
  su postgres -c "psql -c \"ALTER USER smmv2 WITH PASSWORD '$DB_PASS'\"" > /dev/null
else
  su postgres -c "psql -c \"CREATE USER smmv2 WITH PASSWORD '$DB_PASS'\"" > /dev/null
fi
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='smmv2'\"" | grep -q 1 \
  || su postgres -c "createdb -O smmv2 smmv2"

# ---------- 5. Caddy ----------
if ! command -v caddy >/dev/null; then
  step "Cài Caddy (HTTPS tự động)"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https > /dev/null
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy > /dev/null
fi

# ---------- 6. Mã nguồn ----------
step "Chuẩn bị mã nguồn ở $APP_DIR"
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
SRC_DIR=""
if [ -f "./prisma/schema.prisma" ] && [ -f "./package.json" ]; then
  SRC_DIR="$(pwd)"   # đang chạy từ bản clone sẵn
fi
mkdir -p "$APP_DIR"
if [ -n "$SRC_DIR" ] && [ "$SRC_DIR" != "$APP_DIR" ]; then
  cp -a "$SRC_DIR/." "$APP_DIR/"
elif [ ! -f "$APP_DIR/package.json" ]; then
  CLONE_URL="$REPO"
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    CLONE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/thanhtinz/smmv2.git"
  fi
  sudo -u "$APP_USER" -H git clone "$CLONE_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---------- 7. Biến môi trường ----------
step "Tạo .env"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<EOF
DATABASE_URL="postgresql://smmv2:${DB_PASS}@localhost:5432/smmv2"
APP_ENC_KEY="$(openssl rand -base64 32)"
AUTH_SECRET="$(openssl rand -hex 48)"
CRON_SECRET="$(openssl rand -hex 32)"
NEXT_PUBLIC_SITE_URL="https://${DOMAIN}"
MAIN_HOST="${DOMAIN}"
NEXT_PUBLIC_MAIN_HOST="${DOMAIN}"
EOF
  chmod 600 "$APP_DIR/.env"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
else
  echo ".env đã có sẵn — giữ nguyên."
fi
CRON_SECRET="$(grep -E '^CRON_SECRET=' "$APP_DIR/.env" | cut -d'"' -f2)"

# ---------- 8. Cài thư viện + dựng cấu trúc DB + build ----------
step "npm install (tải thư viện — vài phút)"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && npm install --no-audit --no-fund"
step "Đồng bộ database + nạp dữ liệu khởi tạo"
ADMIN_PW_FILE=/root/smmv2-admin-password.txt
if [ ! -f "$ADMIN_PW_FILE" ]; then
  openssl rand -base64 12 | tr -d '/+=' | head -c 14 > "$ADMIN_PW_FILE"
  chmod 600 "$ADMIN_PW_FILE"
fi
ADMIN_PASSWORD="$(cat "$ADMIN_PW_FILE")"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && npx prisma db push && ADMIN_PASSWORD='$ADMIN_PASSWORD' SEED_DEMO=0 npm run db:seed"
step "Build ứng dụng"
sudo -u "$APP_USER" -H bash -c "cd $APP_DIR && npm run build"

# ---------- 9. systemd ----------
step "Đăng ký dịch vụ systemd"
sed "s|/opt/smmv2|$APP_DIR|g" "$APP_DIR/deploy/smmv2.service" > /etc/systemd/system/smmv2.service
systemctl daemon-reload
systemctl enable smmv2
systemctl restart smmv2

# ---------- 10. Caddy ----------
step "Cấu hình Caddy cho $DOMAIN"
sed "s|__DOMAIN__|$DOMAIN|g" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile || true
systemctl enable caddy
systemctl restart caddy

# ---------- 11. Cron: đồng bộ đơn mỗi 10 phút + sao lưu 03:30 ----------
step "Cài cron đồng bộ đơn + sao lưu"
cat > /etc/cron.d/smmv2 <<EOF
*/10 * * * * $APP_USER curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/sync > /dev/null 2>&1
30 3 * * * root bash $APP_DIR/deploy/backup.sh > /dev/null 2>&1
EOF
chmod 644 /etc/cron.d/smmv2

# ---------- 12. Tường lửa ----------
step "Mở tường lửa (SSH, 80, 443)"
ufw allow OpenSSH > /dev/null || ufw allow 22 > /dev/null
ufw allow 80 > /dev/null
ufw allow 443 > /dev/null
ufw --force enable > /dev/null || true

# ---------- Xong ----------
sleep 3
echo
echo "============================================================"
systemctl is-active smmv2 >/dev/null && echo "  Ứng dụng: ĐANG CHẠY" || echo "  Ứng dụng: CHƯA CHẠY — xem log: journalctl -u smmv2 -n 50"
echo "  Website:  https://$DOMAIN"
echo "  Admin:    https://$DOMAIN/login"
echo "            Tài khoản: admin — Mật khẩu: $ADMIN_PASSWORD"
echo "            (mật khẩu ngẫu nhiên, cũng lưu ở /root/smmv2-admin-password.txt)"
echo
echo "  VIỆC CẦN LÀM NGAY:"
echo "   1) Đăng nhập admin và ĐỔI MẬT KHẨU trên ngay."
echo "   2) Vào Admin → Cấu hình: nhập khoá thanh toán (SePay/Stripe/"
echo "      PayPal...), tỉ giá — như bản demo."
echo "   3) Vào Admin → Nhà cung cấp: tự gắn khoá API thật của các nhà"
echo "      cung cấp (FZR...) — key chỉ gắn ở bản thật này, không gửi qua chat."
echo
echo "  Lệnh hay dùng:"
echo "   - Cập nhật bản mới:  sudo bash $APP_DIR/deploy/update.sh"
echo "   - Xem log:           journalctl -u smmv2 -f"
echo "   - Sao lưu ngay:      sudo bash $APP_DIR/deploy/backup.sh"
echo "============================================================"
