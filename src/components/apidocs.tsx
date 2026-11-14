import Link from "next/link";
import { headers } from "next/headers";
import { ApiDocTabs, ApiTabs, CopyBtn, type ApiActionDoc } from "@/components/client";
import { getServerI18n } from "@/lib/lang-server";
import { getSettings, siteUrlFromSettings, subUrlFromSettings } from "@/lib/settings";

const KEY: [string, string, string] = ["key", "string", "API key cá nhân của bạn"];

const PRODUCT_ACTIONS: ApiActionDoc[] = [
  { id: "category", label: "Danh mục sản phẩm", params: [KEY, ["action", "string", "category"]], response: `[\n  {\n    "id": 1,\n    "name": "Xem phim & Video",\n    "products": [\n      {\n        "id": 5,\n        "name": "Netflix Premium 4K",\n        "cycles": [\n          { "variant": 21, "cycle": 1, "name": "1 Tháng", "price": 70000 }\n        ]\n      }\n    ]\n  }\n]` },
  { id: "buy", label: "Mua sản phẩm", params: [KEY, ["action", "string", "buy"], ["product", "int", "ID gói (variant) — hoặc ID sản phẩm kèm tham số cycle"], ["cycle", "int", "Số tháng của chu kỳ khi mua theo sản phẩm (tuỳ chọn)"], ["note", "string", "Thông tin bàn giao: email/tài khoản cần nâng cấp hoặc ghi chú cho đơn"], ["quantity", "int", "Số lượng (mặc định 1)"], ["promo_code", "string", "Mã khuyến mãi (tuỳ chọn)"]], response: `{\n  "order_code": "PRE100042",\n  "status": "DELIVERED",\n  "delivery": "Email: ... | Mật khẩu: ..."\n}` },
  { id: "history", label: "Lịch sử mua hàng", params: [KEY, ["action", "string", "history"], ["ids", "string", "Lọc theo mã đơn, cách nhau dấu phẩy (tuỳ chọn — bỏ trống lấy các đơn gần nhất)"]], response: `[\n  {\n    "order_code": "PRE100042",\n    "product": "Netflix Premium 4K",\n    "variant": "1 Tháng",\n    "price": 70000,\n    "price_vnd": "70.000đ",\n    "status": "DELIVERED",\n    "delivery": "Email: ... | Mật khẩu: ...",\n    "created_at": "2026-01-01T10:00:00.000Z"\n  }\n]` },
];

async function InfoCards({ endpoint, method, methodDesc, apiKey }: { endpoint: string; method: string; methodDesc: string; apiKey?: string | null }) {
  const { L } = await getServerI18n();
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div className="card p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{L("Địa chỉ API (Endpoint)")}</div>
        <div className="font-mono text-[13px] font-semibold text-slate-800 mt-2 break-all">{endpoint}</div>
        <div className="mt-3"><CopyBtn text={endpoint} label={L("Sao chép URL")} /></div>
      </div>
      <div className="card p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{L("Khoá API (Token)")}</div>
        {apiKey ? (
          <>
            <div className="font-mono text-[13px] font-semibold text-slate-800 mt-2">{apiKey.slice(0, 6)}••••••••••••••••</div>
            <Link href="/dashboard/api" className="inline-block mt-3 text-sm font-semibold text-brand-600 hover:underline">{L("Hiện / Tạo mới tại API đại lý")}</Link>
          </>
        ) : (
          <>
            <div className="font-mono text-[13px] text-slate-400 mt-2">••••••••••••••••</div>
            <Link href="/login" className="inline-block mt-3 text-sm font-semibold text-brand-600 hover:underline">{L("Đăng nhập để xem key của bạn")}</Link>
          </>
        )}
      </div>
      <div className="card p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{L("Phương thức HTTP")}</div>
        <div className="font-bold text-slate-800 mt-2">{method}</div>
        <div className="text-xs text-slate-400 mt-1">{L(methodDesc)}</div>
      </div>
      <div className="card p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{L("Định dạng phản hồi")}</div>
        <div className="font-bold text-slate-800 mt-2">JSON</div>
        <div className="text-xs text-slate-400 mt-1">{L("Mã hoá ký tự UTF-8")}</div>
      </div>
    </div>
  );
}

/* ===== Tài liệu API — bố cục kiểu thatim (DEVELOPER CENTER) ===== */
export async function ApiDocsView({ apiKey }: { apiKey?: string | null }) {
  const { L } = await getServerI18n();
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  // Địa chỉ API CHUẨN theo tên miền con (đợt 127): api.<miền gốc> suy từ
  // Liên kết web đã cấu hình — tài liệu đọc ở host nào cũng hiện đúng
  // địa chỉ chuẩn này; chưa cấu hình thì rơi về gốc, rồi về host hiện tại.
  const s = await getSettings().catch(() => null);
  const endpoint = `${subUrlFromSettings(s, "api") || siteUrlFromSettings(s) || `${proto}://${host}`}/api/v2`;
  // Nhãn + mô tả tham số ở module scope được dịch tại đây (điểm hiển thị phía server)
  // trước khi truyền cho ApiTabs; chuỗi ví dụ response là mẫu dữ liệu nên giữ nguyên.
  const localize = (actions: ApiActionDoc[]): ApiActionDoc[] => actions.map((a) => ({ ...a, label: L(a.label), params: a.params.map(([n, ty, d]) => [n, ty, L(d)] as [string, string, string]), ...(a.note ? { note: L(a.note) } : {}) }));
  // Section sản phẩm số theo NHÓM (fix6 task 6): dựng tại đây để ví dụ curl
  // mang đúng endpoint của site + key mẫu.
  const GROUP_ACTIONS: ApiActionDoc[] = [
    { id: "products", label: "Danh sách sản phẩm theo nhóm", params: [KEY, ["action", "string", "products"], ["group", "string", "Nhóm sản phẩm: gamekeys, giftcards, topups, manual, telegram_stars, telegram_premium, steam_topup, steam_gift (tuỳ chọn — bỏ trống lấy mọi nhóm)"]], note: "Giá là VND theo giá bán trên web (đã gồm flash sale nếu đang chạy). stock = out_of_stock nghĩa là gói đang hết hàng — đặt đơn sẽ bị từ chối; stock_qty chỉ có ở gói theo dõi số lượng kho.", curl: `curl -X POST ${endpoint} \\\n  -d "key=YOUR_API_KEY" \\\n  -d "action=products" \\\n  -d "group=gamekeys"`, response: `[\n  {\n    "group": "gamekeys",\n    "name": "Game Keys",\n    "products": [\n      {\n        "id": 31,\n        "name": "Steam Wallet Code 10 USD",\n        "category": "Game",\n        "fulfillment": "API",\n        "required_fields": [],\n        "variants": [\n          { "variant": 87, "name": "Global", "price": 265000, "delivery": "FAST", "stock": "in_stock", "stock_qty": 12 }\n        ]\n      }\n    ]\n  }\n]` },
    { id: "buy_group", label: "Đặt đơn sản phẩm số", params: [KEY, ["action", "string", "buy"], ["product", "int", "ID gói (variant) lấy từ danh sách sản phẩm theo nhóm"], ["quantity", "int", "Số lượng (mặc định 1; riêng Telegram Stars là số sao)"], ["username", "string", "Username Telegram của người nhận (nhóm telegram_stars / telegram_premium)"], ["telegram_id", "string", "ID số Telegram của người nhận — có ID thì giao tự động ngay (tuỳ chọn)"], ["player_id", "string", "ID người chơi / tài khoản nhận (nhóm topups)"], ["steam_login", "string", "Tên đăng nhập Steam (nhóm steam_topup)"], ["receiver", "string", "Tài khoản Steam nhận gift (nhóm steam_gift)"], ["fields", "string", "JSON các trường theo required_fields của sản phẩm — nhóm topups/manual truyền theo \"key\" của nhà cung cấp ghi trong required_fields, các nhóm khác truyền theo nhãn trường (tuỳ chọn)"], ["note", "string", "Ghi chú / thông tin bổ sung cho đơn (tuỳ chọn)"], ["promo_code", "string", "Mã khuyến mãi (tuỳ chọn)"]], note: "Lỗi nghiệp vụ trả về dạng {\"error\": \"...\"}: hết hàng (\"Gói đã hết hàng\"), thiếu trường bắt buộc, số lượng không hợp lệ hoặc số dư không đủ. Đơn Telegram chỉ có username (không telegram_id) có thể ở trạng thái PENDING để xử lý tay.", curl: `curl -X POST ${endpoint} \\\n  -d "key=YOUR_API_KEY" \\\n  -d "action=buy" \\\n  -d "product=87" \\\n  -d "quantity=1"`, response: `{\n  "order_code": "PRE100043",\n  "status": "DELIVERED",\n  "delivery": "XXXXX-XXXXX-XXXXX"\n}` },
    { id: "premium_status", label: "Trạng thái đơn sản phẩm", params: [KEY, ["action", "string", "premium_status"], ["order_code", "string", "Mã đơn sản phẩm (PRE...) trả về khi đặt đơn"]], note: "Trường delivery chỉ xuất hiện khi đơn đã giao (DELIVERED / COMPLETED / WARRANTY) — đó là key/tài khoản bàn giao cho khách của bạn.", curl: `curl -X POST ${endpoint} \\\n  -d "key=YOUR_API_KEY" \\\n  -d "action=premium_status" \\\n  -d "order_code=PRE100043"`, response: `{\n  "order_code": "PRE100043",\n  "status": "DELIVERED",\n  "product": "Steam Wallet Code 10 USD",\n  "variant": "Global",\n  "quantity": 1,\n  "price": 265000,\n  "delivery": "XXXXX-XXXXX-XXXXX",\n  "created_at": "2026-01-01T10:00:00.000Z"\n}` },
  ];
  // Dòng phương thức riêng của 2 tab sản phẩm: API mua sản phẩm nhận cả GET lẫn POST.
  const MethodLine = ({ badge }: { badge: string }) => (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <span className="rounded-md bg-brand-600 text-white text-[11px] font-black px-2 py-1">{badge}</span>
      <span className="text-sm text-slate-500"><b className="text-slate-800">GET / POST</b> — {L("Hỗ trợ cả hai giao thức nhận tin")}</span>
    </div>
  );
  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[26px] font-black tracking-tight text-slate-900">{L("Tài liệu API")}</h1>
          <span className="rounded-md bg-brand-600 text-white text-[11px] font-black px-2 py-1">V2</span>
        </div>
        <p className="text-slate-500 mt-1.5">{L("Tài liệu hướng dẫn tích hợp API V2: mua sản phẩm Premium và sản phẩm số tự động dành cho đại lý")}</p>
      </div>

      {/* Chia tab thay vì một trang kéo dài (lệnh Tín 2026-11-12): phần GIỐNG NHAU
          (endpoint, khoá API, phương thức, định dạng) chỉ viết 1 lần ở tab Chung;
          mỗi tab API chỉ còn action + tham số + ví dụ của riêng nó. Hash mở đúng
          tab: #chung / #premium / #sanphamso. */}
      <ApiDocTabs
        tabs={[
          { id: "chung", label: L("Chung") },
          { id: "premium", label: L("Sản phẩm Premium") },
          { id: "sanphamso", label: L("Sản phẩm số") },
        ]}
      >
        <div>
          <InfoCards endpoint={endpoint} method="POST" methodDesc="application/x-www-form-urlencoded" apiKey={apiKey} />
          <div className="card p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">{L("Lưu ý chung")}</div>
            <ul className="space-y-2.5 text-sm leading-relaxed text-slate-600">
              <li><b className="text-slate-800">{L("Xác thực")}:</b> {L("Mọi yêu cầu phải kèm tham số key (API key cá nhân của bạn). Nếu key bị lộ, hãy tạo key mới tại trang API đại lý.")}</li>
              <li><b className="text-slate-800">{L("Lỗi")}:</b> {L("Lỗi trả về dạng JSON {\"error\": \"...\"} kèm mã trạng thái HTTP tương ứng.")}</li>
              <li><b className="text-slate-800">{L("Giới hạn")}:</b> {L("Tối đa 600 yêu cầu/phút theo IP và 300 yêu cầu/phút theo API key.")}</li>
            </ul>
          </div>
        </div>
        <div>
          <MethodLine badge="PRODUCT" />
          <ApiTabs actions={localize(PRODUCT_ACTIONS)} />
        </div>
        <div>
          <MethodLine badge="GAME KEY · TELEGRAM · STEAM" />
          <ApiTabs actions={localize(GROUP_ACTIONS)} />
        </div>
      </ApiDocTabs>
    </div>
  );
}
