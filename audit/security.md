# Báo cáo rà soát bảo mật SMMv2 (chỉ đọc — không sửa code)

- Ngày rà soát: 2026-11-06
- Phạm vi: `~/workspace/smmv2` (Next.js 14 + Prisma + PostgreSQL), bối cảnh sắp chạy production trên VPS sau reverse proxy Caddy (`deploy/Caddyfile`, `deploy/install.sh`).
- Phương pháp: đọc code tĩnh tại các điểm nóng (auth/phiên, render HTML, webhook/thanh toán, API công khai, cấu hình deploy). Chưa kiểm thử xâm nhập động.
- Quy ước mức độ: **Nghiêm trọng** = chiếm quyền/trộm tiền được ngay; **Cao** = khai thác thực tế với điều kiện thường gặp; **Trung** = cần điều kiện phụ hoặc tác động giới hạn; **Thấp** = rò rỉ thông tin nhỏ / phòng thủ chiều sâu.

---

## 1. Xác thực & phiên

### 1.1 [Cao] JWT có secret dự phòng hardcode — thiếu `AUTH_SECRET` là giả mạo được phiên admin
- Vị trí: `src/lib/auth.ts:8-10`
- Hiện trạng: `process.env.AUTH_SECRET || "dev-secret-can-thay-bang-chuoi-ngau-nhien-dai"` — chuỗi dự phòng nằm công khai trong mã nguồn (và trên GitHub). Nếu VPS khởi chạy thiếu/sai `.env`, toàn bộ hệ thống dùng secret ai cũng biết: tự ký JWT `{uid: <id admin>, role: "ADMIN"}` là chiếm quyền quản trị tối cao, không cần mật khẩu.
- Khắc phục: bỏ chuỗi dự phòng; khi `AUTH_SECRET` trống hoặc ngắn hơn 32 ký tự thì **từ chối khởi động** (throw ngay khi nạp module). Kiểm tra thêm trong `deploy/install.sh` sau khi sinh `.env`.

### 1.2 [Cao] Phiên JWT stateless tối đa 90 ngày — đổi mật khẩu/khoá tài khoản không huỷ được phiên đã cấp
- Vị trí: `src/lib/auth.ts:15-24` (hạn phiên theo `session_days`, trần 90 ngày), `src/app/actions/user.ts:570-580` (`changePasswordAction` chỉ thay `passwordHash`).
- Rủi ro: JWT không có cơ chế thu hồi (không `sessionVersion`/`tokenVersion`, không denylist). Phiên bị lộ (XSS mục 2, máy dùng chung, log…) vẫn sống đến hết hạn dù nạn nhân đã đổi mật khẩu. Đổi mật khẩu — biện pháp ứng cứu chuẩn — vô hiệu.
- Khắc phục: thêm cột `User.sessionVersion` (tăng khi đổi mật khẩu/khoá/đổi vai trò), nhúng vào claim và đối chiếu trong `getCurrentUser()`; hoặc rút trần phiên xuống 7–14 ngày với các thao tác tiền. Đăng xuất hiện tại (`destroySession`, `src/lib/auth.ts:36-38`) chỉ xoá cookie phía trình duyệt — đúng về mặt UI nhưng token đã sao chép vẫn hợp lệ (hệ quả của cùng vấn đề).

### 1.3 [Cao] Địa chỉ IP lấy từ `x-forwarded-for` phần tử đầu — qua mặt được chống brute-force và cấm IP
- Vị trí: `src/app/actions/auth.ts:6-9` (`clientIp()` lấy `split(",")[0]`), dùng bởi `src/lib/security.ts` (LoginThrottle khóa theo `ip|username`) và `assertNotBanned` (IpBan).
- Rủi ro: sau Caddy, `x-forwarded-for` do client gửi **không bị ghi đè** trong `deploy/Caddyfile` hiện tại — kẻ tấn công tự chèn `X-Forwarded-For: <ip giả>` và xoay IP giả mỗi lần thử: khóa brute-force (mặc định bật, 10 lần/300 giây — `src/lib/settings.ts:88`) và danh sách cấm IP đều vô hiệu, dò mật khẩu không giới hạn.
- Khắc phục: trong `deploy/Caddyfile` thêm `header_up X-Forwarded-For {remote_host}` (ghi đè, không nối chuỗi) cho cả hai site block; đồng thời ở code chỉ tin phần tử IP cuối cùng của chuỗi XFF, hoặc dùng một header riêng do proxy đặt. Bổ sung thêm khóa theo riêng `username` (không kèm IP) làm lớp hai.

### 1.4 [Trung] `getSession()` tin vai trò trong JWT, không đối chiếu DB
- Vị trí: `src/lib/auth.ts:39-49`.
- Rủi ro: `role` lấy thẳng từ payload. Các guard quan trọng (`requireAdmin`, `requireStaff`) đi qua `getCurrentUser()` (đối chiếu DB, có chặn `BANNED`) là an toàn; nhưng nơi nào dùng `getSession().role` để quyết định hiển thị/quyền sẽ giữ vai trò cũ tối đa 90 ngày sau khi bị hạ quyền. 
- Khắc phục: mọi quyết định phân quyền phải dùng `getCurrentUser()`/bản ghi DB; `getSession()` chỉ dùng cho hiển thị tên. (Gắn với 1.2: `sessionVersion` giải quyết triệt để.)

### 1.5 [Thấp] Lộ tồn tại tài khoản qua thời gian phản hồi đăng nhập
- Vị trí: `src/app/actions/auth.ts` (`loginAction`): khi không tìm thấy user thì bỏ qua `bcrypt.compare` → phản hồi nhanh hơn rõ rệt so với sai mật khẩu. Thông báo lỗi đã gộp chung "Sai tài khoản hoặc mật khẩu" (tốt), nhưng timing vẫn phân biệt được tài khoản tồn tại hay không.
- Khắc phục: chạy `bcrypt.compare` với một hash giả cố định khi user không tồn tại.

### 1.6 [Thấp] OAuth Google: `state` sinh bằng `Math.random`, cookie state thiếu cờ bảo mật
- Vị trí: `src/app/api/auth/google/route.ts` (state = `Math.random()...`; cookie `g_oauth_state` không đặt `secure`/`sameSite`). Callback có đối chiếu state với cookie (tốt).
- Khắc phục: `crypto.randomUUID()`/`randomBytes`; đặt `secure: true, sameSite: "lax"` cho cookie state.

### 1.7 [Thấp] Cookie chọn panel (`smmv2-panel`) không có `httpOnly`
- Vị trí: `src/app/api/panels/select/route.ts`. Cookie chỉ chứa id panel (độ nhạy thấp) nhưng đặt qua GET — bị chèn ảnh/link từ site ngoài cũng đổi được panel đang quản trị của nạn nhân (CSRF mức nhẹ). Cookie phiên chính (`smmv2_session`, `src/lib/auth.ts:26-32`) cấu hình đúng: `httpOnly`, `sameSite: "lax"`, `secure` khi production, `path: "/"`.
- Khắc phục: thêm `httpOnly: true` cho cookie panel; cân nhắc đổi sang POST.

**Điểm đạt (mục 1):** thông báo lỗi đăng nhập gộp chung, không phân biệt sai tài khoản/sai mật khẩu; chống brute-force có sẵn và **bật mặc định**; mật khẩu băm bcrypt cost 10; có tuỳ chọn reCAPTCHA (mặc định tắt — xem 4.1).

---

## 2. XSS

### 2.1 [Nghiêm trọng] `RichText` render HTML thô KHÔNG sanitize — chủ panel chèn được mã độc chạy trên domain web mẹ
- Vị trí: `src/components/rich-text.tsx:6` (`dangerouslySetInnerHTML` trực tiếp, không qua bộ lọc nào).
- Nguồn dữ liệu vào `RichText` gồm cả nội dung do **chủ panel** (khách trả phí tạo website con — không đáng tin như admin mẹ) soạn:
  - Mô tả / bảo hành / hướng dẫn sản phẩm của panel (`src/components/panel-premium.tsx` soạn; hiển thị tại `src/components/premium-views.tsx` và `src/components/site.tsx`).
  - Thông báo hệ thống của panel (`sysAnnounceContent`) được render ngay tại **dashboard trên domain web mẹ** cho khách của panel: `src/app/dashboard/page.tsx:42,94-96`.
  - Bài viết panel, modal trang chủ (`src/components/gates.tsx:28`) cùng cơ chế.
- Kịch bản: bất kỳ ai trả phí tạo panel cũng thành "tác giả" → nhúng `<script>`/handler vào các trường trên → mã chạy trong phiên của khách panel khi họ mở dashboard web mẹ: đọc được trang Hồ sơ chứa **API key** của nạn nhân (đánh cắp = dùng API bằng tiền của nạn nhân), thực hiện thao tác bằng phiên nạn nhân (cookie `httpOnly` không đọc trực tiếp được nhưng script gọi fetch kèm cookie vẫn chạy — session riding).
- Khắc phục: sanitize bắt buộc tại `RichText` bằng DOMPurify (allowlist thẻ/thuộc tính, cấm `script`, `on*`, `javascript:` URL) — áp cho **mọi** nguồn, kể cả admin; riêng nội dung của panel nên giới hạn thẻ chặt hơn nữa. Đây là ưu tiên sửa số 1.

### 2.2 [Cao] Chủ panel được chèn HTML/JS tuỳ ý vào `<head>`/cuối `<body>` (`customHeadHtml`/`customBodyHtml`)
- Vị trí: `src/app/actions/panel.ts:628` (lưu), `src/app/panel-admin/cau-hinh/page.tsx:424-428` (ô nhập ghi rõ "Dán mã HTML/JS"), `src/app/layout.tsx:50-58` (render thô qua `dangerouslySetInnerHTML`).
- Rủi ro: script của chủ panel chạy trên domain panel — nơi khách của panel **đăng nhập** (middleware giữ `/login` trên domain con). Chủ panel xấu có thể keylog form đăng nhập, dựng trang lừa đảo, hoặc thao tác bằng phiên khách. Đây là tính năng "chèn mã tuỳ chỉnh" theo thiết kế, nhưng trao cho đối tượng khách hàng trả tiền là quá rộng.
- Khắc phục: chỉ cho admin web mẹ dùng mã tuỳ chỉnh; với panel thì bỏ hẳn hoặc chỉ cho phép các đoạn mã theo mẫu (pixel/analytics ID) thay vì HTML/JS tự do. Nếu giữ, phải hiển thị cảnh báo rõ và chấp nhận rủi ro bằng văn bản.

### 2.3 Đạt: nội dung khách thường nhập được escape đúng
- Đánh giá sản phẩm (`r.content`), tên người dùng, nội dung ticket/bình luận đều render qua JSX text node (React escape mặc định); không thấy `dangerouslySetInnerHTML` cho các nguồn này. Chỉ còn `THEME_SCRIPT` tĩnh tại `src/app/layout.tsx:55` (hằng số trong code — an toàn).

---

## 3. Injection

### 3.1 [Thấp] `$queryRawUnsafe` với chuỗi tĩnh — không chèn được nhưng nên thay
- Vị trí: `src/app/admin/cap-nhat/page.tsx:24,31` — hai câu SQL viết cứng (`SELECT VERSION()`, tra `_prisma_migrations`), **không** chứa tham số người dùng, trang chỉ cho admin. Không khai thác được hiện tại; rủi ro nằm ở thói quen copy mẫu này sang chỗ có tham số.
- Khắc phục: đổi sang `$queryRaw` dạng template (tự tham số hoá) để làm mẫu an toàn.

### 3.2 Đạt: không tìm thấy SQL injection thực tế
- Toàn bộ truy vấn đi qua Prisma (tham số hoá); `$queryRaw` còn lại đều là `SELECT 1` kiểm tra sống (`src/app/admin/don-dep/page.tsx:16`, `src/app/panel-admin/he-thong/page.tsx:22`). Tham số sắp xếp/lọc từ người dùng đều qua danh sách cố định (vd sort của Premium là enum cứng) hoặc `parseInt` (danh sách id ở `/api/v2`), không nối chuỗi vào truy vấn/`orderBy`.

---

## 4. Rate limit / chống DDoS ở tầng ứng dụng

### 4.1 [Cao] Không có rate limit toàn cục; nhiều endpoint mở không giới hạn
- Toàn repo không có middleware/hàm giới hạn tốc độ dùng chung. Tình trạng từng điểm:
  - **Đăng nhập**: chỉ có LoginThrottle theo `ip|username` — và bị qua mặt bởi 1.3.
  - **Đăng ký**: giới hạn theo IP mặc định **tắt** (`reg_max_per_ip_hour: "0"` — `src/lib/settings.ts:94`), reCAPTCHA mặc định tắt (`src/lib/settings.ts:85-86`), honeypot là tuỳ chọn. Mở đăng ký hàng loạt bằng bot được.
  - **`/api/v2`**: không giới hạn theo key; hành động `cancel` lặp qua **toàn bộ** danh sách id không cắt (khác `orders` có `slice(0, 100)`) — `src/app/api/v2/route.ts` (nhánh `cancel`): một request kèm hàng nghìn id = hàng nghìn lần gọi provider + hoàn tiền, khuếch đại tải.
  - **`/api/chat/suggest`** (POST, không cần đăng nhập): mỗi request chạy tìm kiếm DB — spam được, tốn tài nguyên.
  - **`/api/panels/wizard-check`** (đã yêu cầu đăng nhập — tốt): dò tồn tại username/email/domain không giới hạn lần.
  - **Đặt đơn / nạp tiền (server actions)**: không có giới hạn tần suất theo tài khoản.
- Khắc phục: thêm rate limit tại middleware hoặc từng route nhạy cảm (theo IP thật sau khi sửa 1.3 + theo user/key): đăng nhập ~10/phút/IP, đăng ký ~5/giờ/IP (bật mặc định), `/api/v2` ~300/phút/key và cắt `cancel` tối đa 100 id/request, suggest ~20/phút/IP, wizard-check ~60/phút/user. Lớp ngoài: bật Cloudflare trước domain + giới hạn ở Caddy (`rate_limit` module) nếu có thể.

### 4.2 [Cao] Cron đồng bộ **fail-open**: chưa cấu hình secret là endpoint công khai
- Vị trí: `src/app/api/cron/sync/route.ts:25` — `if (secret && given !== secret)`: khi cả setting `cron_secret` lẫn env `CRON_SECRET` đều trống, điều kiện bỏ qua → **ai cũng gọi được** `GET /api/cron/sync`. Mỗi lần gọi chạy đồng bộ hàng trăm đơn, gọi provider, gia hạn panel, gửi báo cáo — gọi lặp là DoS tài nguyên + đốt quota/hạn mức nhà cung cấp. (Bản Vercel hiện có secret nên chưa hở; rủi ro nằm ở lần cài VPS mới quên đặt.) Secret còn được chấp nhận qua query `?secret=` → ghi vào access log của Caddy.
- Khắc phục: fail-closed — secret trống ⇒ trả 401/503; so sánh bằng `timingSafeEqual`; chỉ nhận qua header `Authorization`/`x-cron-secret`, bỏ query.

### 4.3 [Trung] Webhook SePay nạp toàn bộ bảng user vào RAM mỗi request
- Vị trí: `src/app/api/webhooks/sepay/route.ts:56` — `prisma.user.findMany` lấy **mọi** user để khớp mã nạp trong bộ nhớ. Số user tăng → mỗi webhook (kể cả webhook giả bị từ chối sau bước secret… thực tế sau bước secret) tốn bộ nhớ/thời gian lớn; kết hợp 4.1 là điểm nghẽn DoS.
- Khắc phục: trích mã nạp bằng regex từ nội dung rồi truy vấn `where: { depositCode }` theo index.

---

## 5. Security headers

### 5.1 [Cao] Không có bất kỳ security header nào
- Vị trí: `next.config.mjs` (chỉ có `serverActions.bodySizeLimit`), `src/middleware.ts` (không gắn header), `deploy/Caddyfile` (không gắn header).
- Thiếu toàn bộ: `Strict-Transport-Security` (site chạy HTTPS qua Caddy nhưng trình duyệt không bị ép HTTPS lâu dài), `X-Content-Type-Options: nosniff`, chống clickjacking (`X-Frame-Options`/`frame-ancestors`) — đáng ngại với web có tiền và trang admin, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`.
- Khắc phục: thêm `headers()` trong `next.config.mjs` (hoặc `header` trong Caddyfile): HSTS `max-age=31536000; includeSubDomains`, `nosniff`, `X-Frame-Options: SAMEORIGIN` (hoặc CSP `frame-ancestors 'self'`), `Referrer-Policy: strict-origin-when-cross-origin`. CSP cần làm cẩn thận vì app có script inline (`THEME_SCRIPT`) và tính năng chèn mã tuỳ chỉnh (2.2) — bắt đầu bằng `Content-Security-Policy-Report-Only` rồi siết dần.

---

## 6. Bí mật & cấu hình

### 6.1 Đạt: `.env` không bị commit
- `git ls-files` chỉ có `.env.example` (giá trị đã che); `.gitignore` có `.env`; lịch sử git không có `.env`. Không thấy API key/secret thật hardcode trong `src/` ngoài mục 1.1; không có `console.log` in mật khẩu/secret/token trong `src/lib`, `src/app/api`.

### 6.2 [Cao] Tài khoản mẫu mặc định trong seed chạy cả ở production
- Vị trí: `prisma/seed.ts:29,43` — `admin / Admin@123`, `demo / Demo@123`; `deploy/install.sh` chạy seed khi cài VPS và chỉ **in cảnh báo** đổi mật khẩu. Quên đổi = kẻ tấn công đăng nhập admin bằng mật khẩu công khai trong repo.
- Khắc phục: khi cài production, sinh mật khẩu admin ngẫu nhiên và in một lần (hoặc bắt buộc đặt qua biến môi trường `ADMIN_PASSWORD`), không tạo tài khoản demo ở production.

### 6.3 [Trung] Secret của cổng thanh toán/nhà cung cấp lưu plaintext trong DB
- Secret Stripe/PayPal/SePay của web mẹ (bảng Setting) và của từng panel (cột trên `ChildPanel`: `stripeSecretKey`, `paypalSecret`, `sepaySecret`, `toolApiKey`…), API key nhà cung cấp (bảng `Provider`) đều lưu dạng rõ. Lộ DB (backup, SQLi ở hệ khác, quyền đọc nhầm) = lộ toàn bộ khoá thanh toán của mọi panel.
- Khắc phục: mã hoá các cột secret bằng khoá từ env (AES-GCM, `APP_ENC_KEY`) khi lưu, giải mã khi dùng; tối thiểu: đảm bảo backup mã hoá + phân quyền DB chặt (gắn với 6.4).

### 6.4 [Thấp] Secret đi qua query string — rò vào log & lịch sử trình duyệt
- SePay webhook chấp nhận `?secret=` (`src/app/api/webhooks/sepay/route.ts:22-24`), cron `?secret=` (4.2), `/api/v2` và `/api/tool/orders` nhận `key` qua query (GET). Access log của Caddy/Next sẽ lưu lại các URL này.
- Khắc phục: chỉ nhận secret/key qua header (`Authorization`, `x-tool-key` — tool API đã hỗ trợ header); nếu giữ query cho tương thích thì tắt log query ở proxy và coi các secret đã từng đi qua URL là cần xoay vòng.

### 6.5 [Thấp] `docker-compose.yml` (bản cũ MySQL) mở cổng DB và app ra mọi interface
- Vị trí: `docker-compose.yml:7-8,18-19` — `3306:3306`, `3000:3000`. Nếu ai dùng compose này trên VPS production, database phơi ra Internet.
- Khắc phục: gắn `127.0.0.1:` trước mapping hoặc xoá file khỏi hướng dẫn production (luồng chính đã là `deploy/install.sh` + PostgreSQL nội bộ — trường hợp đó cổng 3000 cũng nên bind `127.0.0.1` sau Caddy thay vì `0.0.0.0`; hiện UFW của install.sh chỉ mở 22/80/443 nên tạm an toàn, nhưng bind localhost là lớp phòng thủ đúng).

---

## 7. Webhook & thanh toán

### 7.1 [Cao] SePay: chống cộng trùng kiểu "kiểm tra rồi mới ghi" — đua song song cộng tiền 2 lần; thiếu txId là mất chống trùng
- Vị trí: `src/app/api/webhooks/sepay/route.ts:47-50` (tra `ApiLog` theo `ref = txId` trước khi xử lý) và dòng ghi log **sau** khi đã cộng tiền (cuối handler); không có unique constraint bảo chứng ở DB cho `ApiLog.ref`.
- Rủi ro: hai webhook trùng (cùng `txId`) đến đồng thời → cả hai cùng qua bước kiểm tra → cộng tiền hai lần. Nếu giao dịch không có `id`/`referenceCode` (`txId` rỗng), khoá chống trùng rơi về mã deposit **mới sinh** → mỗi lần bắn lại là một lần cộng mới.
- Khắc phục: tạo bản ghi chống trùng với cột `ref` có **unique index**, insert trong cùng transaction với cộng tiền (trùng khoá = bỏ qua); bắt buộc có txId mới xử lý; tốt nhất dựa vào `Deposit.externalId` unique như luồng quốc tế.

### 7.2 [Trung] SePay: so sánh secret bằng `===`, tra secret từng panel theo equality trong DB
- Vị trí: `src/app/api/webhooks/sepay/route.ts:24-32`. So sánh chuỗi thường (không constant-time) và lưu secret panel dạng rõ (gắn 6.3). Mức độ thực tế thấp (secret dài, tấn công timing qua mạng khó), nhưng nên sửa cùng đợt.
- Khắc phục: `crypto.timingSafeEqual`; lưu hash của secret webhook và so hash.

### 7.3 Đạt: Stripe & PayPal & USDT chống cộng trùng tốt
- Stripe: tự kiểm HMAC-SHA256 kèm dung sai thời gian 5 phút và `timingSafeEqual` (`src/lib/payments.ts`, `stripeVerifySignature`); webhook fail-closed khi không secret nào khớp (`src/app/api/webhooks/stripe/route.ts`).
- Cộng tiền quốc tế: `creditExternalDeposit` claim nguyên tử `PENDING → APPROVED` bằng `updateMany` có điều kiện trong transaction + đối chiếu số tiền đã trả với số tiền của deposit → webhook và trang quay về gọi trùng vẫn cộng đúng 1 lần.
- USDT: mỗi txHash gắn `externalId = usdt:<hash>` có ràng buộc `@unique` (`prisma/schema.prisma:412`) → khai báo trùng bị chặn. Thanh toán Stripe/PayPal của panel đi qua cấu hình riêng của panel, tiền về tài khoản chủ panel — đúng thiết kế.

---

## 8. Khác

### 8.1 [Trung] `siteOrigin()` dựng URL quay về thanh toán từ header Host không kiểm chứng
- Vị trí: `src/lib/payments.ts:67-72` — `x-forwarded-host`/`host` được dùng thẳng để tạo `success_url`/`cancel_url` cho Stripe/PayPal.
- Rủi ro: chèn Host lạ (khi vào trực tiếp cổng app hoặc proxy cấu hình lỏng) → link quay về trỏ sang domain kẻ tấn công (phishing sau thanh toán, đánh cắp mã đơn trong URL quay về). 
- Khắc phục: dựng origin từ `NEXT_PUBLIC_SITE_URL`/domain panel đã biết, không lấy từ header; hoặc validate host thuộc danh sách domain hệ thống + panel ACTIVE.

### 8.2 [Thấp] `/api/v2`: cho phép GET với key trên URL, trả lỗi nội bộ nguyên văn, không CORS header
- Vị trí: `src/app/api/v2/route.ts` (`GET` = `POST`; catch trả `String(e.message)` với status 400).
- Nhận xét: key trên URL là chuẩn phổ biến của SMM panel (tương thích Perfect Panel) nhưng sẽ vào log — xem 6.4. Lỗi nội bộ nguyên văn có thể lộ chi tiết vận hành (tên provider, thông điệp DB). Không đặt CORS header nghĩa là trình duyệt theo mặc định same-origin — chấp nhận được vì API dùng key, không dùng cookie.
- Khắc phục: giữ POST làm chính, lỗi ra ngoài dùng thông điệp chung + ghi chi tiết vào log server; cân nhắc IP allowlist cho key đại lý lớn.

### 8.3 [Thấp] SSRF: bề mặt nhỏ, đều do admin kiểm soát
- Fetch phía server tới URL cấu hình: `src/lib/provider.ts:25` (`provider.apiUrl` — chỉ admin mẹ đặt; chủ panel không thêm được provider, chỉ đấu về web mẹ) và `src/lib/ai.ts` (base URL AI do admin đặt). Ảnh sản phẩm là URL hiển thị phía trình duyệt, server không fetch → không có SSRF do khách thường điều khiển. Duy trì nguyên tắc: không bao giờ fetch URL lấy từ input của khách/panel trong tương lai mà không qua allowlist + chặn IP nội bộ.

### 8.4 [Thấp] `/api/tls-ask` (Caddy on-demand TLS) truy vấn DB không xác thực
- Vị trí: `src/app/api/tls-ask/route.ts` — endpoint công khai, chỉ trả 200 cho domain chính/panel ACTIVE (đúng mục đích). Kẻ ngoài có thể dùng để xác nhận một domain có phải website con hay không (thông tin vốn công khai) và tạo tải truy vấn DB theo từng domain lạ; Caddy chỉ hỏi khi có TLS handshake tới.
- Khắc phục: cache kết quả vài phút; cân nhắc giới hạn ở tầng Caddy. Mức độ thấp.

### 8.5 Đạt: upload & thư mục public
- Không có chức năng upload file trong code (ảnh đều qua URL) → không có bề mặt upload. `public/` chỉ chứa `icon.svg`. Không thấy route nào trả file tĩnh ngoài `public/`. Lỗi ở các API route còn lại (`/api/admin/*`, `/api/panel-admin/realtime`, `/api/tool/*`) đều có kiểm tra đăng nhập/key và phân vùng theo panel (đã đọc `ai-test`, `realtime`, `tool/orders`, `tool/update` — `toolContext` tách riêng key của mẹ và từng panel, đơn panel này không lộ sang panel khác).

---

## Tổng kết

| Mức độ | Số lượng |
|---|---|
| Nghiêm trọng | 1 |
| Cao | 7 |
| Trung | 4 |
| Thấp | 8 |
| Điểm đạt đã ghi nhận | 6 (mục 1, 2.3, 3.2, 6.1, 7.3, 8.5) |

### Top 5 ưu tiên sửa trước khi chạy production

1. **Sanitize HTML tại `RichText`** (2.1 — Nghiêm trọng): chặn stored XSS của chủ panel lên khách trên domain web mẹ; đồng thời rà lại `customHeadHtml/customBodyHtml` (2.2).
2. **Sửa nguồn IP tin cậy** (1.3): ghi đè `X-Forwarded-For` tại Caddy + sửa `clientIp()` — nếu không, mọi chống brute-force/cấm IP đều vô hiệu.
3. **Bỏ secret JWT dự phòng + cơ chế thu hồi phiên** (1.1, 1.2): fail-fast khi thiếu `AUTH_SECRET`; thêm `sessionVersion` để đổi mật khẩu/khoá tài khoản huỷ được phiên cũ.
4. **Đóng cron fail-open + rate limit tối thiểu** (4.2, 4.1): cron không secret = 401; bật giới hạn đăng ký theo IP và reCAPTCHA mặc định, cắt `cancel` của `/api/v2` ở 100 id, thêm giới hạn cho đăng nhập/suggest/wizard-check.
5. **Chống cộng trùng SePay bằng unique constraint trong cùng transaction** (7.1) + **mật khẩu admin seed ngẫu nhiên khi cài production** (6.2) + **security headers** (5.1) — ba việc nhỏ, tác động lớn, làm cùng một đợt.
