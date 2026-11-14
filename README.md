# BNT Shop — Cửa hàng sản phẩm số

Website bán sản phẩm số thuần (tách từ SMMv2 ngày 2026-11-12 — mảng SMM đã
gỡ toàn bộ): tài khoản Premium, Game Key, Gift Card, nạp game (Top-Up),
Steam, Telegram Stars/Premium và dịch vụ thủ công. Bản chạy thật:
https://bntshop.com

## Nguồn hàng

- **ThaTim** (driver STANDARD): sản phẩm Premium đấu API `category / buy /
  history` — gói bán là từng chu kỳ (cycle) của sản phẩm nguồn, chọn ở form
  Gói bán.
- **FZR.CARDS** (driver FZR): 8 nhóm — gamekeys, giftcards, topups, manual,
  telegram_stars, telegram_premium, steam_topup, steam_gift — đồng bộ
  catalog + tồn kho, thực thi đơn qua API, webhook + cron đối soát trạng
  thái (gồm trạng thái giao một phần PARTIAL).
- Kho tự giao (AUTO_STOCK) và giao thủ công / nâng cấp chính chủ.

Phía khách không bao giờ hiện tên/loại nguồn hàng — nhãn giao hàng trung
tính: “Giao tự động” / “Giao ngay” / “Nâng cấp chính chủ”. Thông tin đấu
nguồn chỉ hiện trong admin.

## Thanh toán

- Ví nội bộ: nạp qua VietQR/SePay (tự cộng khi chuyển đúng nội dung),
  BoltUtil, Stripe, PayPal.
- Thanh toán trực tiếp cho giỏ hàng (PurchasePayment): phiên có trạng thái
  PROCESSING + phục hồi an toàn khi tiến trình chết giữa chừng.
- Mã giảm giá, Flash Sale, thẻ thành viên **Pass** (giảm giá + hoàn tiền
  theo gói), hoa hồng giới thiệu bạn bè.

## Khu vực hệ thống

- **Admin** tại `/admin` (phân quyền 2 tầng ADMIN / STAFF) + các subdomain
  suy từ domain đã cấu hình: `api.` (API v2 cho đối tác), `admin.`,
  `webhook.` (đầu nhận webhook nhà cung cấp/thanh toán).
- **API cho BNT AI Company** tại `/api/ai/*` — bắt buộc header
  `x-bnt-ai-token` khớp biến môi trường `AI_SERVICE_TOKEN` (thiếu biến =
  khoá hẳn).
- Mọi cấu hình nghiệp vụ nằm trong Admin → Cấu hình và lưu vào database
  (tên web, liên kết web, SEO, mô-đun bật/tắt, nhà cung cấp, tỉ giá...).

## Công nghệ

Next.js 14 (App Router) + TypeScript + Tailwind, Prisma + PostgreSQL.
Tiền tệ: số nguyên VND.

## Chạy local

```bash
cp .env.example .env   # điền DATABASE_URL, AUTH_SECRET, CRON_SECRET...
npm install
npx prisma db push
npm run db:seed        # chỉ dùng cho dev/test (admin mẫu Admin@123)
npm run build && npm start
```

`docker-compose.yml` chỉ phục vụ chạy thử local: mọi khoá bí mật phải
truyền qua biến môi trường, không có giá trị mặc định.

## Triển khai VPS

Xem `deploy/README.md` — bộ cài một lệnh (Node.js + PostgreSQL + Caddy +
systemd), lần đầu mở web qua trang `/setup` để tạo tài khoản admin đầu
tiên, trang này tự khoá sau khi hoàn tất.
