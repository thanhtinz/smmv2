import Link from "next/link";
import { headers } from "next/headers";
import { ApiTabs, CopyBtn, type ApiActionDoc } from "@/components/client";
import { getServerI18n } from "@/lib/lang-server";

const KEY: [string, string, string] = ["key", "string", "API key cá nhân của bạn"];

const SMM_ACTIONS: ApiActionDoc[] = [
  { id: "services", label: "Danh sách dịch vụ", params: [KEY, ["action", "string", "services"]], response: `[\n  {\n    "service": 12,\n    "name": "TikTok Followers | Max 100K | Nhanh",\n    "type": "Default",\n    "category": "TikTok Followers",\n    "rate": "25000",\n    "min": 10,\n    "max": 100000,\n    "refill": true,\n    "cancel": false,\n    "dripfeed": false\n  }\n]` },
  { id: "add", label: "Tạo đơn mới", params: [KEY, ["action", "string", "add"], ["service", "int", "ID dịch vụ (lấy từ danh sách dịch vụ)"], ["link", "string", "Link cần tăng tương tác"], ["quantity", "int", "Số lượng đặt"], ["comments", "string", "Dịch vụ comment: nội dung, mỗi dòng 1 comment (tuỳ chọn)"], ["dripfeed", "int", "1 = bật drip-feed, chia đơn thành nhiều lượt (tuỳ chọn)"], ["runs", "int", "Số lượt thả khi drip-feed (tuỳ chọn)"], ["interval", "int", "Số phút giữa các lượt drip-feed (tuỳ chọn)"]], response: `{\n  "order": 48213\n}` },
  { id: "status", label: "Trạng thái đơn hàng", params: [KEY, ["action", "string", "status"], ["order", "int", "ID đơn hàng"]], response: `{\n  "charge": "25000",\n  "start_count": 1200,\n  "status": "In progress",\n  "remains": 300,\n  "currency": "VND"\n}` },
  { id: "orders", label: "Trạng thái nhiều đơn", params: [KEY, ["action", "string", "orders"], ["orders", "string", "Danh sách ID đơn, cách nhau bằng dấu phẩy (tối đa 100)"]], response: `{\n  "48213": {\n    "charge": "25000",\n    "start_count": 1200,\n    "status": "Completed",\n    "remains": 0,\n    "currency": "VND"\n  }\n}` },
  { id: "balance", label: "Số dư tài khoản", params: [KEY, ["action", "string", "balance"]], response: `{\n  "balance": "1500000",\n  "currency": "VND"\n}` },
  { id: "cancel", label: "Hủy đơn hàng", params: [KEY, ["action", "string", "cancel"], ["orders", "string", "ID đơn cần huỷ, cách nhau dấu phẩy — chỉ áp dụng dịch vụ cho phép huỷ, khi đơn còn chờ/đang xử lý"]], response: `[\n  {\n    "order": 48213,\n    "cancel": true\n  }\n]` },
  { id: "refill", label: "Bù đơn (Refill)", params: [KEY, ["action", "string", "refill"], ["order", "int", "ID đơn cần bù (refill)"]], response: `{\n  "refill": 48213\n}` },
];

const PRODUCT_ACTIONS: ApiActionDoc[] = [
  { id: "category", label: "Danh mục sản phẩm", params: [KEY, ["action", "string", "category"]], response: `[\n  {\n    "id": 1,\n    "name": "Xem phim & Video",\n    "products": [\n      {\n        "id": 5,\n        "name": "Netflix Premium 4K",\n        "cycles": [\n          { "variant": 21, "cycle": 1, "name": "1 Tháng", "price": 70000 }\n        ]\n      }\n    ]\n  }\n]` },
  { id: "buy", label: "Mua sản phẩm", params: [KEY, ["action", "string", "buy"], ["product", "int", "ID gói (variant) — hoặc ID sản phẩm kèm tham số cycle"], ["cycle", "int", "Số tháng của chu kỳ khi mua theo sản phẩm (tuỳ chọn)"], ["note", "string", "Thông tin bàn giao: email/tài khoản cần nâng cấp hoặc ghi chú cho đơn"], ["quantity", "int", "Số lượng (mặc định 1)"]], response: `{\n  "order_code": "PRE100042",\n  "status": "DELIVERED",\n  "delivery": "Email: ... | Mật khẩu: ..."\n}` },
  { id: "history", label: "Lịch sử mua hàng", params: [KEY, ["action", "string", "history"], ["ids", "string", "Lọc theo mã đơn, cách nhau dấu phẩy (tuỳ chọn — bỏ trống lấy các đơn gần nhất)"]], response: `[\n  {\n    "order_code": "PRE100042",\n    "product": "Netflix Premium 4K",\n    "variant": "1 Tháng",\n    "price": 70000,\n    "status": "DELIVERED",\n    "delivery": "Email: ... | Mật khẩu: ...",\n    "created_at": "2026-01-01 10:00:00"\n  }\n]` },
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
  const endpoint = `${proto}://${host}/api/v2`;
  // Nhãn + mô tả tham số ở module scope được dịch tại đây (điểm hiển thị phía server)
  // trước khi truyền cho ApiTabs; chuỗi ví dụ response là mẫu dữ liệu nên giữ nguyên.
  const localize = (actions: ApiActionDoc[]): ApiActionDoc[] => actions.map((a) => ({ ...a, label: L(a.label), params: a.params.map(([n, ty, d]) => [n, ty, L(d)] as [string, string, string]) }));
  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[26px] font-black tracking-tight text-slate-900">{L("Tài liệu API")}</h1>
          <span className="rounded-md bg-slate-900 text-white text-[11px] font-black px-2 py-1">V2</span>
        </div>
        <p className="text-slate-500 mt-1.5">{L("Tài liệu hướng dẫn tích hợp API V2: dịch vụ Social và mua sản phẩm Premium tự động dành cho đại lý")}</p>
      </div>

      <h2 className="text-lg font-black text-slate-900 mb-4">{L("Tài liệu API dịch vụ Social")}</h2>
      <InfoCards endpoint={endpoint} method="POST" methodDesc="application/x-www-form-urlencoded" apiKey={apiKey} />
      <ApiTabs actions={localize(SMM_ACTIONS)} />

      <h2 className="text-lg font-black text-slate-900 mt-12 mb-4">{L("Tài liệu API mua sản phẩm")} <span className="ml-1 rounded-md bg-brand-600 text-white text-[11px] font-black px-2 py-1 align-middle">PRODUCT</span></h2>
      <InfoCards endpoint={endpoint} method="GET / POST" methodDesc="Hỗ trợ cả hai giao thức nhận tin" apiKey={apiKey} />
      <ApiTabs actions={localize(PRODUCT_ACTIONS)} />
    </div>
  );
}
