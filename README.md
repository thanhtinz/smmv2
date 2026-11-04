# SMMv2 — SMM Panel + Shop Tài khoản Premium

Website kinh doanh 2 mảng trong **một hệ thống, một số dư**:

1. **SMM Panel** — tăng like / follow / view / comment cho Facebook, TikTok, Instagram, YouTube, Telegram, Shopee...
2. **Premium Shop** — YouTube Premium, Spotify, Netflix, ChatGPT, Canva, CapCut, Microsoft 365, Google One, ELSA...

Mỗi mảng chạy được **cả 2 hình thức song song**:

| | Tự động qua API | Thủ công |
|---|---|---|
| **SMM** | Đấu API nhà cung cấp chuẩn SMM v2 (ThaTim, slike, mọi panel tương thích): tự đồng bộ dịch vụ + giá, tự đẩy đơn, tự cập nhật trạng thái, hoàn tiền tự động khi Partial/Canceled | Admin xử lý trong hàng đợi đơn, cập nhật số bắt đầu / còn lại / trạng thái, hoàn một phần tự tính |
| **Premium** | Kho tài khoản (`AUTO_STOCK`) giao ngay khi mua; hoặc đấu **API mua sản phẩm kiểu ThaTim** (`category/buy/history`) — tự mua từ nguồn, tự lấy nội dung bàn giao | Admin giao tay / nâng cấp chính chủ theo email khách gửi |

Kèm **Admin panel riêng** tại `/admin` và **API cho đại lý** tại `/api/v2` (chuẩn SMM v2 + API sản phẩm) để khách khác đấu vào bán lại.

## Giao diện (đa theme, theo phong cách thatim)

- **Đa giao diện**: khách tự đổi **6 tông màu** (Xanh dương #4680ff kiểu thatim, Tím, Xanh lá, Cam, Hồng, Ngọc) × **Sáng/Tối** bằng nút "Giao diện" trên mọi thanh header; lựa chọn lưu trên thiết bị của khách. Admin đặt tông + chế độ mặc định cho khách mới tại **Admin → Cấu hình → Giao diện mặc định**.
- Ngôn ngữ thiết kế theo thatim.vn: nền xám xanh rất nhạt, thẻ trắng bóng mềm, sidebar mục đang chọn nền nhạt viền mảnh, nút liên hệ nổi Zalo/Telegram/Fanpage/Hotline góc phải dưới (điền link ở Admin → Cấu hình).
- Dễ dùng: trang dịch vụ có xem Bảng/Lưới, sắp xếp giá, lọc khoảng giá, ghim yêu thích; form đặt đơn có nút Dán link, chip chọn nhanh số lượng, cảnh báo link sai nền tảng và thiếu số dư; dashboard có biểu đồ chi tiêu 14 ngày, thao tác nhanh, nút Đặt lại đơn cũ.
- **Kiểu webapp**: menu footer cố định dưới màn hình điện thoại (kiểu app) ở cả trang khách, khu khách hàng và admin — nút hành động chính (Đặt đơn / Duyệt nạp) nổi tròn ở giữa, mục đang mở sáng màu; có sẵn manifest nên khách lưu ra màn hình chính là mở toàn màn hình như app thật.

## Tính năng chính

**Khách hàng**
- Đăng ký / đăng nhập, cấp bậc Thành viên → Đại lý (−5%) → Tổng đại lý (−10%) → VIP (−15%) áp tự động vào giá SMM
- Đặt đơn SMM: chọn danh mục → dịch vụ, tính tiền trực tiếp; dịch vụ comment có ô nhập nội dung từng dòng, dịch vụ cảm xúc có chọn reaction, watch time có số phút (đúng tham số kiểu ThaTim)
- **Drip-feed**: dịch vụ hỗ trợ sẽ có tuỳ chọn thả nhỏ giọt — chia tổng số lượng thành nhiều lượt cách nhau theo phút, cron thả từng lượt, huỷ chỉ hoàn phần chưa thả
- **Đặt hàng loạt**: dán danh sách `id dịch vụ | link | số lượng` (tối đa 50 dòng), xem trước từng dòng + tổng tiền rồi đặt tất cả
- **Panel con**: mở gian hàng riêng tại `/cua-hang/[slug]` hoặc tên miền riêng (CNAME) — khách của panel mua theo giá panel, chủ panel nhận hoa hồng từng đơn (hoàn tiền thì thu hồi theo tỉ lệ). Gian hàng dùng đúng khung + component của web mẹ. **Trang cấu hình lần đầu** (`/dashboard/panel-cua-toi/thiet-lap`) là wizard 5 bước: thông tin → giá & cấp bậc → **nhập API key tài khoản mẹ để liên kết** (mặc định là key của chính chủ panel, hệ thống kiểm tra key khi lưu — đúng mô hình thatim: tạo panel xong vào Cài đặt nhập API token) → tên miền & hỗ trợ → hoàn tất
- **Cấp bậc khách của panel**: 4 bậc Thành viên / Đại lý / Tổng đại lý / VIP — mỗi panel tự đặt % giảm riêng từng bậc (trừ vào hoa hồng của chủ panel) và đặt thêm được **giá cố định cho từng dịch vụ theo từng bậc** (kiểu bảng giá nhiều cột cấp bậc của thatim); chủ panel gán bậc cho từng khách ngay trong trang quản lý panel
- Shop Premium: gói kho giao ngay, gói chính chủ giao tay, bảo hành trong trang đơn
- Nạp tiền: VietQR ngân hàng + MoMo, cộng **tự động qua webhook** (SePay/Casso) khi chuyển đúng nội dung `SMM <mã nạp>`; thưởng nạp theo mốc cấu hình được
- Sổ giao dịch đầy đủ, ticket hỗ trợ 2 chiều, trang API key cho đại lý

**Admin (`/admin`)**
- Tổng quan: doanh thu / lợi nhuận hôm nay + tháng, biểu đồ 14 ngày, cảnh báo số dư nhà cung cấp sắp hết
- Đơn SMM (lọc API/thủ công/trạng thái), xử lý tay, huỷ + hoàn tiền, đồng bộ trạng thái từ provider từng đơn
- Đơn Premium: giao tay, bảo hành, huỷ + hoàn, đồng bộ bàn giao từ nhà cung cấp
- Nạp tiền: duyệt tay, cộng tiền tay, lịch sử webhook tự động
- Dịch vụ SMM: CRUD danh mục/dịch vụ, chọn nguồn API hoặc thủ công cho từng dịch vụ
- **Nhà cung cấp API**: thêm/sửa, kiểm tra số dư, **đồng bộ dịch vụ SMM và sản phẩm Premium** (cộng markup %), preset sẵn cho **ThaTim**
- Sản phẩm Premium + gói bán (giá, vốn, bảo hành, chu kỳ nhà cung cấp), Kho Premium nhập hàng loạt từng dòng
- Người dùng: cộng/trừ số dư, đổi cấp bậc, khoá tài khoản, phân quyền **2 tầng** — STAFF chỉ xem/xử lý đơn + ticket; tiền, nhà cung cấp + API key, dịch vụ + giá, sản phẩm + kho, người dùng + vai trò, cấu hình và thông báo chỉ ADMIN (link Admin Panel cũng chỉ hiện với role ADMIN)
- Panel con: danh sách gian hàng của đại lý, khoá/mở panel
- Ticket, Thông báo, Nhật ký API/webhook, Cấu hình (tên site, ngân hàng/MoMo, mốc thưởng nạp, bảo trì...)

## Công nghệ

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Prisma ORM + MySQL/MariaDB (đổi sang Postgres chỉ cần sửa `provider` trong `prisma/schema.prisma`). Toàn bộ tiền tệ lưu VND dạng số nguyên; mọi biến động số dư đi qua một hàm ghi sổ duy nhất trong transaction.

## Chạy local / trên VPS

```bash
# 1. Tạo database MySQL/MariaDB tên smmv2
# 2. Cấu hình môi trường
cp .env.example .env   # sửa DATABASE_URL, AUTH_SECRET, CRON_SECRET

npm install
npm run db:setup       # tạo bảng + seed dữ liệu mẫu
npm run build
npm start              # http://localhost:3000
```

Tài khoản seed:

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin` | `Admin@123` | ADMIN — **đổi ngay sau khi đăng nhập** (Hồ sơ ở /dashboard/ho-so hoặc trang người dùng) |
| `demo` | `Demo@123` | Khách demo, số dư sẵn 500.000đ, cấp Đại lý |

Seed gồm: 18 dịch vụ SMM thủ công mẫu, 9 sản phẩm Premium với giá/vốn theo khảo sát thị trường VN (YouTube/Spotify Family tự làm, Netflix kho mẫu...), và **nguồn ThaTim ở trạng thái tắt** chờ dán API key thật.

## Đấu nguồn ThaTim (và các panel tương tự)

1. Đăng ký tài khoản tại thatim.vn, nạp tiền, lấy **API key** trong mục API của họ.
2. Vào **Admin → Nhà cung cấp API → Thêm nguồn ThaTim** (preset sẵn URL `https://thatim.vn/api/v2`, loại "Cả SMM + Premium"), dán key, bật, lưu.
3. Bấm **Kiểm tra số dư** rồi **Đồng bộ dịch vụ**: hệ thống kéo toàn bộ dịch vụ social (`action=services`) và sản phẩm (`action=category`), quy đổi tiền và cộng markup % bạn đặt.
4. Từ đó: khách đặt đơn dịch vụ API → hệ thống tự `action=add` (kèm `comments`/`reaction`/`minutes` khi có); khách mua sản phẩm API → tự `action=buy` với `cycle` + `note`; cron tự hỏi `status`/`history` và bàn giao + hoàn tiền khi cần.
   - Đã đối chiếu tài liệu thật của thatim.vn (2026-11-04): API sản phẩm nằm ở endpoint riêng **`https://thatim.vn/api/product`** (hệ thống tự suy ra từ URL `/api/v2` khi đồng bộ/mua); `services` của thatim trả về dạng lồng theo danh mục kèm trường `price` — đã hỗ trợ; `category` trả `time_data` với nhãn chu kỳ ("1 Tháng", "1 Năm", cả "… Ngày") — nhãn được quy về số tháng khi gọi `buy`; trạng thái/bàn giao đơn premium lấy qua `history` (lọc `product_id`, khớp `order_code`), **dữ liệu bàn giao nằm ở trường `data`** của mục history khi đơn `completed`.

Không có key ThaTim? Mọi panel chuẩn SMM API v2 khác (slike...) đều đấu được theo cùng cách.

## Việc định kỳ (cron) — bắt buộc để đơn API tự chạy

```bash
*/5 * * * * curl -s "https://your-domain.vn/api/cron/sync?secret=<CRON_SECRET>&services=1"
```

Cron này: **thả các lượt drip-feed đến hạn**, đồng bộ trạng thái đơn SMM đang chạy (hoàn tiền Partial/Canceled), lấy bàn giao đơn Premium API, và (khi `services=1`) đồng bộ lại giá/dịch vụ + số dư từ mọi nhà cung cấp đang bật.

Trên Vercel: dùng `vercel.json` đã kèm sẵn (cron 10 phút) và đặt env `CRON_SECRET` — Vercel tự gửi `Authorization: Bearer <CRON_SECRET>` khi chạy cron, endpoint đã hỗ trợ cả 3 cách xác thực (`?secret=`, header `x-cron-secret`, Bearer). Database dùng MySQL ngoài (VPS MySQL, Aiven, PlanetScale...) vì Vercel không chứa MySQL.

## Webhook cộng tiền tự động

- URL: `POST https://your-domain.vn/api/webhooks/sepay`
- Header: `Authorization: Apikey <SEPAY_WEBHOOK_SECRET>` (đặt trong `.env`)
- Nhận diện khách bằng mã nạp trong nội dung chuyển khoản; chống cộng trùng theo mã giao dịch ngân hàng. Tương thích SePay và mọi cổng bắn JSON có `content`, `transferAmount`, `transferType=in`, `id`.

## Kiểm thử đấu API

Repo kèm mock panel kiểu ThaTim + script test toàn luồng (đồng bộ, đặt đơn kèm comments, refill, mua sản phẩm, lấy bàn giao, đối soát số dư):

```bash
python3 scripts/mock-provider.py &   # mock chạy ở 127.0.0.1:3999
npx tsx scripts/test-provider.ts
```

## Cấu trúc thư mục

```
prisma/schema.prisma     Toàn bộ mô hình dữ liệu
prisma/seed.ts           Dữ liệu mẫu (dịch vụ, premium, admin, nguồn ThaTim tắt)
src/lib/provider.ts      Client đấu API nguồn (SMM v2 + Product API kiểu ThaTim)
src/lib/orders.ts        Máy đặt đơn / hoàn tiền / đồng bộ trạng thái 2 mảng
src/lib/wallet.ts        Ghi sổ số dư (mọi biến động đều qua đây)
src/app/api/v2           API cho đại lý (services/balance/add/status/orders/cancel/refill + category/buy/history)
src/app/api/webhooks     Webhook nạp tiền tự động
src/app/api/cron         Cron đồng bộ
src/app/dashboard        Khu khách hàng
src/app/admin            Admin panel riêng
```
