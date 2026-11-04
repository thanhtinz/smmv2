"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { vnd, num, PLATFORMS } from "@/lib/format";
import { PLATFORM_COLORS } from "@/components/ui";

export type ServiceDTO = {
  id: number; name: string; description: string | null; rate: number; min: number; max: number;
  avgTime: string | null; refill: boolean; categoryId: number; categoryName: string; platform: string;
};

/* ---------- Khám phá dịch vụ (trang công khai + trang đặt đơn) ---------- */
const StarBtn = ({ active, onClick }: { active: boolean; onClick: () => void }) => (
  <button type="button" onClick={onClick} title={active ? "Bỏ yêu thích" : "Đánh dấu yêu thích"}
    className={`p-1.5 rounded-lg transition ${active ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.5 14.9 9.4l6.5.9-4.7 4.6 1.1 6.5L12 18.3l-5.8 3.1 1.1-6.5L2.6 10.3l6.5-.9L12 3.5Z" /></svg>
  </button>
);

export function ServicesExplorer({ services, orderMode = false }: { services: ServiceDTO[]; orderMode?: boolean }) {
  const platforms = useMemo(() => Array.from(new Set(services.map((s) => s.platform))), [services]);
  const [platform, setPlatform] = useState<string>("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"table" | "grid">("table");
  const [sort, setSort] = useState<"default" | "asc" | "desc">("default");
  const [range, setRange] = useState<"all" | "u10" | "m10" | "o50">("all");
  const [favOnly, setFavOnly] = useState(false);
  const [favs, setFavs] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("smmv2-favs") || "[]"); } catch { return []; }
  });
  function toggleFav(id: number) {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem("smmv2-favs", JSON.stringify(next)); } catch {}
      return next;
    });
  }
  let list = services.filter(
    (s) => (platform === "all" || s.platform === platform) && (s.name + s.categoryName).toLowerCase().includes(q.toLowerCase())
      && (range === "all" || (range === "u10" ? s.rate < 10000 : range === "m10" ? s.rate >= 10000 && s.rate <= 50000 : s.rate > 50000))
      && (!favOnly || favs.includes(s.id))
  );
  if (sort === "asc") list = [...list].sort((a, b) => a.rate - b.rate);
  if (sort === "desc") list = [...list].sort((a, b) => b.rate - a.rate);
  const orderHref = (id: number) => (orderMode ? `/dashboard/dat-hang?service=${id}` : "/register");
  return (
    <div>
      <div className="flex flex-col xl:flex-row gap-3 mb-5">
        <input className="inp xl:max-w-xs" placeholder="Tìm dịch vụ... (vd: follow TikTok)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={() => setPlatform("all")} className={`btn-sm rounded-full font-semibold ${platform === "all" ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Tất cả</button>
          {platforms.map((p) => (
            <button key={p} onClick={() => setPlatform(p)} className={`btn-sm rounded-full font-semibold ${platform === p ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{PLATFORMS[p] || p}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center xl:ml-auto">
          <select className="inp !w-auto !py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} title="Sắp xếp">
            <option value="default">Mặc định</option>
            <option value="asc">Giá tăng dần</option>
            <option value="desc">Giá giảm dần</option>
          </select>
          <select className="inp !w-auto !py-2 text-sm" value={range} onChange={(e) => setRange(e.target.value as typeof range)} title="Khoảng giá / 1000">
            <option value="all">Mọi mức giá</option>
            <option value="u10">Dưới 10.000đ</option>
            <option value="m10">10.000 – 50.000đ</option>
            <option value="o50">Trên 50.000đ</option>
          </select>
          <button onClick={() => setFavOnly((v) => !v)} className={`btn-sm rounded-full font-semibold ${favOnly ? "bg-amber-500 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Yêu thích ({favs.length})</button>
          <div className="flex rounded-full border border-slate-200 bg-white p-0.5">
            <button onClick={() => setView("table")} className={`btn-sm rounded-full font-semibold ${view === "table" ? "bg-brand-600 text-white" : "text-slate-500"}`}>Bảng</button>
            <button onClick={() => setView("grid")} className={`btn-sm rounded-full font-semibold ${view === "grid" ? "bg-brand-600 text-white" : "text-slate-500"}`}>Lưới</button>
          </div>
        </div>
      </div>
      {view === "table" ? (
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
                  <td className="td text-right whitespace-nowrap">
                    <StarBtn active={favs.includes(s.id)} onClick={() => toggleFav(s.id)} />
                    <Link href={orderHref(s.id)} className="btn-primary btn-sm">Đặt ngay</Link>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="td text-center text-slate-400 py-8">Không tìm thấy dịch vụ phù hợp</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((s) => (
            <div key={s.id} className="card p-5 flex flex-col hover:shadow-lg transition">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black shrink-0" style={{ background: PLATFORM_COLORS[s.platform] || "#64748b" }}>{(PLATFORMS[s.platform] || s.platform).charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 leading-snug">{s.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{s.categoryName} · ID {s.id}</div>
                </div>
                <StarBtn active={favs.includes(s.id)} onClick={() => toggleFav(s.id)} />
              </div>
              <div className="flex items-end justify-between mt-4">
                <div>
                  <div className="text-xl font-extrabold text-brand-700">{vnd(s.rate)}</div>
                  <div className="text-[11px] text-slate-400">/ 1000 lượt</div>
                </div>
                <div className="text-right text-xs text-slate-500 space-y-0.5">
                  <div>{num(s.min)} – {num(s.max)}</div>
                  <div>{s.avgTime || "Xử lý nhanh"}{s.refill ? " · Có bù" : ""}</div>
                </div>
              </div>
              <Link href={orderHref(s.id)} className="btn-primary btn-sm w-full mt-4 !py-2.5">Đặt ngay</Link>
            </div>
          ))}
          {list.length === 0 && <div className="card p-10 text-center text-slate-400 sm:col-span-2 xl:col-span-3">Không tìm thấy dịch vụ phù hợp</div>}
        </div>
      )}
      <p className="text-xs text-slate-400 mt-3">Hiển thị {list.length}/{services.length} dịch vụ. Giá đã gồm VAT; cấp Đại lý / Tổng đại lý / VIP được chiết khấu thêm tự động khi đặt đơn. Bấm ngôi sao để ghim dịch vụ hay dùng.</p>
    </div>
  );
}

/* ---------- Form đặt đơn SMM (chọn danh mục -> dịch vụ, tính tiền trực tiếp) ---------- */
export function OrderForm({ services, categories, discount, preselect, action, balance, initialLink, initialQty }: {
  services: ServiceDTO[];
  categories: { id: number; name: string; platform: string }[];
  discount: number;
  preselect?: number;
  action: (formData: FormData) => void;
  balance?: number;
  initialLink?: string;
  initialQty?: number;
}) {
  const [catId, setCatId] = useState<number>(preselect ? services.find((s) => s.id === preselect)?.categoryId || categories[0]?.id : categories[0]?.id);
  const inCat = services.filter((s) => s.categoryId === catId);
  const [serviceId, setServiceId] = useState<number>(preselect || inCat[0]?.id);
  const [qty, setQty] = useState<number>(initialQty || 1000);
  const [link, setLink] = useState(initialLink || "");
  const [pasteMsg, setPasteMsg] = useState("");
  const service = services.find((s) => s.id === serviceId) || inCat[0];
  const raw = service ? Math.ceil((service.rate * (qty || 0)) / 1000) : 0;
  const charge = Math.max(0, Math.round(raw * (1 - discount / 100)));
  const notEnough = balance !== undefined && charge > balance;
  const linkHost = (() => { try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const platformHosts: Record<string, string[]> = {
    facebook: ["facebook.com", "fb.watch", "fb.com"], tiktok: ["tiktok.com"], instagram: ["instagram.com"],
    youtube: ["youtube.com", "youtu.be"], telegram: ["t.me", "telegram.me"], shopee: ["shopee.vn", "shopee.com"],
  };
  const linkMismatch = !!(service && linkHost && platformHosts[service.platform] && !platformHosts[service.platform].some((h) => linkHost.endsWith(h)));
  async function pasteLink() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setLink(t.trim()); setPasteMsg("Đã dán link từ bộ nhớ tạm."); } else setPasteMsg("Bộ nhớ tạm đang trống.");
    } catch { setPasteMsg("Trình duyệt chưa cho đọc bộ nhớ tạm — hãy dán thủ công (Ctrl+V)."); }
  }
  const qtyChips = service ? Array.from(new Set([service.min, 500, 1000, 5000, 10000, 50000, service.max].filter((n) => n >= service.min && n <= service.max))) : [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
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
          <div className="flex gap-2">
            <input className="inp flex-1" name="link" required placeholder="https://... (link công khai, không cần mật khẩu)" value={link} onChange={(e) => setLink(e.target.value)} />
            <button type="button" onClick={pasteLink} className="btn-ghost shrink-0">Dán link</button>
          </div>
          {pasteMsg && <p className="text-xs text-slate-400 mt-1.5">{pasteMsg}</p>}
          {linkMismatch && <p className="text-xs text-amber-600 font-medium mt-1.5">Link này có vẻ không thuộc {PLATFORMS[service!.platform] || service!.platform} — kiểm tra lại dịch vụ đã chọn nhé.</p>}
        </div>
        <div>
          <label className="lbl">Số lượng {service && <span className="text-slate-400 font-normal">(từ {num(service.min)} đến {num(service.max)})</span>}</label>
          <input className="inp" name="quantity" type="number" required min={service?.min} max={service?.max} value={qty || ""} onChange={(e) => setQty(parseInt(e.target.value) || 0)} />
          {qtyChips.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {qtyChips.map((n) => (
                <button type="button" key={n} onClick={() => setQty(n)} className={`btn-sm rounded-full font-semibold ${qty === n ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{num(n)}</button>
              ))}
            </div>
          )}
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
        <OrderSubmit disabled={notEnough} />
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
            {balance !== undefined && (
              <div className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${notEnough ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                Số dư hiện tại: <b>{vnd(balance)}</b>
                {notEnough ? <> — còn thiếu <b>{vnd(charge - balance)}</b>. <Link href="/dashboard/nap-tien" className="font-bold underline">Nạp thêm ngay</Link></> : <> — sau đơn này còn <b>{vnd(balance - charge)}</b>.</>}
              </div>
            )}
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
function OrderSubmit({ disabled }: { disabled?: boolean }) {
  // submit về server action qua form cha (formAction được gắn ở page bằng cách bọc form) — xem dat-hang/page.tsx
  return <button type="submit" disabled={disabled} className="btn-primary w-full !py-3">{disabled ? "Chưa đủ số dư" : "Đặt đơn ngay"}</button>;
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
