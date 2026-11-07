# RÀ SOÁT HARDCODE CẤU HÌNH NGHIỆP VỤ — SMMv2

Ngày rà soát: 2026-11-06 · Phạm vi: `src/` + `prisma/seed.ts` · Phương pháp: grep toàn bộ mẫu số tiền/%/giới hạn/thời hạn/fallback + đọc tay các file nghiệp vụ lõi (settings, wallet, orders, payments, panel-billing, promo, security, cron, actions).

**Luật đối chiếu:** mọi cấu hình nghiệp vụ phải sửa được ở Admin và lưu DB (bảng `Setting` hoặc field của `ChildPanel`). Ngoại lệ không tính: `AUTH_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `MAIN_HOST`, hằng kỹ thuật thuần (phân trang, regex, enum, cổng, batch cron).

**Đã cấu hình hoá đúng (không liệt kê lại):** panel_fee, usdt_rate/usd_rate (key), sepay secret, cron secret, intl_min_usd, premium_max_qty, order_max_links, session_days, panel_default_markup, giảm giá cấp bậc (key `level_discount_*`), deposit_bonus_tiers (key), deposit_min (key), child_ns1/child_ns2, landing template, auth style, home modal/banner, mật khẩu & brute-force & đăng ký (nhóm `pw_*`/`bf_*`/`reg_*`), module on/off, tỉ giá hiển thị (nhóm `rate_*`), affiliate_percent (key), phí/giới hạn theo từng Provider và từng dịch vụ (field DB), mã giảm giá (bảng DiscountCode), mốc thưởng riêng từng panel (field ChildPanel).

---

## MỨC CAO (3 mục)

### C1. Mật khẩu mặc định của tài khoản admin + demo trong seed
- **Vị trí:** `prisma/seed.ts:28` (`bcrypt.hash("Admin@123")`), `prisma/seed.ts:44` (`bcrypt.hash("Demo@123")`); kèm email `admin@smmv2.local` / `demo@smmv2.local` (dòng 25, 41) và tài khoản admin được gán sẵn `level: "VIP"`.
- **Vấn đề:** bản cài production chạy seed là có ngay tài khoản quản trị với mật khẩu công khai trong mã nguồn (ai đọc repo cũng biết). Đây là cấu hình "tài khoản ban đầu" bị hardcode nguy hiểm nhất repo.
- **Nên đưa vào:** biến môi trường lần cài đầu (`SEED_ADMIN_PASSWORD`) hoặc cơ chế tạo admin ở lần chạy đầu/ép đổi mật khẩu ở lần đăng nhập đầu; ít nhất không seed tài khoản demo ở production.

### C2. Tỉ giá dự phòng (fallback) nằm rải rác và MÂU THUẪN nhau giữa các nơi
- **Vị trí:**
  - `src/app/api/display-config/route.ts:13-18` — fallback EUR `27000`, CNY `3450`, THB `720`, JPY `160`, KRW `17.5` — **lệch hẳn** với mặc định trong `DEFAULT_SETTINGS` (`src/lib/settings.ts:162-167`: EUR `27500`, CNY `3500`, THB `730`, JPY `165`, KRW `18`).
  - `src/lib/payments.ts:28` — `usd_rate` fallback `25000` (trùng DEFAULT_SETTINGS, nhưng vẫn là literal thứ hai).
  - `src/app/actions/user.ts:688` và `src/app/dashboard/nap-tien/page.tsx:39,57` — chuỗi fallback tỉ giá USDT kết thúc bằng literal `"25400"` (bằng mặc định của `rate_usd`, **khác** mặc định `usd_rate` là 25000).
  - `src/components/deposit-card.tsx:27` — `intl?.rate || 25000`.
  - Liên quan: key `usdt_rate` được lưu qua Admin (`src/app/actions/admin.ts:554,594`) nhưng **không có mặt trong `DEFAULT_SETTINGS`** — không có nguồn mặc định duy nhất, mỗi nơi tự chế một số.
- **Vấn đề:** khi giá trị trong DB trống/không đọc được, các phần khác nhau của hệ thống (hiển thị tỉ giá, tính tiền nạp thẻ, quy đổi USDT) dùng **các tỉ giá khác nhau** — rủi ro tiền bạc thật.
- **Nên đưa vào:** giữ đúng một nguồn mặc định là `DEFAULT_SETTINGS`; mọi nơi chỉ đọc qua `getSettings()`, xoá toàn bộ literal tỉ giá ở các tầng dưới; bổ sung `usdt_rate` vào `DEFAULT_SETTINGS`.

### C3. Số USDT nạp tối thiểu = 5 USDT hardcode ở cả action lẫn giao diện
- **Vị trí:** `src/app/actions/user.ts:686` (`if (!usdt || usdt < 5)` — thông báo "Số USDT tối thiểu là 5"), `src/components/deposit-card.tsx:111` (chữ tĩnh "Tối thiểu 5 USDT" trên trang nạp).
- **Vấn đề:** đây là quy tắc tiền (mốc nạp tối thiểu của kênh USDT) nhưng không gắn với bất kỳ Setting/field nào; `intl_min_usd` hiện chỉ áp cho PayPal/Stripe. Admin đổi mốc nạp quốc tế thì kênh USDT vẫn giữ 5.
- **Nên đưa vào:** Setting key mới `usdt_min` (và trang nạp đọc từ cấu hình thay vì chữ tĩnh), hoặc gộp dùng chung `intl_min_usd` nếu chủ đích nghiệp vụ là một mốc chung.

---

## MỨC TRUNG (6 mục)

### T1. Kỳ hạn website con "30 ngày" hardcode ở 5 nơi
- **Vị trí:** `src/lib/panel-billing.ts:47`, `src/app/actions/user.ts:201`, `src/app/actions/user.ts:240`, `src/app/actions/user.ts:304`, `src/app/actions/user.ts:336` — tất cả `30 * 86400000`.
- **Vấn đề:** phí tháng đã cấu hình hoá (panel_fee) nhưng **độ dài kỳ** thì không; muốn đổi sang kỳ 7 ngày/90 ngày phải sửa code 5 chỗ.
- **Nên đưa vào:** Setting key `panel_period_days` (mặc định 30); panel con tạo từ panel cha có thể cho field riêng sau nếu cần.

### T2. Cửa sổ gia hạn sớm 36 giờ hardcode
- **Vị trí:** `src/lib/panel-billing.ts:26` (`now + 36 * 3600000`).
- **Vấn đề:** thời điểm bắt đầu trừ tiền gia hạn trước hạn là quyết định nghiệp vụ (ảnh hưởng dòng tiền của chủ panel), không có chỗ chỉnh.
- **Nên đưa vào:** Setting key `panel_renew_horizon_hours` (mặc định 36).

### T3. Ngưỡng cảnh báo số dư nhà cung cấp: fallback 200.000đ ghi đè cả khi admin để 0
- **Vị trí:** `src/app/api/cron/sync/route.ts:71` — `p.minBalanceAlert || 200000`.
- **Vấn đề:** field `Provider.minBalanceAlert` có mặc định schema 0 và form admin mặc định 0; nhưng `|| 200000` khiến giá trị 0 (chưa đặt/không muốn cảnh báo ở mức đó) bị thay bằng 200.000đ — hành vi khác hẳn những gì admin nhìn thấy trong cấu hình.
- **Nên đưa vào:** Setting key `provider_low_balance_default` cho ngưỡng mặc định toàn cục, và chỉ dùng nó khi field của provider = 0 theo đúng nghĩa đã ghi trong giao diện; hoặc bỏ fallback, để 0 = tắt cảnh báo cho provider đó.

### T4. Tối đa 10 gói định kỳ (subscription) đang chạy cho mỗi khách
- **Vị trí:** `src/app/actions/growth.ts:28` (`if (count >= 10)` — "Tối đa 10 gói định kỳ đang chạy cùng lúc"). Kèm clamp khoảng cách chạy `intervalDays` tối đa 30 ngày ở `src/app/actions/growth.ts:20`.
- **Nên đưa vào:** Setting key `subscription_max_active` (mặc định 10); clamp interval có thể giữ như hằng kỹ thuật nhưng nên ghi chú rõ trong trang cấu hình.

### T5. Cửa sổ auto-refill hardcode: chỉ xử lý đơn xong trong 7 ngày, sau 30 phút
- **Vị trí:** `src/lib/orders.ts:740-741` (`since = now - 7 * 86400000`, `settleBefore = now - 30 * 60000`) — chính sách bảo hành tự động (đơn nào còn được tự refill) hoàn toàn do code quyết định.
- **Nên đưa vào:** Setting key `auto_refill_window_days` và `auto_refill_settle_minutes` (hoặc gộp một key), hiển thị ở trang cấu hình dịch vụ/cron.

### T6. Mốc thưởng nạp khởi tạo trong seed mâu thuẫn với mặc định của hệ thống
- **Vị trí:** `prisma/seed.ts:12-15` — seed ghi vào DB `deposit_bonus_tiers = [{from: 1.000.000, percent: 2}, {from: 5.000.000, percent: 5}]`, trong khi `DEFAULT_SETTINGS.deposit_bonus_tiers = "[]"` (`src/lib/settings.ts:48`).
- **Vấn đề:** chính sách thưởng đang chạy thật trên bản cài mới đến từ seed chứ không từ một nguồn mặc định duy nhất; người rà soát chỉ nhìn DEFAULT_SETTINGS sẽ tưởng thưởng đang tắt.
- **Nên đưa vào:** thống nhất một nơi — hoặc để seed không ghi mốc thưởng (dùng `"[]"` như DEFAULT_SETTINGS), hoặc chuyển bộ mốc mặc định vào DEFAULT_SETTINGS và bỏ khỏi seed.

---

## MỨC THẤP (14 mục)

### L1. Hoa hồng giới thiệu: literal `"6"` lặp 2 nơi ngoài DEFAULT_SETTINGS
- `src/lib/wallet.ts:58` và `src/lib/wallet.ts:72` — `parseFloat(row?.value || "6")`. Key `affiliate_percent` đã là Setting (mặc định "6" ở settings.ts:46) nhưng hai hàm này đọc thẳng bảng Setting và tự fallback 6 — đổi mặc định ở một nơi sẽ lệch.
- **Xử lý:** đọc qua `getSettings()` hoặc hằng số dùng chung.

### L2. Bảng % giảm cấp bậc dự phòng thứ hai trong code
- `src/lib/settings.ts:244` — `levelDiscountFromSettings` fallback `{ MEMBER: 0, RESELLER: 5, AGENCY: 10, VIP: 15 }` trùng với các key `level_discount_*` ở DEFAULT_SETTINGS (dòng 102-105). Chỉ kích hoạt khi giá trị DB không hợp lệ, nhưng là nguồn sự thật thứ hai.
- **Xử lý:** fallback về chính các key trong DEFAULT_SETTINGS.

### L3. Nhóm fallback bảo mật trùng mặc định + danh sách email rác đóng cứng
- `src/lib/security.ts:6` (`password_min_length || "6"`), `:32-33` (`bf_max_attempts || "10"`, `bf_lock_seconds || "300"`) — trùng DEFAULT_SETTINGS, chỉ là literal dự phòng (kèm các clamp kỹ thuật `Math.max(3, …)`, `Math.max(30, …)`).
- `src/lib/security.ts:56` — `BUILTIN_DISPOSABLE`: 10 domain email dùng-một-lần đóng cứng trong code, cộng thêm vào danh sách admin nhập (`reg_banned_domains`). Danh sách này admin không xem/tắt được từng mục.
- **Xử lý:** chấp nhận được như dữ liệu tham chiếu; nếu muốn sạch tuyệt đối, chuyển danh sách gốc vào DEFAULT_SETTINGS `reg_banned_domains`.

### L4. Hai literal dự phòng "chết" của deposit_min / premium_max_qty
- `src/app/actions/user.ts:481` — `parseInt(settings.deposit_min || "10000")`; `src/lib/orders.ts:506` — `parseInt(settings.premium_max_qty) || 50`. Vì `getSettings()` luôn trộn DEFAULT_SETTINGS nên hai literal này không bao giờ kích hoạt — nhưng vẫn là bản sao hardcode của giá trị nghiệp vụ.
- **Xử lý:** xoá literal, tin vào DEFAULT_SETTINGS.

### L5. Tạo website con: markup dự phòng `|| 20` và màu mặc định `"blue"` đóng cứng
- `src/app/actions/user.ts:240` và `:304` — `markup: (parentCfg?.panelDefaultMarkup ?? parseInt(st.panel_default_markup)) || 20` (số 20 trùng mặc định của key `panel_default_markup`); `accent: "blue"` tại cùng hai dòng (và `prisma/schema.prisma` ChildPanel `accent @default("blue")`, `markup @default(20)`).
- **Xử lý:** bỏ `|| 20`; màu mặc định panel mới có thể đưa vào Setting `panel_default_accent` nếu muốn đổi theo thương hiệu.

### L6. Giá trị mặc định khi tạo Provider / dịch vụ nhập từ nguồn
- `src/app/actions/admin.ts:141-142` — tạo provider: `exchangeRate || "1"`, `markupPercent || "30"` (trùng schema `Provider.markupPercent @default(30)`, `exchangeRate @default(1)`); `:150` — `cronSyncLimit || "50"` (trùng schema @default(50)).
- `src/lib/provider.ts:196-197` và `src/app/api/admin/provider-services/route.ts:42-43, 76-77` — dịch vụ nhập về thiếu min/max thì gán `min = 10`, `max = 100000` (trùng schema `SmmService.min @default(10)`, `max @default(100000)`).
- **Đánh giá:** các giá trị này lưu vào bản ghi DB và sửa được từng bản ghi sau đó — chỉ là *mặc định khởi tạo* bị lặp ở tầng form/code thay vì chỉ ở schema.
- **Xử lý:** để mặc định sống duy nhất ở schema Prisma.

### L7. Model AI mặc định khi admin chưa điền
- `src/lib/ai.ts:29` — model fallback `gpt-4o-mini` / `gemini-2.0-flash`; `:32, :49` — base URL mặc định của Google/OpenAI (endpoint kỹ thuật). Key `ai_model` đã là Setting/field panel, nhưng để trống thì model thật dùng lại do code chọn — nhà cung cấp đổi model mặc định là khách bị ảnh hưởng âm thầm.
- **Xử lý:** điền sẵn `ai_model` trong DEFAULT_SETTINGS để mặc định nhìn thấy được ở Admin.

### L8. Thời gian lưu trữ khi dọn dẹp = 30 ngày, đóng cứng ở 3 nơi
- `src/app/actions/admin-features.ts:188` (cleanupSystemAction), `:270` (cleanupAllAction), `src/app/actions/panel.ts:850` — cùng mốc `30 * 86400000` cho nhật ký API / thông báo đã đọc / dòng thời gian đơn.
- Kèm định nghĩa nhóm email marketing "khách mới" = đăng ký trong 30 ngày (`admin-features.ts:296`).
- **Xử lý:** Setting key `cleanup_retention_days` nếu muốn chỉnh; hiện tại chấp nhận được như chính sách kỹ thuật nhưng nên gom về một hằng số dùng chung.

### L9. Giới hạn nội dung đóng cứng rải rác
- Ảnh widget liên hệ dạng base64 tối đa ~14.000.000 ký tự: `src/app/actions/admin-features.ts:210`, `src/app/actions/panel.ts:429`.
- Sản phẩm Premium tối đa 10 ảnh: `src/app/actions/admin.ts:358`, `src/app/actions/panel.ts:900`.
- Đánh giá Premium: nội dung cắt ở 1.000 ký tự, tối thiểu 3 ký tự: `src/app/actions/user.ts:733-734`.
- Thông báo hệ thống: tiêu đề 150 / nội dung 500 ký tự: `src/lib/notify.ts:7`.
- **Đánh giá:** giới hạn kỹ thuật là chính, nhưng 10 ảnh SP và 1.000 ký tự đánh giá là thứ khách/admin chạm tới — có thể đưa vào Setting nếu muốn nới mà không sửa code.

### L10. Hằng số hiển thị mang màu sắc nghiệp vụ ở phía khách
- `src/components/premium-grid.tsx:5` — `PAGE = 12` sản phẩm mỗi lần "Tải thêm" (theo nhịp shopkey).
- `src/components/client.tsx:41, 77-79` — bậc lọc giá dịch vụ SMM đóng cứng: dưới 10.000đ / 10.000–50.000đ / trên 50.000đ.
- `src/components/client.tsx:300` — chip chọn nhanh số lượng `[500, 1000, 5000, 10000, 50000]`.
- `src/components/panel-features.tsx:278` — giá bán mặc định gợi ý `50000` khi panel tạo giá dịch vụ mới.
- **Đánh giá:** thuần hiển thị, không ảnh hưởng tiền; chỉ cần sửa code khi muốn đổi nhịp hiển thị.

### L11. Link nhà đăng ký tên miền đóng cứng trong wizard tạo panel
- `src/components/panel-wizard.tsx:24-27` — Tenten (tenten.vn), Mắt Bão (matbao.net), GoDaddy, Namecheap với URL cố định. Đây là nội dung giới thiệu cho khách, không sửa được ở Admin.
- **Xử lý:** nếu muốn tuỳ biến theo thị trường, đưa vào Setting dạng JSON/text; hiện tại giữ nguyên theo mẫu tham chiếu cũng hợp lý.

### L12. Fallback giờ báo cáo ngày `"21:00"` và cổng SMTP `"587"`
- `src/lib/report.ts:150, 160` — `report_time || "21:00"` (trùng mặc định Setting; bản panel dùng field `reportTime`).
- `src/lib/mailer.ts:15-18` — cổng SMTP fallback `"587"`.
- **Đánh giá:** giáp ranh kỹ thuật; chỉ ghi nhận để biết có literal trùng.

### L13. Cookie chọn panel ở Panel Admin sống 365 ngày
- `src/app/api/panels/select/route.ts:19` — `maxAge: 60 * 60 * 24 * 365`. Là cookie tuỳ chọn giao diện (không phải phiên đăng nhập — phiên đã có `session_days`), nhưng thời hạn 1 năm là quyết định đóng cứng.
- **Đánh giá:** thấp, giữ nguyên cũng được.

### L14. Dữ liệu mẫu trong seed (không phải cấu hình, ghi nhận để phân biệt)
- `prisma/seed.ts:47-48` — tài khoản demo có sẵn số dư 500.000đ, `totalDeposited: 500.000`, cấp RESELLER.
- Toàn bộ bảng giá catalog mẫu SMM (dòng 66-84) và Premium (dòng 116-176): giá bán/giá vốn/bảo hành của 18 dịch vụ + 9 sản phẩm — đây là **dữ liệu** ghi vào DB, sửa được từng mục ở Admin sau khi cài, không phải cấu hình chạy trong code. Chỉ cần lưu ý khi cài production: catalog mẫu sẽ xuất hiện thật nếu không xoá.

---

## ĐÃ RÀ SOÁT — LÀ HẰNG KỸ THUẬT, GIỮ NGUYÊN (không tính vào tổng)

- Batch/limit của cron và đồng bộ: `processDripfeedOrders(10)`, `processSubscriptions(20)`, `processPanelRenewals(50)` (`src/app/api/cron/sync/route.ts:29,36,43`); các `take: 100/200` khi quét đơn API (`orders.ts:388,748`, cron route:96,111); `take: 3000` tính thời gian trung bình (`avg-time.ts:28`); `take: 200` tìm dịch vụ (`finder.ts:53`); giới hạn 100 đơn/lần hỏi API v2 (`api/v2/route.ts:106,218` — tương thích chuẩn SMM API bên ngoài).
- Phân trang quản trị: PAGE_SIZE 20-50 ở các trang admin/panel-admin; trang chủ khách `take: 5/6` cho đơn gần đây/thông báo.
- Cửa sổ thống kê 7/30 ngày ở `src/lib/stats.ts:61-62` (báo cáo, không phải chính sách).
- Kiểm chữ ký webhook Stripe lệch giờ tối đa 300 giây (`payments.ts:150`) — chuẩn của Stripe.
- Timeout mạng 5-6 giây ở alerts/recaptcha; độ dài cắt chuỗi khi ghi log; regex kiểm tra domain/slug/link; BANK_BINS và mã BIN ngân hàng (`settings.ts`, `vietqr.ts`) — dữ liệu tham chiếu của VietQR.
- Clamp an toàn: session_days kẹp 1-90 ngày (`auth.ts:16`), rating kẹp 1-5 sao, % giảm cấp bậc kẹp 0-90, `qtyAdjustPercent` kẹp -90..500 (`admin.ts:106`) — các kẹp biên chống nhập liệu phá hệ thống.
- `MIN_USD = 5` ở `src/lib/payments.ts:12` chỉ là fallback cuối khi `intl_min_usd` không đọc được — key cấu hình đã tồn tại (khác với mục C3 là kênh USDT không có key nào cả).

---

## TỔNG KẾT

| Mức độ | Số mục |
|---|---|
| Cao | 3 |
| Trung | 6 |
| Thấp | 14 |
| **Tổng** | **23** |

Ưu tiên xử lý: C1 (mật khẩu seed) → C2 (tỉ giá một nguồn) → C3 + T1 + T3 (quy tắc tiền/thời hạn đang nằm ngoài cấu hình).
