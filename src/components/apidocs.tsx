import Link from "next/link";
import { headers } from "next/headers";
import { ApiTabs, CopyBtn, type ApiActionDoc } from "@/components/client";

const KEY: [string, string, string] = ["key", "string", "API key cá nhân của bạn"];

const SMM_ACTIONS: ApiActionDoc[] = [
  { id: "services", label: "Services List", params: [KEY, ["action", "string", "services"]], response: `[\n  {\n    "service": 12,\n    "name": "TikTok Followers | Max 100K | Nhanh",\n    "type": "Default",\n    "category": "TikTok Followers",\n    "rate": "25000",\n    "min": 10,\n    "max": 100000,\n    "refill": true,\n    "cancel": false,\n    "dripfeed": false\n  }\n]` },
  { id: "add", label: "Add Order", params: [KEY, ["action", "string", "add"], ["service", "int", "ID dịch vụ (lấy từ Services List)"], ["link", "string", "Link cần tăng tương tác"], ["quantity", "int", "Số lượng đặt"], ["comments", "string", "Dịch vụ comment: nội dung, mỗi dòng 1 comment (tuỳ chọn)"], ["dripfeed", "int", "1 = bật drip-feed, chia đơn thành nhiều lượt (tuỳ chọn)"], ["runs", "int", "Số lượt thả khi drip-feed (tuỳ chọn)"], ["interval", "int", "Số phút giữa các lượt drip-feed (tuỳ chọn)"]], response: `{\n  "order": 48213\n}` },
  { id: "status", label: "Order Status", params: [KEY, ["action", "string", "status"], ["order", "int", "ID đơn hàng"]], response: `{\n  "charge": "25000",\n  "start_count": 1200,\n  "status": "In progress",\n  "remains": 300,\n  "currency": "VND"\n}` },
  { id: "orders", label: "Multiple Orders Status", params: [KEY, ["action", "string", "orders"], ["orders", "string", "Danh sách ID đơn, cách nhau bằng dấu phẩy (tối đa 100)"]], response: `{\n  "48213": {\n    "charge": "25000",\n    "start_count": 1200,\n    "status": "Completed",\n    "remains": 0,\n    "currency": "VND"\n  }\n}` },
  { id: "balance", label: "Balance Info", params: [KEY, ["action", "string", "balance"]], response: `{\n  "balance": "1500000",\n  "currency": "VND"\n}` },
  { id: "cancel", label: "Cancel Order", params: [KEY, ["action", "string", "cancel"], ["orders", "string", "ID đơn cần huỷ, cách nhau dấu phẩy — chỉ áp dụng dịch vụ cho phép huỷ, khi đơn còn chờ/đang xử lý"]], response: `[\n  {\n    "order": 48213,\n    "cancel": true\n  }\n]` },
  { id: "refill", label: "Refill Order", params: [KEY, ["action", "string", "refill"], ["order", "int", "ID đơn cần bù (refill)"]], response: `{\n  "refill": 48213\n}` },
];

const PRODUCT_ACTIONS: ApiActionDoc[] = [
  { id: "category", label: "Product Category", params: [KEY, ["action", "string", "category"]], response: `[\n  {\n    "id": 1,\n    "name": "Xem phim & Video",\n    "products": [\n      {\n        "id": 5,\n        "name": "Netflix Premium 4K",\n        "cycles": [\n          { "variant": 21, "cycle": 1, "name": "1 Tháng", "price": 70000 }\n        ]\n      }\n    ]\n  }\n]` },
  { id: "buy", label: "Buy Product", params: [KEY, ["action", "string", "buy"], ["product", "int", "ID gói (variant) — hoặc ID sản phẩm kèm tham số cycle"], ["cycle", "int", "Số tháng của chu kỳ khi mua theo sản phẩm (kiểu ThaTim, tuỳ chọn)"], ["note", "string", "Thông tin bàn giao: email/tài khoản cần nâng cấp hoặc ghi chú cho đơn"], ["quantity", "int", "Số lượng (mặc định 1)"]], response: `{\n  "order_code": "PRE100042",\n  "status": "DELIVERED",\n  "delivery": "Email: ... | Mật khẩu: ..."\n}` },
  { id: "history", label: "Purchase History", params: [KEY, ["action", "string", "history"], ["ids", "string", "Lọc theo mã đơn, cách nhau dấu phẩy (tuỳ chọn — bỏ trống lấy các đơn gần nhất)"]], response: `[\n  {\n    "order_code": "PRE100042",\n    "product": "Netflix Premium 4K",\n    "variant": "1 Tháng",\n    "price": 70000,\n    "status": "DELIVERED",\n    "delivery": "Email: ... | Mật khẩu: ...",\n    "created_at": "2026-01-01 10:00:00"\n  }\n]` },
];

function InfoCards({ endpoint, method, methodDesc, apiKey }: { endpoint: string; method: string; methodDesc: string; apiKey?: string | null }) {
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div className="card p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">API Endpoint URL</div>
        <div className="font-mono text-[13px] font-semibold text-slate-800 mt-2 break-all">{endpoint}</div>
        <div className="mt-3"><CopyBtn text={endpoint} label="Sao chép URL" /></div>
      </div>
      <div className="card p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">API Token Key</div>
        {apiKey ? (
          <>
            <div className="font-mono text-[13px] font-semibold text-slate-800 mt-2">{apiKey.slice(0, 6)}••••••••••••••••</div>
            <Link href="/dashboard/api" className="inline-block mt-3 text-sm font-semibold text-brand-600 hover:underline">Hiện / Tạo mới tại API đại lý</Link>
          </>
        ) : (
          <>
            <div className="font-mono text-[13px] text-slate-400 mt-2">••••••••••••••••</div>
            <Link href="/login" className="inline-block mt-3 text-sm font-semibold text-brand-600 hover:underline">Đăng nhập để xem key của bạn</Link>
          </>
        )}
      </div>
      <div className="card p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">HTTP Request Method</div>
        <div className="font-bold text-slate-800 mt-2">{method}</div>
        <div className="text-xs text-slate-400 mt-1">{methodDesc}</div>
      </div>
      <div className="card p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Response Format</div>
        <div className="font-bold text-slate-800 mt-2">JSON</div>
        <div className="text-xs text-slate-400 mt-1">UTF-8 Character Encoding</div>
      </div>
    </div>
  );
}

/* ===== Tài liệu API — bố cục kiểu thatim (DEVELOPER CENTER) ===== */
export async function ApiDocsView({ apiKey }: { apiKey?: string | null }) {
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const endpoint = `${proto}://${host}/api/v2`;
  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[26px] font-black tracking-tight text-slate-900 uppercase">Developer Center</h1>
          <span className="rounded-md bg-slate-900 text-white text-[11px] font-black px-2 py-1">V2</span>
        </div>
        <p className="text-slate-500 mt-1.5">Tài liệu API tích hợp dịch vụ Social và mua sản phẩm Premium tự động dành cho các đại lý</p>
      </div>

      <h2 className="text-lg font-black text-slate-900 uppercase mb-4">Tài liệu API dịch vụ Social</h2>
      <InfoCards endpoint={endpoint} method="POST" methodDesc="application/x-www-form-urlencoded" apiKey={apiKey} />
      <ApiTabs actions={SMM_ACTIONS} />

      <h2 className="text-lg font-black text-slate-900 uppercase mt-12 mb-4">Tài liệu API mua sản phẩm <span className="ml-1 rounded-md bg-brand-600 text-white text-[11px] font-black px-2 py-1 align-middle">PRODUCT</span></h2>
      <InfoCards endpoint={endpoint} method="GET / POST" methodDesc="Hỗ trợ cả hai giao thức nhận tin" apiKey={apiKey} />
      <ApiTabs actions={PRODUCT_ACTIONS} />
    </div>
  );
}
