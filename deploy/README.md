# BNT Shop — Bộ cài VPS một lệnh

Bộ này cài toàn bộ BNT Shop lên một VPS trống: Node.js 24 LTS, PostgreSQL, Caddy
(HTTPS tự động), systemd, cron đồng bộ đơn hàng và sao lưu hằng ngày.

## Cần chuẩn bị

- VPS chạy **Ubuntu 22.04 hoặc 24.04**, tối thiểu **2GB RAM** (nên 4GB), quyền root.
- Một **tên miền chính** đã trỏ bản ghi **A về IP của VPS** (chờ DNS cập nhật
  trước khi cài, nếu không Caddy chưa cấp được chứng chỉ HTTPS).
- Nếu repo GitHub là private: hoặc clone sẵn bằng tài khoản của bạn (như các
  lệnh dưới đây), hoặc chuẩn bị một GitHub token để truyền `GITHUB_TOKEN`.

## Lệnh cài

```bash
git clone https://github.com/thanhtinz/bntshop.git
cd bntshop
sudo DOMAIN=tenmien.com bash deploy/install.sh
```

Script tự làm hết: tạo swap nếu máy ít RAM, cài Node/PostgreSQL/Caddy, tạo
database và tài khoản riêng, sinh khoá bí mật vào `/opt/smmv2/.env`, cài thư
viện, đồng bộ database + nạp dữ liệu khởi tạo, build, đăng ký dịch vụ tự chạy
lại khi VPS khởi động lại, mở tường lửa, cài cron:

- Đồng bộ đơn với nhà cung cấp: mỗi 10 phút.
- Sao lưu database: 03:30 hằng ngày vào `/var/backups/smmv2` (giữ 7 bản).

## Sau khi cài xong

1. Mở `https://tenmien.com` — website tự dẫn tới **trang thiết lập lần đầu**
   (`/setup`). Tại đó bạn đặt tên website và **tạo tài khoản quản trị đầu
   tiên** (tên đăng nhập + email + mật khẩu do bạn tự chọn), xong được đăng
   nhập thẳng vào khu quản trị. Bản cài **không tạo sẵn tài khoản mẫu hay
   mật khẩu mặc định nào**; trang /setup tự khoá ngay khi tài khoản đầu
   tiên tồn tại. Sau đó nên vào Hồ sơ → Bảo mật bật 2FA cho tài khoản
   quản trị.
2. Vào **Admin → Cấu hình** nhập các thông số thật: khoá SePay,
   Stripe/PayPal, tỉ giá... (mọi cấu hình nghiệp vụ đều nằm trong admin,
   không nằm trong code).
3. Vào **Admin → Nhà cung cấp** tự gắn khoá API thật của các nhà cung cấp
   (FZR...) — key thật chỉ gắn ở bản dựng trên VPS này, không gắn vào bản
   demo Vercel và không gửi qua chat.

## Vận hành

| Việc | Lệnh |
|---|---|
| Cập nhật bản mới nhất | `sudo bash /opt/smmv2/deploy/update.sh` |
| Xem log ứng dụng | `journalctl -u smmv2 -f` |
| Khởi động lại | `sudo systemctl restart smmv2` |
| Sao lưu ngay | `sudo bash /opt/smmv2/deploy/backup.sh` |
| Trạng thái dịch vụ | `systemctl status smmv2 caddy postgresql` |

## Gỡ / cài lại

> **Tên `smmv2` là tên kỹ thuật cũ được giữ có chủ đích** để tương thích đường nâng cấp của các bản đã cài: thư mục `/opt/smmv2`, dịch vụ systemd `smmv2`, database `smmv2` và cookie phiên `smmv2_session` KHÔNG đổi tên dù sản phẩm đã tách thành BNT Shop — đổi tên sẽ làm hỏng các bản đang chạy.

Dữ liệu nằm ở PostgreSQL (database `smmv2`) và file `/opt/smmv2/.env`. Muốn cài
lại sạch: xoá thư mục `/opt/smmv2`, xoá database rồi chạy lại `install.sh`.
Sao lưu ở `/var/backups/smmv2` không bị đụng khi cài lại ứng dụng.
