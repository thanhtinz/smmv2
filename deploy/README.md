# SMMv2 — Bộ cài VPS một lệnh

Bộ này cài toàn bộ SMMv2 lên một VPS trống: Node.js 20, PostgreSQL, Caddy
(HTTPS tự động), systemd, cron đồng bộ đơn hàng và sao lưu hằng ngày.

## Cần chuẩn bị

- VPS chạy **Ubuntu 22.04 hoặc 24.04**, tối thiểu **2GB RAM** (nên 4GB), quyền root.
- Một **tên miền chính** đã trỏ bản ghi **A về IP của VPS** (chờ DNS cập nhật
  trước khi cài, nếu không Caddy chưa cấp được chứng chỉ HTTPS).
- Nếu repo GitHub là private: hoặc clone sẵn bằng tài khoản của bạn (như các
  lệnh dưới đây), hoặc chuẩn bị một GitHub token để truyền `GITHUB_TOKEN`.

## Lệnh cài

```bash
git clone https://github.com/thanhtinz/smmv2.git
cd smmv2
sudo DOMAIN=tenmien.com bash deploy/install.sh
```

Script tự làm hết: tạo swap nếu máy ít RAM, cài Node/PostgreSQL/Caddy, tạo
database và tài khoản riêng, sinh khoá bí mật vào `/opt/smmv2/.env`, cài thư
viện, đồng bộ database + nạp dữ liệu khởi tạo, build, đăng ký dịch vụ tự chạy
lại khi VPS khởi động lại, mở tường lửa, cài cron:

- Đồng bộ đơn với nhà cung cấp + gia hạn website con: mỗi 10 phút.
- Sao lưu database: 03:30 hằng ngày vào `/var/backups/smmv2` (giữ 7 bản).

## Sau khi cài xong

1. Mở `https://tenmien.com/login`, đăng nhập **admin / Admin@123** và **đổi
   mật khẩu ngay**.
2. Vào **Admin → Cấu hình** nhập các thông số thật: nameserver con
   (child_ns1/child_ns2), khoá SePay, Stripe/PayPal, tỉ giá... (mọi cấu hình
   nghiệp vụ đều nằm trong admin, không nằm trong code).
3. Khách tạo website con chỉ cần trỏ bản ghi A của domain của họ về IP VPS —
   HTTPS được cấp tự động (máy chủ hỏi hệ thống qua `/api/tls-ask` trước khi
   cấp, domain lạ không thuộc hệ thống sẽ bị từ chối).

## Vận hành

| Việc | Lệnh |
|---|---|
| Cập nhật bản mới nhất | `sudo bash /opt/smmv2/deploy/update.sh` |
| Xem log ứng dụng | `journalctl -u smmv2 -f` |
| Khởi động lại | `sudo systemctl restart smmv2` |
| Sao lưu ngay | `sudo bash /opt/smmv2/deploy/backup.sh` |
| Trạng thái dịch vụ | `systemctl status smmv2 caddy postgresql` |

## Gỡ / cài lại

Dữ liệu nằm ở PostgreSQL (database `smmv2`) và file `/opt/smmv2/.env`. Muốn cài
lại sạch: xoá thư mục `/opt/smmv2`, xoá database rồi chạy lại `install.sh`.
Sao lưu ở `/var/backups/smmv2` không bị đụng khi cài lại ứng dụng.
