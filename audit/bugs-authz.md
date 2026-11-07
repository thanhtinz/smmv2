# Kiểm toán lỗi logic + phân quyền — SMMv2 (CHỈ ĐỌC, không sửa code)

- Phạm vi: toàn bộ server actions `src/app/actions/*.ts`, toàn bộ API routes `src/app/api/**`, các thư viện lõi tiền/đơn (`src/lib/wallet.ts`, `orders.ts`, `payments.ts`, `promo.ts`, `panel-billing.ts`, `auth.ts`, `panel-access.ts`…), `src/middleware.ts`, `prisma/schema.prisma`.
- Ngày rà soát: 2026-11-06. Mọi số dòng đối chiếu trực tiếp từ mã nguồn tại thời điểm rà soát.
- Quy ước mức độ: **nghiêm trọng** = mất tiền/chiếm quyền toàn hệ thống, khai thác được ngay; **cao** = mất tiền hoặc leo thang quyền trong điều kiện thực tế; **trung** = rò rỉ dữ liệu / phá hoại / lạm dụng có điều kiện; **thấp** = vệ sinh mã, tác hại gián tiếp hoặc cần điều kiện phụ.

---

## A. NGHIÊM TRỌNG

### A1. `applyBalance` trừ/cộng tiền kiểu đọc–sửa–ghi, không khoá dòng, không nguyên tử — âm số dư và mất cập nhật trên MỌI luồng tiền
- **Vị trí:** `src/lib/wallet.ts:10-35` (đọc số dư `:18`, ghi giá trị tuyệt đối `:22-28`).
- **Mô tả:** Hàm trung tâm cho mọi biến động số dư chạy trong Prisma interactive transaction với isolation mặc định của PostgreSQL (ReadCommitted): `findUnique` lấy `balance`, cộng trừ trong bộ nhớ rồi `update` ghi lại giá trị tuyệt đối. Không có `SELECT … FOR UPDATE`, không dùng `increment` cho chính cột `balance` (chỉ `totalDeposited`/`totalSpent` mới dùng increment), không có update có điều kiện (`WHERE balance >= x`). Comment ở đầu hàm ("khoá dòng user, tránh trừ trùng / âm số dư") không đúng với mã thực tế.
- **Kịch bản:** Số dư 100.000đ, khách mở 2 tab/API bắn đồng thời 2 đơn 80.000đ. Cả hai transaction cùng đọc 100.000, cùng qua được kiểm tra `after < 0`, một transaction ghi 20.000 đè lên transaction kia → khách mua được 160.000đ hàng nhưng số dư chỉ trừ 80.000đ. Tương tự với hoàn tiền đồng thời (cộng 2 lần, ghi nhận 1 lần → mất tiền của hệ thống theo chiều ngược lại) và thu hồi hoa hồng. Mọi luồng tiền (đặt đơn SMM/Premium, hoàn tiền, duyệt nạp, hoa hồng panel/giới thiệu, phí panel, subscription) đều đi qua hàm này nên lỗi lan toàn hệ thống.
- **Mức độ: nghiêm trọng.**

---

## B. CAO

### B1. Trần hoàn tiền SMM tính NGOÀI transaction — hoàn vượt tổng tiền khi chạy đồng thời
- **Vị trí:** `src/lib/orders.ts:336-355` (`refundSmmOrder`).
- **Mô tả:** Hàm đọc đơn (kèm `refundedAmount`) và tính `cap = charge - refundedAmount` ở ngoài, sau đó mới mở transaction cộng tiền + `increment refundedAmount` mà không kiểm lại trần bên trong transaction.
- **Kịch bản:** Một đơn bị huỷ đồng thời từ 2 đường (admin bấm huỷ + cron đồng bộ trạng thái nhà cung cấp, hoặc API reseller cancel + tool update). Cả hai cùng đọc `refundedAmount = 0`, cùng tính cap = toàn bộ `charge`, cả hai cùng cộng tiền → khách được hoàn tối đa ~2 lần tiền đơn. Cùng mẫu đọc-cũ này xuất hiện ở nhánh PARTIAL trong `syncSmmOrderStatus` và ở `src/app/api/tool/update/route.ts:33` (xem C9).
- **Mức độ: cao.**

### B2. Kho Premium tự động (`AUTO_STOCK`) có thể bán trùng một tài khoản cho 2 khách
- **Vị trí:** `src/lib/orders.ts:590-600` (`createPremiumOrder`).
- **Mô tả:** Trong transaction: `findMany` lấy các dòng kho `AVAILABLE` rồi `updateMany` theo danh sách id — mệnh đề `where` của `updateMany` KHÔNG kèm `status: "AVAILABLE"` và không kiểm tra số dòng thực sự được cập nhật. ReadCommitted không ngăn hai transaction cùng nhìn thấy cùng một tập kho AVAILABLE.
- **Kịch bản:** Sản phẩm chỉ còn 1 tài khoản trong kho; 2 khách mua cùng lúc → cả hai cùng chọn đúng dòng kho đó, cả hai đơn đều DELIVERED với cùng một payload (cùng một tài khoản/mật khẩu giao cho 2 người). Thiệt hại: tranh chấp, phải hoàn tiền, lộ thông tin tài khoản.
- **Mức độ: cao.**

### B3. Duyệt nạp tiền: kiểm tra PENDING ở ngoài transaction, update vô điều kiện bên trong — cộng tiền 2 lần
- **Vị trí:** `src/app/actions/admin.ts:475-493` (`adminDepositAction`) và `src/app/actions/panel.ts:358-381` (`panelDepositAction`).
- **Mô tả:** Cả hai đều: đọc deposit + kiểm `status === "PENDING"` trước, rồi vào transaction `tx.deposit.update({ where: { id } })` đặt APPROVED (không kèm điều kiện status) và cộng tiền + thưởng. Hai lần duyệt đồng thời (double-click, 2 tab, retry, hai người duyệt) cùng qua được cổng kiểm tra → cộng `amount + bonus` hai lần. Mẫu đúng đã có sẵn trong codebase: `creditExternalDeposit` ở `src/lib/payments.ts` dùng `updateMany` claim `PENDING → APPROVED` nguyên tử — hai action duyệt tay không dùng mẫu này.
- **Mức độ: cao.**

### B4. Đơn Premium: "hồi sinh" đơn đã hoàn tiền rồi huỷ lại = hoàn tiền 2 lần toàn bộ
- **Vị trí:** `src/app/actions/admin.ts:437-473` (`adminPremiumOrderAction`, nhánh cancel `:455-467`, nhánh cập nhật thường `:468-472`); cùng mẫu ở `src/app/actions/panel.ts:993-1018` (`panelPremiumOrderAction`).
- **Mô tả:** Nhánh cancel chỉ chặn khi `order.status === "REFUNDED"` tại thời điểm bấm, và cộng lại toàn bộ `order.total` vô điều kiện. Nhánh cập nhật thường (cùng action) nhận `status` thô từ form và `update` không kèm bất kỳ rào trạng thái nào — đặt lại được REFUNDED → PENDING/DELIVERED. `PremiumOrder` không có cột `refundedAmount` như `SmmOrder` nên không có gì ghi nhớ "đã hoàn bao nhiêu".
- **Kịch bản:** Nhân viên (mẹ dùng `requireStaff`; phía panel là chủ/nhân viên panel) huỷ đơn → khách được hoàn 100%. Sau đó dùng form cập nhật thường đổi trạng thái đơn về PENDING, rồi huỷ lần nữa → hệ thống cộng thêm 100% nữa vào số dư khách. Lặp lại được nhiều lần. Nhánh cập nhật thường còn cho đặt status = REFUNDED mà không hề chuyển tiền (sổ sách nói đã hoàn nhưng khách không nhận được) hoặc DELIVERED khi chưa giao hàng.
- **Mức độ: cao.**

### B5. Cron endpoint "fail-open": chưa cấu hình secret thì ai cũng gọi được
- **Vị trí:** `src/app/api/cron/sync/route.ts:23` — `if (secret && given !== secret)`.
- **Mô tả:** Khi cả `settings.cron_secret` lẫn env `CRON_SECRET` đều trống, điều kiện bị bỏ qua và endpoint chạy công khai. Đối chiếu: webhook SePay trong cùng codebase làm fail-closed (thiếu secret = từ chối).
- **Kịch bản:** Trên bản cài mới chưa kịp đặt cron secret, bất kỳ ai biết URL `/api/cron/sync` cũng kích hoạt được: đồng bộ đơn + hoàn tiền theo trạng thái nhà cung cấp, chạy subscription trừ tiền khách, thu phí gia hạn panel, đồng bộ dịch vụ — vừa gây thiệt hại tiền, vừa là đòn DoS chi phí (mỗi lần gọi bắn hàng loạt request ra nhà cung cấp).
- **Mức độ: cao.**

### B6. Nhân viên panel (vai STAFF) leo thang quyền qua các action ở `actions/user.ts`
- **Vị trí:** `src/app/actions/user.ts:344` (`updatePanelAction`), `:394` (`setPanelServicePricesAction`), `:418` (`deletePanelServicePriceAction`), `:428` (`setPanelMemberLevelAction`).
- **Mô tả:** Bốn action này chỉ gọi `requireUser()` + `getPanelAccess(user.id)` và không hề kiểm tra `isOwner`. Theo `src/lib/panel-access.ts`, nhân viên panel vai "STAFF" vẫn được `getPanelAccess` trả về panel (với `isOwner: false`). Các action tương ứng trong `src/app/actions/panel.ts` thì dùng đúng `ownPanelOwner()` — chỉ riêng nhóm này là hở. Thiết kế 2 tầng đã chốt: STAFF chỉ xử lý đơn + ticket + xem danh sách; tiền/giá/cấu hình là quyền chủ panel (hoặc staff vai ADMIN, vốn được `isOwner: true` theo chủ đích).
- **Kịch bản:** Một nhân viên thường của panel có thể: đổi markup, tên, domain và đặt trạng thái panel sang SUSPENDED (treo toàn bộ website con) qua `updatePanelAction` — trong cùng action còn đổi được liên kết API key của panel; tự ý đặt giá riêng từng dịch vụ; đổi cấp bậc của bất kỳ khách nào trong panel (kèm chiết khấu theo cấp).
- **Mức độ: cao.**

### B7. Webhook SePay: chống trùng giao dịch không nguyên tử, không có unique ở DB chống lưng
- **Vị trí:** `src/app/api/webhooks/sepay/route.ts:46` (kiểm `ApiLog` trước), `:71` (ghi log SAU khi transaction cộng tiền xong); `prisma/schema.prisma` model `ApiLog` (dòng 498) không có `@@unique([kind, ref])`.
- **Mô tả:** Mẫu check-then-act cổ điển: kiểm "đã xử lý txId này chưa" → cộng tiền trong transaction → ghi log đánh dấu đã xử lý. Hai lần giao webhook đồng thời (SePay retry khi endpoint chậm, hoặc kẻ tấn công phát lại payload đã ký hợp lệ) cùng vượt qua bước kiểm → cùng cộng tiền. Khi `txId` rỗng, bước chống trùng bị bỏ qua hoàn toàn (ref rơi về `dep.code` sau khi đã cộng).
- **Kịch bản:** Một giao dịch chuyển khoản thật bị cộng số dư 2 lần; muốn nhân lên chỉ cần làm webhook đầu chậm lại (payload lớn/đồng thời) để SePay giao bản thứ hai chồng lên.
- **Mức độ: cao.**

---

## C. TRUNG BÌNH

### C1. Webhook SePay không ràng buộc phạm vi panel + khớp mã nạp theo substring trên toàn hệ thống
- **Vị trí:** `src/app/api/webhooks/sepay/route.ts:46-71`.
- **Mô tả:** (a) Webhook xác thực bằng secret của một panel (`viaPanelId`) nhưng việc khớp người nhận lại chạy toàn cục: nạp toàn bộ users rồi `users.find(u => norm.includes(u.depositCode))` trên nội dung chuyển khoản — không giới hạn `user.panelId === viaPanelId`. Tiền vào ngân hàng của chủ panel A vẫn có thể cộng số dư cho khách của panel B hoặc khách web mẹ. (b) Khớp substring: mã nạp 6 ký tự xuất hiện ở bất cứ đâu trong nội dung CK đều khớp, và `find` lấy người đầu tiên — nội dung chứa mã của người này nằm trong chuỗi dài hơn của người khác có thể cộng nhầm người.
- **Mức độ: trung** (gần cao ở ý (a) — phá vỡ nguyên tắc "tiền panel nào, khách panel đó").

### C2. API key của tài khoản web mẹ bị hiển thị dạng rõ trong trang cấu hình panel; liên kết key không kiểm quyền sở hữu key
- **Vị trí:** `src/app/panel-admin/cau-hinh/page.tsx:146` (`defaultValue={panel.apiKey}` — render nguyên key vào HTML của form); `src/app/dashboard/panel-cua-toi/thiet-lap/page.tsx:25` (key cũng được đưa xuống client); `src/app/actions/user.ts:139` (`panelApiLink`).
- **Mô tả:** Trang cấu hình panel in toàn bộ API key của tài khoản mẹ đã liên kết cho bất kỳ ai vào được trang — gồm nhân viên panel vai ADMIN không phải chủ panel. Key này dùng được ngay với `/api/v2` để đặt đơn tiêu số dư của tài khoản sở hữu key. Thêm nữa, `panelApiLink` tra key → chủ key mà không kiểm tra người gọi có sở hữu key đó không: ai nhặt được key rò rỉ ở nơi khác có thể "liên kết" nó vào panel của mình và từ đó key tiếp tục bị lộ qua trang cấu hình như trên.
- **Mức độ: trung.**

### C3. Hai hàm export trong file `"use server"` không có bất kỳ kiểm tra đăng nhập nào
- **Vị trí:** `src/app/actions/user.ts:158` (`panelCreationFeeFor(userId)`) và `src/app/actions/panel.ts:868` (`panelOrderCodes(panelId)`).
- **Mô tả:** Mọi hàm export của file `"use server"` đều là endpoint gọi được từ client khi action id lộ qua bundle/RSC payload. `panelCreationFeeFor` trả về số dư hiện tại + cấu hình phí + panel cha của MỘT USER BẤT KỲ theo id truyền vào, không gọi `requireUser`. `panelOrderCodes` trả về tới ~4.000 mã đơn SMM + Premium của MỘT PANEL BẤT KỲ, cũng không xác thực. (Hàm `chargePanelCreation` cũng export nhưng nhận object transaction nên không gọi trực tiếp được từ client — ghi nhận vệ sinh.)
- **Kịch bản:** Kẻ ngoài (không cần tài khoản) liệt kê id tăng dần để thu thập số dư người dùng toàn hệ thống / mã đơn của mọi panel.
- **Mức độ: trung.**

### C4. Một panel lỗi làm đứt toàn bộ vòng gia hạn panel
- **Vị trí:** `src/lib/panel-billing.ts:26-…` (`processPanelRenewals`).
- **Mô tả:** Vòng lặp gia hạn không có try/catch cho từng panel. Nếu `applyBalance` ném lỗi giữa chừng (ví dụ race làm số dư chủ panel âm — xem A1), exception phá vỡ cả vòng lặp; route cron chỉ bắt ở tầng cao nhất nên các panel xếp sau panel lỗi không bao giờ được gia hạn ở vòng đó — và nếu lỗi lặp lại, kẹt vĩnh viễn.
- **Mức độ: trung.**

### C5. Route huỷ PayPal không xác thực — ép huỷ yêu cầu nạp của người khác
- **Vị trí:** `src/app/api/payments/paypal/cancel/route.ts:8-12`.
- **Mô tả:** GET route này chỉ cần `token` (= `externalId` của deposit) là gọi `failDeposit` chuyển deposit PENDING sang REJECTED. Không session, không chữ ký.
- **Kịch bản:** Ai có được link/token PayPal của nạn nhân (log, ảnh chụp, link bị chia sẻ) đều huỷ được yêu cầu nạp đang chờ. Nếu nạn nhân đã hoàn tất thanh toán ở PayPal nhưng bị ép REJECTED trước, route return sau đó không cộng được tiền (trạng thái không còn PENDING) → khách mất tiền, phải xử lý tay.
- **Mức độ: trung.**

### C6. Khách tự đẩy đơn Premium đã hoàn tiền vào bảo hành; ghi đè ghi chú admin
- **Vị trí:** `src/app/actions/user.ts:584` (`warrantyAction`).
- **Mô tả:** Action kiểm đúng quyền sở hữu đơn, nhưng không kiểm trạng thái: khách đặt bất kỳ đơn nào của mình sang `WARRANTY` — kể cả đơn REFUNDED/CANCELED (tiền đã về ví) hay PENDING chưa giao — và mỗi lần bấm đều ghi đè `adminNote`.
- **Kịch bản:** Mua → huỷ lấy lại tiền → bấm bảo hành → đơn "hồi sinh" trong hàng đợi bảo hành, admin không để ý có thể giao/đổi tài khoản lần nữa: khách vừa có tiền vừa có hàng. Kèm phá hoại ghi chú nội bộ của admin.
- **Mức độ: trung.**

### C7. API `/api/v2` rò rỉ catalog riêng của panel khác + giá hiển thị lệch giá thực thu
- **Vị trí:** `src/app/api/v2/route.ts:44` (`services`), `:168` (`category`).
- **Mô tả:** `services` trả về toàn bộ dịch vụ đang bật, gồm dịch vụ riêng (`panelId != null`) của các panel khác kèm giá; `category` trả toàn bộ sản phẩm Premium gồm sản phẩm riêng của panel khác kèm giá biến thể. Việc MUA thì bị chặn đúng ở `createSmmOrder`/`createPremiumOrder`, nên đây là rò rỉ thông tin kinh doanh (tên dịch vụ/sản phẩm + giá của đối thủ cùng hệ thống) cho bất kỳ ai có một API key bất kỳ. Ngoài ra giá trong `services` tính theo chiết khấu cấp bậc web mẹ ngay cả khi người gọi là khách panel — khác giá thực thu khi đặt qua API.
- **Mức độ: trung.**

### C8. API `/api/v2` refill không kiểm trạng thái đơn, không cooldown; cancel không giới hạn số id
- **Vị trí:** `src/app/api/v2/route.ts:147` (`refill`), `:121` (`cancel`).
- **Mô tả:** `refill` chỉ kiểm đơn tồn tại + thuộc về người gọi, không kiểm trạng thái và không giới hạn tần suất: refill được cả đơn CANCELED/REFUNDED (nhà cung cấp có thể giao lại phần giá trị đã được hoàn tiền) và bắn refill liên tục gây chi phí/uy tín với nhà cung cấp. `cancel` lặp trên toàn bộ mảng id không cắt上限 (hành động `orders` có cắt 100, `cancel` thì không).
- **Mức độ: trung.**

### C9. Tool API: cập nhật PARTIAL lặp lại hoàn tiền cùng một phần nhiều lần
- **Vị trí:** `src/app/api/tool/update/route.ts:33-37`.
- **Mô tả:** Số tiền hoàn cho PARTIAL tính từ `remains` hiện tại của đơn mà không trừ `refundedAmount` đã hoàn trước đó; gọi update PARTIAL nhiều lần (mỗi lần vẫn "hợp lệ" vì đơn chưa vào trạng thái kết thúc) sẽ hoàn lặp cùng một phần. Lớp chặn cuối là trần trong `refundSmmOrder` — vốn tự nó có lỗ hổng đọc-cũ (B1).
- **Mức độ: trung.**

### C10. Kho Premium cho phép nhập trùng payload — cùng một tài khoản bán cho nhiều khách (không qua race)
- **Vị trí:** `prisma/schema.prisma` model `PremiumStock` (dòng 336, `payload` không unique, không có ràng buộc chống trùng theo variant) + `adminImportStock` trong `src/app/actions/admin.ts` không khử trùng với kho AVAILABLE hiện có và trong chính lô nhập.
- **Mô tả:** Khác B2 (race), đây là lỗi dữ liệu đứng yên: admin nhập lại cùng một dòng tài khoản (copy trùng lô, nhập lại file cũ) là có 2 dòng AVAILABLE giống hệt nhau, hệ thống bán cho 2 khách khác nhau một cách "hợp lệ".
- **Mức độ: trung.**

---

## D. THẤP / GHI NHẬN

### D1. Khoá ký phiên dự phòng vẫn là chuỗi cứng công khai ở nhánh non-production
- **Vị trí:** `src/lib/auth.ts:18` (fallback `"dev-secret-…"`), đối chiếu `:12-16`.
- **Mô tả:** Production đã được vá đúng hướng: thiếu `AUTH_SECRET` thì sinh khoá ngẫu nhiên theo tiến trình (không giả mạo được, nhưng mọi phiên chết khi restart). Tuy nhiên nhánh còn lại vẫn dùng khoá cứng in trong mã nguồn: nếu bản chạy thật bị khởi động thiếu `NODE_ENV=production` (dev server, runner tự chế phơi ra mạng nội bộ/internet), bất kỳ ai đọc code đều ký được JWT cho uid bất kỳ — uid tăng dần, uid admin thường là 1. Hàng rào phụ trợ: `requireAdmin/requireStaff/getCurrentUser` đọc lại role + trạng thái BANNED từ DB nên token giả phải trỏ đúng uid có quyền thật — điều kiện này dễ thỏa.
- **Mức độ: thấp** (chỉ kích hoạt khi cấu hình triển khai sai).

### D2. Tạo yêu cầu nạp: `method` lấy thẳng từ client, không whitelist
- **Vị trí:** `src/app/actions/user.ts:474` (`createDepositAction`).
- **Mô tả:** `method` từ form được ép kiểu `as any` lưu thẳng vào deposit PENDING mà không đối chiếu enum `DepositMethod` hay cấu hình phương thức đang bật. Khách tạo được yêu cầu nạp với phương thức bất kỳ (STRIPE/USDT/CARD…) dù cổng đó không cấu hình — gây nhiễu hàng đợi duyệt và tạo cơ hội lừa người duyệt cộng tay (kết hợp B3 nếu duyệt ẩu).
- **Mức độ: thấp.**

### D3. Đổi mật khẩu không thu hồi các phiên đăng nhập cũ
- **Vị trí:** `src/app/actions/auth.ts` (`changePasswordAction`) + `src/lib/auth.ts` (JWT stateless, hạn tới 90 ngày theo `session_days`/panel `sessionDays`).
- **Mô tả:** Không có cơ chế vô hiệu token đã phát: token bị lộ vẫn dùng được đến hết hạn ngay cả sau khi nạn nhân đổi mật khẩu. (Điểm cộng: tài khoản bị BANNED thì bị chặn ngay vì `getCurrentUser` đọc DB mỗi request.)
- **Mức độ: thấp.**

### D4. IP của client lấy từ `x-forwarded-for` phần tử đầu tiên — giả mạo được nếu thiếu proxy đáng tin
- **Vị trí:** `clientIp()` trong `src/lib/format.ts`, dùng bởi khóa brute-force (`src/lib/security.ts`), cấm IP (`assertNotBanned`), giới hạn đăng ký theo IP.
- **Mô tả:** Nếu app bị truy cập trực tiếp (không qua reverse proxy ghi đè/append XFF đúng cách — ví dụ phơi cổng 3000), kẻ tấn công tự đặt XFF để: né khóa đăng nhập + cấm IP, và gán các lần đăng ký/đăng nhập sai cho IP của người khác. Bộ cài VPS đi kèm dùng Caddy (append XFF) — cần đảm bảo cổng 3000 không truy cập trực tiếp được từ ngoài.
- **Mức độ: thấp** (phụ thuộc triển khai).

### D5. Đăng ký tài khoản: check-then-create không bắt lỗi unique → 500 thay vì thông báo
- **Vị trí:** `src/app/actions/auth.ts` (`registerAction`, `panelRegisterAction`).
- **Mô tả:** Kiểm tra trùng username/email rồi `create` mà không try/catch P2002; hai lần submit đồng thời (hoặc va chạm `depositCode`/`refCode` ngẫu nhiên) ném lỗi 500. Toàn vẹn dữ liệu vẫn được DB unique bảo vệ — chỉ là lỗi trải nghiệm/độ bền.
- **Mức độ: thấp.**

### D6. `campaignId` khi đặt đơn không kiểm quyền sở hữu
- **Vị trí:** `placeSmmOrderAction` / đặt đơn hàng loạt trong `src/app/actions/user.ts` (đối chiếu `src/app/actions/growth.ts` — các hàm quản lý campaign/subscription có kiểm sở hữu đúng).
- **Mô tả:** `campaignId` lấy từ form được gắn thẳng vào đơn mà không kiểm campaign có thuộc về người đặt hay không → đơn của mình tính vào thống kê/ngân sách chiến dịch của người khác. Không thiệt hại tiền trực tiếp.
- **Mức độ: thấp.**

### D7. Đăng nhập Google: `state` dùng `Math.random`, bỏ qua kiểm tra cấm IP
- **Vị trí:** `src/app/api/auth/google/route.ts:18`; `src/app/api/auth/google/callback/route.ts`.
- **Mô tả:** OAuth state sinh bằng `Math.random` (dự đoán được về nguyên tắc). Luồng callback khớp tài khoản theo email và không gọi `assertNotBanned` như luồng mật khẩu — IP đã bị cấm vẫn đăng nhập được bằng Google (trạng thái BANNED của tài khoản vẫn bị chặn đúng).
- **Mức độ: thấp.**

### D8. Xoá lịch sử nạp đã duyệt mà không đối soát số dư
- **Vị trí:** `adminDeleteDepositsAction` (`src/app/actions/admin.ts`), `panelDeleteDepositsAction` (`src/app/actions/panel.ts`).
- **Mô tả:** Xoá được cả bản ghi deposit APPROVED trong khi tiền đã cộng vẫn nằm trong số dư khách → mất dấu vết kiểm toán tiền (sổ Transaction còn nhưng mất liên kết với yêu cầu nạp gốc). Chỉ admin/chủ panel làm được nên xếp thấp, nhưng là rủi ro gian lận nội bộ/kế toán.
- **Mức độ: thấp.**

### D9. So sánh secret không hằng-thời-gian; cron secret đi qua query string
- **Vị trí:** `src/app/api/cron/sync/route.ts:23`; `src/app/api/webhooks/sepay/route.ts` (so sánh secret).
- **Mô tả:** So sánh chuỗi thường (timing side-channel, tác hại thực tế nhỏ) và cron chấp nhận `?secret=` trên URL — secret bị ghi vào access log của web server/proxy và lịch sử trình duyệt.
- **Mức độ: thấp.**

### D10. Schema: khoá nhận diện panel không unique; `ChildPanel.status` là chuỗi tự do; `onDelete` đa số để mặc định
- **Vị trí:** `prisma/schema.prisma` — `ChildPanel.toolApiKey` (dòng ~637) và `ChildPanel.sepaySecret` (dòng ~604) không `@unique`; `ChildPanel.status` (dòng ~645) là `String` thay vì enum.
- **Mô tả:** Hai panel trùng `toolApiKey`/`sepaySecret` thì các `findFirst` nhận diện panel (Tool API, webhook SePay) chọn mơ hồ một trong hai → nguy cơ gán nhầm phạm vi panel. `status` dạng chuỗi khiến code ghi cả giá trị "EXPIRED" ngoài bộ giá trị ghi trong comment (ACTIVE|SUSPENDED) mà không có gì chặn giá trị lạ. Về `onDelete`: hầu hết quan hệ không khai báo tường minh — hiện an toàn nhờ mặc định Prisma (Restrict cho quan hệ bắt buộc, SetNull cho quan hệ tuỳ chọn) và các action xoá đều kiểm đếm trước, nhưng dễ âm thầm thay đổi hành vi khi sửa schema về sau.
- **Mức độ: thấp.**

### D11. Mã giảm giá: giới hạn lượt dùng kiểm tra kiểu đọc-rồi-tăng; không giới hạn theo từng user
- **Vị trí:** `src/lib/promo.ts` (`checkPromo`/`consumePromo`).
- **Mô tả:** `usedCount` được kiểm tra rồi tăng trong ReadCommitted → nhiều đơn đồng thời có thể vượt `usageLimit`. Đồng thời không có giới hạn mỗi tài khoản dùng mấy lần: một tài khoản dùng một mã cho mọi đơn tới khi cạn limit toàn cục.
- **Mức độ: thấp.**

### D12. Đơn theo lịch tạo từ luồng đặt đơn thường thiếu kiểm tra đầu vào; trần ngân sách subscription tính theo giá gốc
- **Vị trí:** `placeSmmOrderAction` (nhánh tạo `Subscription`) trong `src/app/actions/user.ts`; `processSubscriptions` trong `src/lib/orders.ts`.
- **Mô tả:** Nhánh "đặt theo lịch" từ form đặt đơn tạo subscription không kiểm `quantity` theo min/max của dịch vụ và không kiểm số dư lúc tạo (hàm `createSubscriptionAction` ở `growth.ts` thì có kiểm). Khi cron chạy, số lượng bị kẹp về min/max và lỗi cứng làm gói tạm dừng nên tác hại giới hạn; riêng ước tính `dailyBudget` dùng `service.rate` gốc thay vì giá thực thu (sau markup panel/chiết khấu) → trần chi ngày có thể bị vượt thực tế.
- **Mức độ: thấp.**

### D13. Cập nhật trạng thái đơn SMM bằng tay không có rào trạng thái kết thúc
- **Vị trí:** `src/app/actions/admin.ts:266` (`adminSmmOrderAction`, nhánh cập nhật thường, `requireStaff`).
- **Mô tả:** Nhân viên đặt được trạng thái đơn tuỳ ý, gồm đánh dấu COMPLETED cho đơn chưa giao. Tiền thì an toàn nhờ `refundedAmount` chặn hoàn trùng (khác hẳn phía Premium — B4), nên đây là rủi ro nghiệp vụ/sổ sách, không phải rò tiền.
- **Mức độ: thấp.**

---

## E. ĐÃ KIỂM TRA VÀ ĐÚNG (để đối chiếu, không phải lỗi)

- Phân quyền đọc lại từ DB: `requireAdmin`/`requireStaff`/`getCurrentUser` (`src/lib/auth.ts`) luôn đọc role + trạng thái BANNED từ database — role trong JWT không được tin cậy để cấp quyền.
- Cộng tiền cổng ngoài `creditExternalDeposit` (`src/lib/payments.ts`) dùng claim nguyên tử `updateMany PENDING → APPROVED` trong transaction — mẫu đúng, cần nhân ra cho B3. `Deposit.externalId` có `@unique` (schema dòng 414) và luồng USDT claim theo txHash tương tự.
- Webhook Stripe (`src/app/api/webhooks/stripe/route.ts`) kiểm HMAC hằng-thời-gian, thử lần lượt secret web mẹ + từng panel.
- Tool API (`src/lib/tool.ts` + routes): key của panel bị giới hạn đúng phạm vi đơn của panel đó ở cả list lẫn tra cứu; key web mẹ thấy đơn tay toàn hệ thống là theo thiết kế.
- `src/app/actions/growth.ts`: campaign/subscription đều kiểm quyền sở hữu khi sửa/xoá. `src/app/actions/admin-features.ts`: toàn bộ `requireAdmin`. Mẫu NEXT_REDIRECT được guard nhất quán trong các action (rethrow khi digest bắt đầu bằng `NEXT_REDIRECT`).
- Tiền tệ: toàn bộ field tiền trong `prisma/schema.prisma` là `Int` (VNĐ) — không có Float/Decimal ở bất kỳ model nào. Các unique nghiệp vụ chính đều có: `User.username/email/apiKey/depositCode/refCode`, `SmmOrder.code`, `PremiumOrder.code`, `Deposit.code`, `DiscountCode.code`, `ChildPanel.slug/domain`, `PanelStaff(panelId,userId)`, `PanelServicePrice(panelId,serviceId,level)`, `PremiumReview(productId,userId)`.
- `/api/tls-ask` công khai có chủ đích: chỉ trả lời domain có phải panel ACTIVE hay không (domain vốn công khai), không lộ dữ liệu khác.

---

## F. BẢNG TỔNG KẾT SỐ MỤC THEO MỨC ĐỘ

| Mức độ | Số mục | Các mục |
|---|---|---|
| Nghiêm trọng | 1 | A1 |
| Cao | 7 | B1–B7 |
| Trung bình | 10 | C1–C10 |
| Thấp / ghi nhận | 13 | D1–D13 |
| **Tổng** | **31** | |

Ưu tiên xử lý đề xuất: A1 (gốc rễ của hầu hết rủi ro tiền) → B3 + B4 + B1 (các đường cộng/hoàn tiền trùng đang mở) → B5 + B6 (cấu hình + phân quyền) → B7 + B2 (race ở webhook và kho).
