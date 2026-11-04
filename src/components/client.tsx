"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { vnd, num, PLATFORMS } from "@/lib/format";

export type ServiceDTO = {
  id: number; name: string; description: string | null; rate: number; min: number; max: number;
  avgTime: string | null; refill: boolean; categoryId: number; categoryName: string; platform: string;
};

/* ---------- Khám phá dịch vụ (trang công khai + trang đặt đơn) ---------- */
export function ServicesExplorer({ services, orderMode = false }: { services: ServiceDTO[]; orderMode?: boolean }) {
  const platforms = useMemo(() => Array.from(new Set(services.map((s) => s.platform))), [services]);
  const [platform, setPlatform] = useState<string>("all");
  const [q, setQ] = useState("");
  const list = services.filter(
    (s) => (platform === "all" || s.platform === platform) && (s.name + s.categoryName).toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input className="inp sm:max-w-xs" placeholder="Tìm dịch vụ... (vd: follow TikTok)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setPlatform("all")} className={`btn-sm rounded-full font-semibold ${platform === "all" ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Tất cả</button>
          {platforms.map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={`btn-sm rounded-full font-semibold ${platform === p ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{PLATFORMS[p] || p}</button>
          ))}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr><th className="th">ID</th><th className="th">Dịch vụ</th><th className="th">Giá / 1000</th><th className="th">Min – Max</th><th className="th">Thời gian</th><th className="th"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className="td text-slate-400 font-mono text-xs">{s.id}</td>
                <td className="td">
                  <div className="font-medium text-slate-800">{s.name}</div>
                  <div className="text-xs text-slate-400">{s.categoryName}{s.refill ? " · Có bảo hành bù" : ""}</div>
                </td>
                <td className="td font-bold text-brand-700">{vnd(s.rate)}</td>
                <td className="td text-slate-500">{num(s.min)} – {num(s.max)}</td>
                <td className="td text-slate-500">{s.avgTime || "—"}</td>
                <td className="td text-right">
                  <Link href={orderMode ? `/dashboard/dat-hang?service=${s.id}` : "/register"} className="btn-primary btn-sm">Đặt ngay</Link>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="td text-center text-slate-400 py-8">Không tìm thấy dịch vụ phù hợp</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3">Hiển thị {list.length}/{services.length} dịch vụ. Giá đã gồm VAT; cấp Đại lý / Tổng đại lý / VIP được chiết khấu thêm tự động khi đặt đơn.</p>
    </div>
  );
}

/* ---------- Form đặt đơn SMM (chọn danh mục -> dịch vụ, tính tiền trực tiếp) ---------- */
export function OrderForm({ services, categories, discount, preselect, action }: {
  services: ServiceDTO[];
  categories: { id: number; name: string; platform: string }[];
  discount: number;
  preselect?: number;
  action: (formData: FormData) => void;
}) {
  const [catId, setCatId] = useState<number>(preselect ? services.find((s) => s.id === preselect)?.categoryId || categories[0]?.id : categories[0]?.id);
  const inCat = services.filter((s) => s.categoryId === catId);
  const [serviceId, setServiceId] = useState<number>(preselect || inCat[0]?.id);
  const [qty, setQty] = useState<number>(1000);
  const [link, setLink] = useState("");
  const service = services.find((s) => s.id === serviceId) || inCat[0];
  const raw = service ? Math.ceil((service.rate * (qty || 0)) / 1000) : 0;
  const charge = Math.max(0, Math.round(raw * (1 - discount / 100)));
  return (
    <div className="grid lg:grid-cols-5 gap-6 items-start">
      <form action={action} className="card p-6 lg:col-span-3 space-y-4" id="order-form">
        <input type="hidden" name="serviceId" value={service?.id || ""} />
        <div>
          <label className="lbl">Danh mục</label>
          <select className="inp" value={catId} onChange={(e) => { const c = parseInt(e.target.value); setCatId(c); const f = services.find((s) => s.categoryId === c); if (f) setServiceId(f.id); }}>
            {categories.map((c) => <option key={c.id} value={c.id}>{PLATFORMS[c.platform] || c.platform} — {c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Dịch vụ</label>
          <select className="inp" value={service?.id} onChange={(e) => setServiceId(parseInt(e.target.value))}>
            {inCat.map((s) => <option key={s.id} value={s.id}>[{s.id}] {s.name} — {vnd(s.rate)}/1000</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Link cần tăng</label>
          <input className="inp" name="link" required placeholder="https://... (link công khai, không cần mật khẩu)" value={link} onChange={(e) => setLink(e.target.value)} />
        </div>
        <div>
          <label className="lbl">Số lượng {service && <span className="text-slate-400 font-normal">(từ {num(service.min)} đến {num(service.max)})</span>}</label>
          <input className="inp" name="quantity" type="number" required min={service?.min} max={service?.max} value={qty || ""} onChange={(e) => setQty(parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <label className="lbl">Ghi chú (tuỳ chọn)</label>
          <input className="inp" name="note" placeholder="Vd: chạy chậm tự nhiên, chia 3 ngày..." />
        </div>
        {service && /comment|bình luận/i.test(service.name) && (
          <div>
            <label className="lbl">Nội dung bình luận (mỗi dòng 1 bình luận)</label>
            <textarea className="inp" name="comments" rows={4} placeholder={"Hay quá shop ơi\nChất lượng tuyệt vời..."} />
            <p className="text-xs text-slate-400 mt-1.5">Số lượng đơn nên bằng số dòng bình luận bạn nhập.</p>
          </div>
        )}
        {service && /cảm xúc|reaction/i.test(service.name) && (
          <div>
            <label className="lbl">Loại cảm xúc</label>
            <select className="inp" name="reaction" defaultValue="like">
              <option value="like">Thích (like)</option>
              <option value="love">Yêu thích (love)</option>
              <option value="haha">Haha</option>
              <option value="wow">Wow</option>
              <option value="sad">Buồn (sad)</option>
              <option value="angry">Phẫn nộ (angry)</option>
              <option value="like|love|haha">Trộn: like + love + haha</option>
            </select>
          </div>
        )}
        {service && /watch|giờ xem|xem phút/i.test(service.name) && (
          <div>
            <label className="lbl">Số phút mỗi lượt xem</label>
            <input className="inp" name="minutes" type="number" min={1} placeholder="Vd: 30" />
          </div>
        )}
        <OrderSubmit />
      </form>
      <div className="card p-6 lg:col-span-2 lg:sticky lg:top-24">
        <div className="font-bold text-slate-900 mb-4">Chi tiết đơn</div>
        {service ? (
          <div className="space-y-3 text-sm">
            <Row k="Dịch vụ" v={service.name} />
            <Row k="Đơn giá" v={`${vnd(service.rate)} / 1000`} />
            <Row k="Số lượng" v={num(qty || 0)} />
            {discount > 0 && <Row k="Chiết khấu cấp bậc" v={`-${discount}%`} />}
            <Row k="Thời gian dự kiến" v={service.avgTime || "—"} />
            <Row k="Bảo hành bù (refill)" v={service.refill ? "Có" : "Không"} />
            <div className="border-t border-dashed pt-3 flex justify-between items-center">
              <span className="font-semibold">Tổng thanh toán</span>
              <span className="text-2xl font-extrabold text-brand-700">{vnd(charge)}</span>
            </div>
            {service.description && <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line bg-slate-50 rounded-xl p-3">{service.description}</p>}
          </div>
        ) : <p className="text-sm text-slate-400">Chưa có dịch vụ nào đang bán.</p>}
      </div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><span className="text-slate-500">{k}</span><span className="font-medium text-slate-800 text-right">{v}</span></div>;
}
function OrderSubmit() {
  // submit về server action qua form cha (formAction được gắn ở page bằng cách bọc form) — xem dat-hang/page.tsx
  return <button type="submit" className="btn-primary w-full !py-3">Đặt đơn ngay</button>;
}

/* ---------- Form mua premium ---------- */
export function PremiumBuyForm({ variants, slug, fulfillment, action }: {
  variants: { id: number; name: string; price: number; warrantyDays: number; stock: number }[];
  slug: string;
  fulfillment: string;
  action: (formData: FormData) => void;
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id);
  const [qty, setQty] = useState(1);
  const v = variants.find((x) => x.id === variantId) || variants[0];
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="grid sm:grid-cols-2 gap-3">
        {variants.map((x) => (
          <button type="button" key={x.id} onClick={() => setVariantId(x.id)}
            className={`text-left rounded-2xl border-2 p-4 transition ${x.id === v?.id ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <div className="font-bold text-slate-900">{x.name}</div>
            <div className="text-brand-700 font-extrabold text-lg mt-1">{vnd(x.price)}</div>
            <div className="text-xs text-slate-500 mt-1">
              {x.warrantyDays ? `Bảo hành ${x.warrantyDays} ngày` : "Không bảo hành"}
              {fulfillment === "AUTO_STOCK" ? (x.stock > 0 ? ` · Còn ${x.stock} trong kho` : " · Hết kho — giao tay") : fulfillment === "API" ? " · Giao qua nhà cung cấp" : " · Giao thủ công"}
            </div>
          </button>
        ))}
      </div>
      <input type="hidden" name="variantId" value={v?.id || ""} />
      <div className="flex items-end gap-3">
        <div className="w-32">
          <label className="lbl">Số lượng</label>
          <input className="inp" name="quantity" type="number" min={1} max={50} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
        </div>
        <div className="flex-1 text-right">
          <div className="text-xs text-slate-500">Tổng tiền</div>
          <div className="text-2xl font-extrabold text-brand-700">{vnd((v?.price || 0) * qty)}</div>
        </div>
      </div>
      {(fulfillment === "MANUAL" || fulfillment === "API") && (
        <div>
          <label className="lbl">Email / tài khoản của bạn để bàn giao *</label>
          <input className="inp" name="buyerInfo" required placeholder="Vd: email nhận gói / tài khoản cần nâng cấp" />
          <p className="text-xs text-slate-400 mt-1.5">{fulfillment === "API" ? "Thông tin này được gửi kèm đơn sang nhà cung cấp để bàn giao gói." : "Gói này được nâng cấp trực tiếp lên tài khoản của bạn — chỉ cần email, không cần mật khẩu."}</p>
        </div>
      )}
      {fulfillment === "AUTO_STOCK" && (
        <div>
          <label className="lbl">Ghi chú (tuỳ chọn)</label>
          <input className="inp" name="buyerInfo" placeholder="Email nhận tài khoản (mặc định dùng email tài khoản của bạn)" />
        </div>
      )}
      <button className="btn-primary w-full !py-3">Mua ngay bằng số dư</button>
    </form>
  );
}

export function CopyBtn({ text, label = "Sao chép" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="btn-ghost btn-sm">{ok ? "Đã chép" : label}</button>
  );
}
