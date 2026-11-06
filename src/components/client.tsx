"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { vnd, num, PLATFORMS, type PremiumCustomField } from "@/lib/format";
import { PLATFORM_COLORS } from "@/components/ui";
import { warrantyAction } from "@/app/actions/user";

export type ServiceDTO = {
  id: number; name: string; description: string | null; notice?: string | null; rate: number; min: number; max: number;
  avgTime: string | null; refill: boolean; dripfeed?: boolean; categoryId: number; categoryName: string; platform: string;
};

/* ---------- Khám phá dịch vụ (trang công khai + trang đặt đơn) ---------- */
const StarBtn = ({ active, onClick }: { active: boolean; onClick: () => void }) => (
  <button type="button" onClick={onClick} title={active ? "Bỏ yêu thích" : "Đánh dấu yêu thích"}
    className={`p-1.5 rounded-lg transition ${active ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.5 14.9 9.4l6.5.9-4.7 4.6 1.1 6.5L12 18.3l-5.8 3.1 1.1-6.5L2.6 10.3l6.5-.9L12 3.5Z" /></svg>
  </button>
);

export function ServicesExplorer({ services, orderMode = false, registerHref }: { services: ServiceDTO[]; orderMode?: boolean; registerHref?: string }) {
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
  const orderHref = (id: number) => (orderMode ? `/dashboard/dat-hang?service=${id}` : registerHref || "/register");
  const platCounts = new Map<string, number>();
  services.forEach((s) => platCounts.set(s.platform, (platCounts.get(s.platform) || 0) + 1));
  const catCount = new Set(services.map((s) => s.categoryId)).size;
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-3 sm:grid-cols-3 lg:grid-cols-5">
        {platforms.map((p) => (
          <button key={p} type="button" onClick={() => setPlatform(platform === p ? "all" : p)} className={`card flex items-center gap-3 p-3.5 text-left transition hover:shadow-md ${platform === p ? "ring-2 ring-brand-600" : ""}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black text-white" style={{ background: PLATFORM_COLORS[p] || "#64748b" }}>{(PLATFORMS[p] || p).charAt(0)}</span>
            <span className="min-w-0">
              <span className="block truncate font-bold text-slate-900">{PLATFORMS[p] || p}</span>
              <span className="block text-xs text-slate-400">{platCounts.get(p) || 0} dịch vụ</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mb-5 text-sm text-slate-500">
        Tổng cộng: <b className="text-slate-800">{services.length} dịch vụ</b> · {catCount} danh mục · {platforms.length} nền tảng
        {platform !== "all" && <button type="button" onClick={() => setPlatform("all")} className="ml-3 font-semibold text-brand-600">Xem tất cả</button>}
      </div>
      <div className="flex flex-col xl:flex-row gap-3 mb-5">
        <input className="inp xl:max-w-xs" placeholder="Tìm dịch vụ... (vd: follow TikTok)" value={q} onChange={(e) => setQ(e.target.value)} />
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
/* ---------- Mảnh giao diện cho phần đầu form đặt đơn (kiểu panel mẫu: tìm nhanh / nền tảng / dịch vụ / máy chủ) ---------- */
function ChevUD() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400"><path d="m7 9 5-5 5 5" /><path d="m7 15 5 5 5-5" /></svg>
  );
}
function IdBadge({ id }: { id: number }) {
  return <span className="shrink-0 rounded-lg bg-brand-500 px-2 py-0.5 text-[13px] font-bold leading-5 text-white">{id}</span>;
}
/** Giá cho 1 tương tác từ giá /1000: 45000 -> "45₫", 2260 -> "2,26₫" */
function perUnitVnd(rate: number) {
  const v = rate / 1000;
  return (Number.isInteger(v) ? String(v) : v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })) + "₫";
}
function PlatformIcon({ platform, size = 38 }: { platform: string; size?: number }) {
  const glyph = (() => {
    switch (platform) {
      case "facebook": return <path d="M13.4 21.9v-6.8h2.3l.35-2.65h-2.65V10.7c0-.77.22-1.3 1.33-1.3h1.42V7.05c-.25-.03-1.1-.11-2.08-.11-2.06 0-3.47 1.26-3.47 3.57v1.94H8.25v2.65h2.35v6.8a10 10 0 0 0 2.8 0Z" fill="#fff" />;
      case "instagram": return <g fill="none" stroke="#fff" strokeWidth="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17.1" cy="6.9" r="1.15" fill="#fff" stroke="none" /></g>;
      case "youtube": return <g><rect x="2.8" y="6" width="18.4" height="12.5" rx="3.5" fill="#fff" /><path d="M10.4 9.6v5.3l4.8-2.65z" fill="#000" /></g>;
      case "tiktok": return <g fill="#fff"><ellipse cx="7.2" cy="17.2" rx="2.7" ry="2.1" /><ellipse cx="15.2" cy="15.2" rx="2.7" ry="2.1" /><path d="M9.9 17.2V6.2l8-1.9v10.9h-2.7V7.4l-5.3 1.3v8.5z" /></g>;
      case "telegram": return <g fill="none" stroke="#fff" strokeWidth="1.9" strokeLinejoin="round"><path d="M21 3 10.8 13.2" /><path d="M21 3 14.5 21l-3.7-7.8L3 9.5 21 3z" /></g>;
      case "shopee": return <g fill="none" stroke="#fff" strokeWidth="1.9" strokeLinejoin="round"><path d="M5 8h14l-1.2 12a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" /><path d="M8.5 10.5V6.5a3.5 3.5 0 0 1 7 0v4" /></g>;
      default: return <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff">{(PLATFORMS[platform] || platform || "?").charAt(0)}</text>;
    }
  })();
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[10px] bg-slate-900" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24">{glyph}</svg>
    </span>
  );
}
/** Icon hãng nền màu thương hiệu (dùng ở thẻ Chi tiết đơn theo panel mẫu) */
const PLATFORM_BRAND_BG: Record<string, string> = {
  facebook: "#1877f2", instagram: "#e1306c", youtube: "#ff0000", tiktok: "#000000", telegram: "#229ed9", shopee: "#ee4d2d",
};
function PlatformBrandIcon({ platform, size = 40 }: { platform: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[10px]" style={{ width: size, height: size, background: PLATFORM_BRAND_BG[platform] || "#0f172a" }}>
      <svg width={size} height={size} viewBox="0 0 24 24">
        {platform === "facebook" && <path d="M13.4 21.9v-6.8h2.3l.35-2.65h-2.65V10.7c0-.77.22-1.3 1.33-1.3h1.42V7.05c-.25-.03-1.1-.11-2.08-.11-2.06 0-3.47 1.26-3.47 3.57v1.94H8.25v2.65h2.35v6.8a10 10 0 0 0 2.8 0Z" fill="#fff" />}
        {platform === "instagram" && <g fill="none" stroke="#fff" strokeWidth="1.8"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17.1" cy="6.9" r="1.15" fill="#fff" stroke="none" /></g>}
        {platform === "youtube" && <g><rect x="2.8" y="6" width="18.4" height="12.5" rx="3.5" fill="#fff" /><path d="M10.4 9.6v5.3l4.8-2.65z" fill="#e1306c" /></g>}
        {platform === "tiktok" && <g fill="#fff"><ellipse cx="7.2" cy="17.2" rx="2.7" ry="2.1" /><ellipse cx="15.2" cy="15.2" rx="2.7" ry="2.1" /><path d="M9.9 17.2V6.2l8-1.9v10.9h-2.7V7.4l-5.3 1.3v8.5z" /></g>}
        {platform === "telegram" && <g fill="none" stroke="#fff" strokeWidth="1.9" strokeLinejoin="round"><path d="M21 3 10.8 13.2" /><path d="M21 3 14.5 21l-3.7-7.8L3 9.5 21 3z" /></g>}
        {platform === "shopee" && <g fill="none" stroke="#fff" strokeWidth="1.9" strokeLinejoin="round"><path d="M5 8h14l-1.2 12a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" /><path d="M8.5 10.5V6.5a3.5 3.5 0 0 1 7 0v4" /></g>}
        {!PLATFORM_BRAND_BG[platform] && <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff">{(PLATFORMS[platform] || platform || "?").charAt(0)}</text>}
      </svg>
    </span>
  );
}
/** Một dòng thông tin trong hộp nét đứt của thẻ Chi tiết đơn */
function DetailLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[15px] leading-relaxed text-slate-800">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
/** Link mẫu theo nền tảng, hiện trong hộp chi tiết */
const EXAMPLE_LINK: Record<string, string> = {
  facebook: "Link Page / bài viết công khai",
  instagram: "Link bài viết / reel công khai",
  tiktok: "Link video công khai",
  youtube: "Link video / kênh công khai",
  telegram: "Link bài viết / kênh công khai",
  shopee: "Link sản phẩm công khai",
};
function InfoCell({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] text-slate-500">{label}</span>
        <span className="block truncate text-[15px] font-bold text-slate-800">{value}</span>
      </span>
    </div>
  );
}

/* Nút dán link dạng icon, nằm bên trong khung input của form đặt đơn */
function PasteIconBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" title="Dán link" aria-label="Dán link" onClick={onClick} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 hover:text-brand-600">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6" /><path d="M9 16h4" /></svg>
    </button>
  );
}

export function OrderForm({ services, categories, discount, preselect, action, balance, initialLink, initialQty, campaignId }: {
  services: ServiceDTO[];
  categories: { id: number; name: string; platform: string }[];
  discount: number;
  preselect?: number;
  action: (formData: FormData) => void;
  balance?: number;
  initialLink?: string;
  initialQty?: number;
  campaignId?: number;
}) {
  const [catId, setCatId] = useState<number>(preselect ? services.find((s) => s.id === preselect)?.categoryId || categories[0]?.id : categories[0]?.id);
  const inCat = services.filter((s) => s.categoryId === catId);
  const [serviceId, setServiceId] = useState<number>(preselect || inCat[0]?.id);
  const [qty, setQty] = useState<number>(initialQty || 1000);
  const [dripOn, setDripOn] = useState(false);
  const [dripRuns, setDripRuns] = useState(10);
  const [dripInterval, setDripInterval] = useState(60);
  const [schedOn, setSchedOn] = useState(false);
  const [schedAt, setSchedAt] = useState("");
  const [loopOn, setLoopOn] = useState(false);
  const [loopTimes, setLoopTimes] = useState(5);
  const [loopInterval, setLoopInterval] = useState(60);
  const [link, setLink] = useState(initialLink || "");
  const [platform, setPlatform] = useState<string>(() => (preselect ? services.find((s) => s.id === preselect)?.platform : undefined) || categories[0]?.platform || "");
  const [openMenu, setOpenMenu] = useState<null | "quick" | "platform" | "cat" | "svc">(null);
  const [quickQ, setQuickQ] = useState("");
  const platformList = Array.from(new Set(categories.map((c) => c.platform)));
  const catsOfPlatform = categories.filter((c) => c.platform === platform);
  const quickResults = services.filter((s) => { const q = quickQ.trim().toLowerCase(); return !q || s.name.toLowerCase().includes(q) || s.categoryName.toLowerCase().includes(q) || String(s.id) === q; }).slice(0, 8);
  const pickPlatform = (p: string) => { setPlatform(p); const c = categories.find((x) => x.platform === p); if (c) { setCatId(c.id); const f = services.find((s) => s.categoryId === c.id); if (f) setServiceId(f.id); } setOpenMenu(null); };
  const pickCategory = (c: { id: number; platform: string }) => { setCatId(c.id); setPlatform(c.platform); const f = services.find((s) => s.categoryId === c.id); if (f) setServiceId(f.id); setOpenMenu(null); };
  const pickService = (s: ServiceDTO) => { setServiceId(s.id); setCatId(s.categoryId); setPlatform(s.platform); setOpenMenu(null); setQuickQ(""); };
  const [multiOn, setMultiOn] = useState(false);
  const [multiLinks, setMultiLinks] = useState("");
  const [pasteMsg, setPasteMsg] = useState("");
  const service = services.find((s) => s.id === serviceId) || inCat[0];
  const raw = service ? Math.ceil((service.rate * (qty || 0)) / 1000) : 0;
  const charge = Math.max(0, Math.round(raw * (1 - discount / 100)));
  const linkLines = Array.from(new Set(multiLinks.split("\n").map((l) => l.trim()).filter(Boolean)));
  const orderCount = multiOn ? linkLines.length : 1;
  const totalCharge = charge * orderCount;
  // Chế độ nhiều link mà chưa nhập link nào: thẻ bên phải hiện giá của 1 link thay vì 0đ
  const shownCharge = multiOn && orderCount === 0 ? charge : totalCharge;
  const notEnough = balance !== undefined && shownCharge > balance;
  const linkHost = (() => { try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const platformHosts: Record<string, string[]> = {
    facebook: ["facebook.com", "fb.watch", "fb.com"], tiktok: ["tiktok.com"], instagram: ["instagram.com"],
    youtube: ["youtube.com", "youtu.be"], telegram: ["t.me", "telegram.me"], shopee: ["shopee.vn", "shopee.com"],
  };
  const linkMismatch = !!(service && linkHost && platformHosts[service.platform] && !platformHosts[service.platform].some((h) => linkHost.endsWith(h)));
  async function pasteLink() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        if (multiOn) { setMultiLinks((prev) => (prev.trim() ? prev.replace(/\s+$/, "") + "\n" + t.trim() : t.trim())); }
        else { setLink(t.trim()); }
        setPasteMsg("");
      } else setPasteMsg("Bộ nhớ tạm đang trống.");
    } catch { setPasteMsg("Trình duyệt chưa cho đọc bộ nhớ tạm — hãy dán thủ công (Ctrl+V)."); }
  }
  const qtyChips = service ? Array.from(new Set([service.min, 500, 1000, 5000, 10000, 50000, service.max].filter((n) => n >= service.min && n <= service.max))) : [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      <form action={action} className="card p-6 lg:col-span-3 space-y-4" id="order-form">
        {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
        <input type="hidden" name="serviceId" value={service?.id || ""} />
        <div className="relative">
          <label className="lbl !text-[15px] !font-bold text-slate-800">Tìm nhanh dịch vụ</label>
          {openMenu === "quick" && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMenu(null)} />}
          <button type="button" onClick={() => setOpenMenu(openMenu === "quick" ? null : "quick")} className="relative z-10 flex h-[56px] w-full items-center gap-3 rounded-2xl bg-slate-100 px-4 text-left transition hover:bg-slate-200/70">
            {service ? <><IdBadge id={service.id} /><span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-800">{service.name}</span></> : <span className="flex-1 text-[15px] text-slate-400">Chọn dịch vụ...</span>}
            <ChevUD />
          </button>
          {openMenu === "quick" && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <input autoFocus className="inp mb-1.5" placeholder="Gõ tên hoặc mã dịch vụ..." value={quickQ} onChange={(e) => setQuickQ(e.target.value)} />
              <div className="max-h-64 overflow-auto">
                {quickResults.map((s) => (
                  <button key={s.id} type="button" onClick={() => pickService(s)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 ${s.id === service?.id ? "bg-brand-50" : ""}`}>
                    <IdBadge id={s.id} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{s.name}</span><span className="block text-xs text-slate-400">{s.categoryName} · {vnd(s.rate)}/1000</span></span>
                  </button>
                ))}
                {quickResults.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">Không tìm thấy dịch vụ nào.</p>}
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <label className="lbl !text-[15px] !font-bold text-slate-800">Chọn nền tảng</label>
          {openMenu === "platform" && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMenu(null)} />}
          <button type="button" onClick={() => setOpenMenu(openMenu === "platform" ? null : "platform")} className="relative z-10 flex h-[56px] w-full items-center gap-3 rounded-2xl bg-slate-100 px-4 text-left transition hover:bg-slate-200/70">
            <PlatformIcon platform={platform} />
            <span className="flex-1 text-[15px] font-semibold text-slate-800">{PLATFORMS[platform] || platform}</span>
            <ChevUD />
          </button>
          {openMenu === "platform" && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {platformList.map((p) => (
                <button key={p} type="button" onClick={() => pickPlatform(p)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 ${p === platform ? "bg-brand-50" : ""}`}>
                  <PlatformIcon platform={p} size={32} />
                  <span className="flex-1 text-sm font-semibold text-slate-800">{PLATFORMS[p] || p}</span>
                  <span className="text-xs text-slate-400">{services.filter((s) => s.platform === p).length} dịch vụ</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <label className="lbl !text-[15px] !font-bold text-slate-800">Chọn dịch vụ</label>
          {openMenu === "cat" && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMenu(null)} />}
          <button type="button" onClick={() => setOpenMenu(openMenu === "cat" ? null : "cat")} className="relative z-10 flex h-[56px] w-full items-center gap-3 rounded-2xl bg-slate-100 px-4 text-left transition hover:bg-slate-200/70">
            <PlatformIcon platform={platform} />
            <span className="flex-1 truncate text-[15px] font-semibold text-slate-800">{categories.find((c) => c.id === catId)?.name || "Chọn dịch vụ"}</span>
            <ChevUD />
          </button>
          {openMenu === "cat" && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {catsOfPlatform.map((c) => (
                <button key={c.id} type="button" onClick={() => pickCategory(c)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 ${c.id === catId ? "bg-brand-50" : ""}`}>
                  <PlatformIcon platform={c.platform} size={32} />
                  <span className="flex-1 text-sm font-semibold text-slate-800">{c.name}</span>
                  <span className="text-xs text-slate-400">{services.filter((s) => s.categoryId === c.id).length} máy chủ</span>
                </button>
              ))}
              {catsOfPlatform.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">Nền tảng này chưa có dịch vụ.</p>}
            </div>
          )}
        </div>
        <div className="relative">
          <label className="lbl !text-[15px] !font-bold text-slate-800">Chọn máy chủ</label>
          {openMenu === "svc" && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMenu(null)} />}
          <button type="button" onClick={() => setOpenMenu(openMenu === "svc" ? null : "svc")} className="relative z-10 flex w-full items-start gap-3 rounded-2xl bg-slate-100 px-4 py-3.5 text-left transition hover:bg-slate-200/70">
            {service ? (
              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-2.5">
                  <IdBadge id={service.id} />
                  <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-slate-800">{service.name}</span>
                </span>
                <span className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white">{perUnitVnd(service.rate)}</span>
                  {service.refill && <span className="rounded-lg bg-teal-100 px-2.5 py-1 text-xs font-bold text-teal-700">Có bảo hành</span>}
                  {service.dripfeed && <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">Thả nhỏ giọt</span>}
                  {service.avgTime && <span className="rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">{service.avgTime}</span>}
                </span>
              </span>
            ) : <span className="flex-1 py-1.5 text-[15px] text-slate-400">Chọn máy chủ...</span>}
            <ChevUD />
          </button>
          {openMenu === "svc" && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {inCat.map((s) => (
                <button key={s.id} type="button" onClick={() => pickService(s)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 ${s.id === service?.id ? "bg-brand-50" : ""}`}>
                  <IdBadge id={s.id} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{s.name}</span>
                  <span className="shrink-0 text-xs font-bold text-emerald-600">{perUnitVnd(s.rate)}</span>
                </button>
              ))}
              {inCat.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">Chưa có máy chủ nào.</p>}
            </div>
          )}
        </div>
        {service && (
          <div className="grid grid-cols-2 gap-3">
            <InfoCell label="Mã gói" value={String(service.id)} tone="bg-emerald-100 text-emerald-600" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"><path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" /><path d="M3 7l9 4.5L21 7" /><path d="M12 11.5v10" /></svg>} />
            <InfoCell label="Giá 1 tương tác" value={perUnitVnd(service.rate)} tone="bg-blue-100 text-blue-600" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 6.5v11" /><path d="M15 8.8c-.6-.8-1.7-1.2-3-1.2-1.7 0-3 .9-3 2.2 0 2.9 6 1.5 6 4.3 0 1.3-1.3 2.2-3 2.2-1.3 0-2.4-.5-3-1.3" /></svg>} />
            <InfoCell label="Mua tối thiểu" value={num(service.min)} tone="bg-orange-100 text-orange-500" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>} />
            <InfoCell label="Mua tối đa" value={num(service.max)} tone="bg-amber-100 text-amber-500" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z" /></svg>} />
          </div>
        )}
        {service?.description && (
          <div className="rounded-2xl border border-slate-200/80 p-5">
            <div className="mb-2 text-[13px] font-bold uppercase tracking-wider text-slate-500">Mô tả máy chủ:</div>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{service.description}</p>
          </div>
        )}
        <div className="relative rounded-[20px] border-2 border-dashed border-slate-300/70 px-5 pb-6 pt-9 sm:px-7">
          <div className="absolute -top-[13px] left-5 flex items-center gap-7 bg-white px-2 dark:bg-[#101a2e] sm:left-6">
            {[{ v: false, t: "1 link" }, { v: true, t: "Nhiều link" }].map((o) => (
              <button key={o.t} type="button" onClick={() => setMultiOn(o.v)} aria-pressed={multiOn === o.v} className="flex items-center gap-2.5">
                <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-full transition ${multiOn === o.v ? "bg-brand-500" : "border-2 border-slate-300 bg-white hover:border-slate-400"}`}>{multiOn === o.v && <span className="h-2 w-2 rounded-full bg-white" />}</span>
                <span className={`text-[15px] font-medium ${multiOn === o.v ? "text-slate-900" : "text-slate-500"}`}>{o.t}</span>
              </button>
            ))}
          </div>
          <label className="lbl !text-[15px] !font-bold text-slate-700">Link cần tăng</label>
          {multiOn ? (
            <div className="relative">
              <textarea className="inp w-full font-mono !text-[13px] leading-relaxed !pr-20" name="links" required rows={4} placeholder={"Mỗi dòng 1 link:\nhttps://...\nhttps://..."} value={multiLinks} onChange={(e) => setMultiLinks(e.target.value)} />
              <span className="absolute right-2 top-2 flex gap-1.5">
                <PasteIconBtn onClick={pasteLink} />
                {multiLinks.trim() && (
                  <button type="button" title="Xoá hết" aria-label="Xoá hết" onClick={() => setMultiLinks("")} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:text-rose-600">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                  </button>
                )}
              </span>
            </div>
          ) : (
            <div className="relative">
              <input className="inp w-full !h-[52px] !rounded-[14px] !text-[15px] !pr-12" name="link" required placeholder="https://... (link công khai, không cần mật khẩu)" value={link} onChange={(e) => setLink(e.target.value)} />
              <span className="absolute right-2 top-1/2 -translate-y-1/2"><PasteIconBtn onClick={pasteLink} /></span>
            </div>
          )}
        </div>
        {pasteMsg && <p className="text-xs text-slate-400">{pasteMsg}</p>}
        {!multiOn && linkMismatch && <p className="text-xs font-medium text-amber-600">Link này có vẻ không thuộc {PLATFORMS[service!.platform] || service!.platform} — kiểm tra lại dịch vụ đã chọn nhé.</p>}
        <div>
          <label className="lbl">Số lượng {multiOn && <span className="text-brand-600 font-semibold">(cho mỗi link)</span>}</label>
          <div className="flex gap-3">
            <input className="inp flex-1 !h-[52px] !rounded-[14px] !text-[15px]" name="quantity" type="number" required min={service?.min} max={service?.max} value={qty || ""} onChange={(e) => setQty(parseInt(e.target.value) || 0)} />
            <div className="flex h-[52px] min-w-[104px] items-center justify-center rounded-[14px] bg-[linear-gradient(120deg,rgb(var(--b700)),rgb(var(--b500)))] px-4 text-base font-bold text-white shadow-md shadow-brand-600/25">{vnd(shownCharge)}</div>
          </div>
          {service && <p className="mt-1.5 text-[13px] text-slate-400">Tối thiểu: {num(service.min)} - Tối đa: {num(service.max)}</p>}
          {qtyChips.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {qtyChips.map((n) => (
                <button type="button" key={n} onClick={() => setQty(n)} className={`btn-sm rounded-full font-semibold ${qty === n ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{num(n)}</button>
              ))}
            </div>
          )}
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
              <option value="like">Thích</option>
              <option value="love">Yêu thích</option>
              <option value="haha">Haha</option>
              <option value="wow">Wow</option>
              <option value="sad">Buồn</option>
              <option value="angry">Phẫn nộ</option>
              <option value="like|love|haha">Trộn: Thích + Yêu thích + Haha</option>
            </select>
          </div>
        )}
        {service && /watch|giờ xem|xem phút/i.test(service.name) && (
          <div>
            <label className="lbl">Số phút mỗi lượt xem</label>
            <input className="inp" name="minutes" type="number" min={1} placeholder="Vd: 30" />
          </div>
        )}
        {service?.dripfeed && (
          <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/50 p-4">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" name="dripfeed" value="1" checked={dripOn} onChange={(e) => setDripOn(e.target.checked)} className="w-4 h-4 accent-[#4680ff]" />
              <span className="font-semibold text-slate-800 text-sm">Thả nhỏ giọt</span>
              <span className="text-xs text-slate-400">— chia tổng số lượng thành nhiều lượt thả đều theo thời gian, nhìn tự nhiên hơn</span>
            </label>
            {dripOn && (
              <div className="grid grid-cols-2 gap-3 mt-3.5">
                <div>
                  <label className="lbl">Số lượt thả</label>
                  <input className="inp" name="runs" type="number" min={2} max={100} value={dripRuns} onChange={(e) => setDripRuns(parseInt(e.target.value) || 2)} />
                </div>
                <div>
                  <label className="lbl">Cách nhau (phút)</label>
                  <input className="inp" name="interval" type="number" min={5} max={1440} value={dripInterval} onChange={(e) => setDripInterval(parseInt(e.target.value) || 60)} />
                </div>
                <p className="col-span-2 text-xs text-slate-500 leading-relaxed">
                  {qty > 0 && dripRuns > 0 ? (
                    <>Mỗi lượt khoảng <b>{num(Math.floor(qty / dripRuns))}</b> (lượt đầu cộng phần dư), tổng thời gian thả ≈ <b>{num(dripRuns * dripInterval)} phút</b>. Mỗi lượt phải ≥ {num(service.min)} theo giới hạn dịch vụ.</>
                  ) : "Nhập số lượng và số lượt để xem lịch thả."}
                </p>
              </div>
            )}
          </div>
        )}
        <div>
          <label className="lbl">Mã giảm giá (nếu có)</label>
          <input className="inp uppercase" name="promoCode" placeholder="VD: SALE10" autoComplete="off" />
          <p className="mt-1 text-xs text-slate-400">Mã hợp lệ sẽ được giảm trực tiếp vào tiền đơn khi đặt.</p>
        </div>
        <div>
          <label className="lbl !text-[17px] !font-bold text-slate-800">Ghi chú:</label>
          <textarea className="w-full rounded-2xl border-0 bg-slate-100 px-5 py-4 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-white/5" name="note" rows={3} placeholder="Nhập ghi chú nếu cần" />
        </div>
        <div className="space-y-4 pt-1">
          <div>
            <div className="flex items-center gap-3.5">
              <button type="button" role="switch" aria-checked={schedOn} aria-label="Đặt lịch chạy" onClick={() => setSchedOn(!schedOn)} className={`relative h-9 w-16 shrink-0 rounded-full border transition-colors ${schedOn ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"}`}>
                <span className={`absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-full shadow transition-all ${schedOn ? "left-[33px] bg-white" : "left-1 bg-slate-400"}`} />
              </button>
              <span className="text-[17px] font-bold text-slate-800">Đặt lịch chạy</span>
            </div>
            {schedOn && (
              <div className="mt-3 pl-[52px] sm:pl-[76px]">
                <input type="hidden" name="schedule" value="1" />
                <input className="inp" type="datetime-local" name="scheduleAt" required value={schedAt} onChange={(e) => setSchedAt(e.target.value)} />
                <p className="mt-1.5 text-xs text-slate-400">Đơn tự đặt vào thời gian bạn chọn, tiền trừ khi đơn chạy.</p>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-3.5">
              <button type="button" role="switch" aria-checked={loopOn} aria-label="Đặt hàng lặp lại" onClick={() => setLoopOn(!loopOn)} className={`relative h-9 w-16 shrink-0 rounded-full border transition-colors ${loopOn ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"}`}>
                <span className={`absolute top-1/2 h-7 w-7 -translate-y-1/2 rounded-full shadow transition-all ${loopOn ? "left-[33px] bg-white" : "left-1 bg-slate-400"}`} />
              </button>
              <span className="text-[17px] font-bold text-slate-800">Đặt hàng lặp lại</span>
            </div>
            {loopOn && (
              <div className="mt-3 grid grid-cols-2 gap-3 pl-[52px] sm:pl-[76px]">
                <input type="hidden" name="loop" value="1" />
                <div>
                  <label className="lbl">Số lần lặp</label>
                  <input className="inp" type="number" name="loopTimes" min={2} max={50} value={loopTimes} onChange={(e) => setLoopTimes(parseInt(e.target.value) || 2)} />
                </div>
                <div>
                  <label className="lbl">Mỗi lần cách nhau (phút)</label>
                  <input className="inp" type="number" name="loopInterval" min={5} max={10080} value={loopInterval} onChange={(e) => setLoopInterval(parseInt(e.target.value) || 60)} />
                </div>
                <p className="col-span-2 text-xs leading-relaxed text-slate-500">Tổng dự kiến <b>{vnd(shownCharge * (loopTimes || 0))}</b> cho {num(loopTimes || 0)} lần — tiền trừ dần mỗi lần đơn chạy, thiếu tiền gói sẽ tự dừng.</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-[26px] border border-[#d9e6fd] bg-[#eaf1fe] px-4 py-4 dark:border-white/10 dark:bg-white/5 sm:gap-4 sm:px-5 sm:py-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#d3e4ff] text-brand-600 dark:bg-white/10 sm:h-14 sm:w-14">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 sm:h-7 sm:w-7"><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M3 5.5V18a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Z" /><circle cx="17" cy="15" r="1.15" fill="currentColor" stroke="none" /></svg>
          </span>
          <span className="min-w-[136px] flex-1">
            <span className="block whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-slate-600 sm:text-[13px]">Tổng thanh toán</span>
            <span className="block whitespace-nowrap text-[22px] font-extrabold leading-tight text-brand-600 sm:text-[28px]">{vnd(shownCharge)}{multiOn && orderCount === 0 && <span className="text-sm font-semibold text-slate-400"> / link</span>}</span>
          </span>
          <button type="submit" disabled={notEnough} className="ml-auto shrink-0 rounded-[18px] bg-brand-500 px-5 py-3 text-base font-semibold text-white shadow-md shadow-brand-500/30 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:px-7 sm:py-3.5 sm:text-lg">Đặt hàng</button>
        </div>
        {notEnough && <p className="-mt-2 text-right text-xs font-medium text-rose-600">Chưa đủ số dư cho đơn này — nạp thêm để đặt hàng.</p>}
      </form>
      <div className="card p-6 lg:col-span-2 lg:sticky lg:top-24">
        {service ? (
          <div>
            <div className="flex items-center justify-center gap-2.5">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className="text-slate-500"><path d="M12 3.5 14.9 9.4l6.5.9-4.7 4.6 1.1 6.5L12 18.3l-5.8 3.1 1.1-6.5L2.6 10.3l6.5-.9L12 3.5Z" /></svg>
              <span className="text-[32px] font-extrabold leading-none text-slate-800">{service.id}</span>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <PlatformBrandIcon platform={service.platform} />
              <p className="min-w-0 flex-1 text-center text-[17px] font-medium leading-snug text-slate-800">{service.name}</p>
              <span className="w-10 shrink-0" />
            </div>
            {discount > 0 && (
              <p className="mt-4 flex items-center justify-center gap-2 text-[15px] text-slate-700">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#f59e0b"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z" /></svg>
                Bạn đang được giảm {discount}% theo cấp bậc
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#f59e0b"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z" /></svg>
              </p>
            )}
            <div className="mt-6">
              <div className="mb-2 text-[15px] font-bold text-slate-700">Thời gian trung bình</div>
              <div className="rounded-xl border border-slate-200 px-4 py-3.5 text-[15px] text-slate-500">{service.avgTime || "—"}</div>
            </div>
            <div className="mt-5 space-y-3.5 rounded-2xl border-2 border-dashed border-slate-200 p-5">
              <DetailLine icon={<span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-emerald-500"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>}>
                Link mẫu: {EXAMPLE_LINK[service.platform] || "Link công khai"}
              </DetailLine>
              <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-slate-400"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>}>
                Thời gian bắt đầu: Ngay lập tức
              </DetailLine>
              <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M12 3v3" /><path d="M5.6 5.6l2.2 2.2" /><path d="M18.4 5.6l-2.2 2.2" /><path d="M8 21h8" /><path d="M12 6a6.5 6.5 0 0 0-4 11.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A6.5 6.5 0 0 0 12 6z" /></svg>}>
                Tối thiểu/Tối đa: {num(service.min)}/{num(service.max)}
              </DetailLine>
              <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" /><path d="M21 3v5h-5" /></svg>}>
                Bảo hành: {service.refill ? "Có bảo hành" : "Không bảo hành"}
              </DetailLine>
              <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="text-slate-400"><path d="M12 2.5 21 7v10l-9 4.5L3 17V7z" /><path d="M3 7l9 4.5L21 7" /><path d="M12 11.5v10" /></svg>}>
                Số lượng đơn này: {num(qty || 0)}{multiOn ? ` / link${orderCount > 0 ? ` × ${num(orderCount)} link` : ""}` : ""}
              </DetailLine>
              {(schedOn || loopOn) && (
                <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-slate-400"><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>}>
                  Chế độ: {loopOn ? `Đặt hàng lặp lại ×${num(loopTimes || 0)} lần, mỗi ${num(loopInterval || 0)} phút` : `Đặt lịch chạy${schedAt ? ` lúc ${schedAt.replace("T", " ")}` : ""}`}
                </DetailLine>
              )}
              {service.notice && (
                <div className="pt-1">
                  <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 3.5 22 20H2z" stroke="#f59e0b" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 10v4.2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="17" r="1.25" fill="#fff" /></svg>}>
                    <span className="font-semibold">Lưu ý:</span>
                  </DetailLine>
                  <p className="mt-1.5 whitespace-pre-line pl-8 text-[15px] leading-relaxed text-slate-700">{service.notice}</p>
                </div>
              )}
            </div>
            {balance !== undefined && (
              <div className={`mt-5 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${notEnough ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                Số dư ví: <b>{vnd(balance)}</b>
                {notEnough ? <> — còn thiếu <b>{vnd(shownCharge - balance)}</b>. <Link href="/dashboard/nap-tien" className="font-bold underline">Nạp thêm ngay</Link></> : <> — sau đơn này còn <b>{vnd(balance - shownCharge)}</b>.</>}
              </div>
            )}
          </div>
        ) : <p className="text-sm text-slate-400">Chưa có dịch vụ nào đang bán.</p>}
      </div>
    </div>
  );
}
/* ---------- Đặt hàng loạt (bulk orders): dán nhiều dòng, xem trước tổng tiền rồi đặt tất cả ---------- */
export function BulkOrderForm({ services, discount, balance, action }: {
  services: ServiceDTO[];
  discount: number;
  balance: number;
  action: (formData: FormData) => void;
}) {
  const [text, setText] = useState("");
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const parsed = useMemo(() => {
    return text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).slice(0, 60).map((line, i) => {
      const parts = line.split("|").map((p) => p.trim());
      const sid = parseInt(parts[0] || "0");
      const link = parts[1] || "";
      const qty = parseInt(parts[2] || "0");
      const svc = byId.get(sid);
      let error = "";
      if (parts.length < 3 || !sid || !link || !qty) error = "Sai định dạng";
      else if (!svc) error = `Không có dịch vụ ID ${sid}`;
      else if (qty < svc.min) error = `Số lượng < tối thiểu ${num(svc.min)}`;
      else if (qty > svc.max) error = `Số lượng > tối đa ${num(svc.max)}`;
      const charge = svc && !error ? Math.round(Math.ceil((svc.rate * qty) / 1000) * (1 - discount / 100)) : 0;
      return { n: i + 1, sid, link, qty, svc, error, charge };
    });
  }, [text, byId, discount]);
  const valid = parsed.filter((p) => !p.error);
  const total = valid.reduce((s, p) => s + p.charge, 0);
  const notEnough = total > balance;
  return (
    <form action={action} className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      <div className="card p-6 lg:col-span-3">
        <label className="lbl">Danh sách đơn — mỗi dòng một đơn, định dạng: <code className="font-mono text-brand-700">id dịch vụ | link | số lượng</code></label>
        <textarea className="inp font-mono !text-[13px] leading-relaxed" name="bulk" rows={12} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"1 | https://facebook.com/trangcanhan | 1000\n6 | https://tiktok.com/@kenhcuaban | 5000\n# dòng bắt đầu bằng # là ghi chú, được bỏ qua"} />
        <p className="text-xs text-slate-400 mt-2">Tối đa 50 dòng/lần. ID dịch vụ xem ở trang Bảng giá dịch vụ. Dòng lỗi được bỏ qua, các dòng đúng vẫn đặt bình thường.</p>
        <button type="submit" disabled={valid.length === 0 || notEnough} className="btn-primary w-full mt-4 !py-3 disabled:opacity-50">
          {valid.length === 0 ? "Nhập ít nhất 1 dòng hợp lệ" : notEnough ? "Chưa đủ số dư" : `Đặt ${valid.length} đơn — tổng ${vnd(total)}`}
        </button>
      </div>
      <div className="card p-6 lg:col-span-2 lg:sticky lg:top-24">
        <div className="font-bold text-slate-900 mb-3">Xem trước</div>
        {parsed.length === 0 ? (
          <p className="text-sm text-slate-400">Chưa có dòng nào. Dán danh sách vào ô bên trái để xem trước từng đơn và tổng tiền.</p>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {parsed.map((p) => (
              <div key={p.n} className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${p.error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50/60"}`}>
                <div className="flex justify-between gap-3">
                  <span className="font-bold">Dòng {p.n} · ID {p.sid || "?"}</span>
                  {p.error ? <span className="font-semibold">{p.error}</span> : <span className="font-bold text-brand-700">{vnd(p.charge)}</span>}
                </div>
                {!p.error && p.svc && <div className="text-slate-500 mt-0.5 truncate">{p.svc.name} — {num(p.qty)} lượt</div>}
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-dashed mt-4 pt-3.5 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Đơn hợp lệ</span><b>{valid.length}/{parsed.length}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Tổng tiền</span><b className="text-brand-700">{vnd(total)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Số dư hiện tại</span><b>{vnd(balance)}</b></div>
          {notEnough && <p className="text-xs text-rose-600 font-medium">Còn thiếu {vnd(total - balance)} — nạp thêm hoặc bỏ bớt dòng.</p>}
        </div>
      </div>
    </form>
  );
}

/* ---------- Wizard cấu hình lần đầu cho panel con ---------- */
export type PanelWizardData = {
  name: string; slug: string; tagline: string; accent: string;
  markup: number; discountMember: number; discountReseller: number; discountAgency: number; discountVip: number;
  apiKey: string; domain: string; support: string;
};

export function PanelSetupWizard({ mode, initial, samples, apiUrl, action }: {
  mode: "create" | "edit";
  initial: PanelWizardData;
  samples: { name: string; rate: number }[];
  apiUrl: string;
  action: (formData: FormData) => void;
}) {
  const [step, setStep] = useState(1);
  const [d, setD] = useState<PanelWizardData>(initial);
  const set = (k: keyof PanelWizardData, v: string | number) => setD((p) => ({ ...p, [k]: v }));
  const accents = [
    { id: "blue", label: "Xanh dương", hex: "#4680ff" }, { id: "violet", label: "Tím", hex: "#7c5cff" },
    { id: "emerald", label: "Xanh lá", hex: "#10b981" }, { id: "orange", label: "Cam", hex: "#f97316" },
    { id: "rose", label: "Hồng", hex: "#f43f5e" }, { id: "teal", label: "Ngọc", hex: "#14b8a6" },
  ];
  const tiers: { k: keyof PanelWizardData; label: string }[] = [
    { k: "discountMember", label: "Thành viên" }, { k: "discountReseller", label: "Đại lý" },
    { k: "discountAgency", label: "Tổng đại lý" }, { k: "discountVip", label: "VIP" },
  ];
  const step1Ok = d.name.trim().length >= 3 && (mode === "edit" || d.slug.trim().length >= 3);
  const panelPrice = (rate: number) => Math.round(rate * (1 + (Number(d.markup) || 0) / 100));
  const tierPrice = (rate: number, disc: number) => Math.round(panelPrice(rate) * (1 - disc / 100));
  const steps = ["Thông tin gian hàng", "Giá & cấp bậc", "Kết nối API", "Tên miền & hỗ trợ", "Hoàn tất"];
  return (
    <form action={action} className="card p-6 sm:p-8">
      <input type="hidden" name="setupDone" value="1" />
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button type="button" onClick={() => i + 1 < step && setStep(i + 1)} className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ${step === i + 1 ? "bg-brand-600 text-white" : i + 1 < step ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-400"}`}>
              <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center ${step === i + 1 ? "bg-white/25" : i + 1 < step ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>{i + 1 < step ? "✓" : i + 1}</span>{s}
            </button>
            {i < steps.length - 1 && <span className="w-5 h-px bg-slate-200 hidden sm:block" />}
          </div>
        ))}
      </div>

      <div className={step === 1 ? "space-y-4 max-w-xl" : "hidden"}>
          <div><label className="lbl">Tên panel / gian hàng *</label><input className="inp" name="name" required minLength={3} value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Vd: Tăng Tương Tác Pro" /></div>
          <div>
            <label className="lbl">Đường dẫn (slug) {mode === "create" ? "*" : ""}</label>
            {mode === "create" ? (
              <div className="flex items-center gap-2"><span className="text-sm text-slate-400 whitespace-nowrap">/cua-hang/</span><input className="inp" name="slug" required value={d.slug} onChange={(e) => set("slug", e.target.value)} placeholder="tang-tuong-tac-pro" /></div>
            ) : (
              <input className="inp bg-slate-50" value={`/cua-hang/${d.slug}`} readOnly />
            )}
            <p className="text-xs text-slate-400 mt-1.5">Chỉ chữ thường, số và dấu gạch ngang. Không đổi được sau khi tạo.</p>
          </div>
          <div><label className="lbl">Câu giới thiệu</label><input className="inp" name="tagline" maxLength={255} value={d.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Dịch vụ nhanh — bảo hành rõ ràng" /></div>
          <div>
            <label className="lbl">Màu chủ đạo của gian hàng</label>
            <input type="hidden" name="accent" value={d.accent} />
            <div className="flex flex-wrap gap-2">
              {accents.map((a) => (
                <button type="button" key={a.id} onClick={() => set("accent", a.id)} className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium ${d.accent === a.id ? "border-slate-800 bg-slate-50" : "border-slate-200 text-slate-500"}`}>
                  <span className="w-4 h-4 rounded-full" style={{ background: a.hex }} />{a.label}
                </button>
              ))}
            </div>
          </div>
        </div>

      <div className={step === 2 ? "grid grid-cols-1 lg:grid-cols-2 gap-8" : "hidden"}>
          <div className="space-y-4">
            <div>
              <label className="lbl">Phụ phí của panel (%)</label>
              <input className="inp" name="markup" type="number" min={0} max={200} value={d.markup} onChange={(e) => set("markup", parseInt(e.target.value) || 0)} />
              <p className="text-xs text-slate-400 mt-1.5">Cộng trên giá gốc của hệ thống — đây là mặt bằng giá bán của panel và nguồn hoa hồng của bạn.</p>
            </div>
            <div>
              <label className="lbl">Giảm giá theo cấp bậc khách (%)</label>
              <div className="grid grid-cols-2 gap-3">
                {tiers.map((t) => (
                  <div key={t.k}><label className="lbl !mb-1">{t.label}</label><input className="inp" name={t.k} type="number" min={0} max={90} value={d[t.k] as number} onChange={(e) => set(t.k, parseInt(e.target.value) || 0)} /></div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Khách được bạn gán bậc cao hơn sẽ mua rẻ hơn. Phần giảm tính trên giá panel và trừ vào hoa hồng của bạn trước.</p>
            </div>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-5">
            <div className="font-bold text-slate-900 text-sm mb-3">Xem trước giá bán</div>
            <div className="space-y-3">
              {samples.map((s) => (
                <div key={s.name} className="rounded-xl bg-white border border-slate-200 p-3.5">
                  <div className="text-sm font-medium text-slate-700 leading-snug">{s.name}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">Gốc {vnd(s.rate)}</span>
                    <span className="rounded-full bg-brand-50 text-brand-700 px-2 py-1">Panel {vnd(panelPrice(s.rate))}</span>
                    {tiers.filter((t) => (d[t.k] as number) > 0).map((t) => (
                      <span key={t.k} className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-1">{t.label} {vnd(tierPrice(s.rate, d[t.k] as number))}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3">Giá trên 1.000 lượt. Hoa hồng mỗi đơn = tiền khách trả − giá gốc (tối thiểu 0).</p>
          </div>
        </div>

      <div className={step === 3 ? "space-y-4 max-w-xl" : "hidden"}>
          <div>
            <label className="lbl">API URL của web mẹ</label>
            <input className="inp bg-slate-50 font-mono !text-[13px]" value={apiUrl} readOnly />
          </div>
          <div>
            <label className="lbl">API key tài khoản mẹ *</label>
            <input className="inp font-mono !text-[13px]" name="apiKey" value={d.apiKey} onChange={(e) => set("apiKey", e.target.value)} placeholder="Dán API key của tài khoản mẹ" autoComplete="off" />
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Panel con liên kết với web mẹ bằng API key này — mặc định là key của chính tài khoản bạn (lấy tại mục <b>API đại lý</b> trong khu khách hàng). Nếu muốn panel chạy trên một tài khoản mẹ khác (ví dụ tài khoản cấp cao hơn), dán key của tài khoản đó. Hệ thống kiểm tra key ngay khi lưu.</p>
          </div>
      </div>

      <div className={step === 4 ? "space-y-4 max-w-xl" : "hidden"}>
          <div>
            <label className="lbl">Tên miền riêng (tuỳ chọn)</label>
            <input className="inp" name="domain" value={d.domain} onChange={(e) => set("domain", e.target.value)} placeholder="shop.tenmiencuaban.com" />
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">Trỏ bản ghi <b>CNAME</b> của tên miền về máy chủ của hệ thống, gian hàng sẽ chạy ngay trên tên miền của bạn. Chưa có tên miền thì bỏ qua — dùng đường dẫn /cua-hang/{d.slug || "..."} cũng đầy đủ tính năng.</p>
          </div>
          <div>
            <label className="lbl">Liên hệ hỗ trợ của panel</label>
            <input className="inp" name="support" maxLength={255} value={d.support} onChange={(e) => set("support", e.target.value)} placeholder="Vd: Zalo 0901 234 567 hoặc https://t.me/hotrocuaban" />
            <p className="text-xs text-slate-400 mt-1.5">Hiện ở gian hàng để khách của panel liên hệ bạn trực tiếp khi cần.</p>
          </div>
        </div>

      <div className={step === 5 ? "max-w-xl" : "hidden"}>
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
            <div className="font-bold text-emerald-800">Sẵn sàng mở bán</div>
            <ul className="mt-2.5 text-sm text-emerald-700 space-y-1.5">
              <li>— Gian hàng: <b>/cua-hang/{d.slug || "..."}</b>{d.domain ? <> và tên miền <b>{d.domain}</b></> : ""}</li>
              <li>— Liên kết web mẹ bằng API key <b className="font-mono">{d.apiKey ? `${d.apiKey.slice(0, 6)}••••••` : "(chưa nhập)"}</b></li>
              <li>— Giá bán: giá gốc + {Number(d.markup) || 0}%, giảm thêm theo bậc: Đại lý −{d.discountReseller}%, Tổng đại lý −{d.discountAgency}%, VIP −{d.discountVip}%</li>
              <li>— Khách đăng ký tại gian hàng là khách của bạn; hoa hồng vào ví ngay khi có đơn.</li>
            </ul>
          </div>
          <p className="text-sm text-slate-500 mt-4 leading-relaxed">Sau khi {mode === "create" ? "tạo" : "lưu"}, hãy chia sẻ link gian hàng cho khách. Bạn gán cấp bậc cho từng khách và theo dõi hoa hồng tại Panel Admin của panel.</p>
        </div>

      <div className="flex items-center justify-between mt-9 pt-5 border-t border-dashed">
        <button type="button" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="btn-ghost !px-5 !py-2.5 disabled:opacity-40">Quay lại</button>
        {step < 5 ? (
          <button type="button" onClick={() => setStep(step + 1)} disabled={(step === 1 && !step1Ok) || (step === 3 && !d.apiKey.trim())} className="btn-primary !px-6 !py-2.5 disabled:opacity-50">Tiếp tục</button>
        ) : (
          <button type="submit" className="btn-primary !px-6 !py-2.5">{mode === "create" ? "Tạo panel & mở bán" : "Lưu cấu hình"}</button>
        )}
      </div>
    </form>
  );
}

/* ---------- Giá riêng từng dịch vụ theo cấp bậc (panel con) ---------- */
export function PanelPriceEditor({ services, overrides, action, deleteAction }: {
  services: { id: number; name: string; panelRate: number }[];
  overrides: { id: number; serviceId: number; level: string; price: number }[];
  action: (formData: FormData) => void;
  deleteAction: (formData: FormData) => void;
}) {
  const LEVELS = [
    { k: "MEMBER", label: "Thành viên" },
    { k: "RESELLER", label: "Đại lý" },
    { k: "AGENCY", label: "Tổng đại lý" },
    { k: "VIP", label: "VIP" },
  ] as const;
  const [serviceId, setServiceId] = useState<number>(services[0]?.id || 0);
  const svc = services.find((s) => s.id === serviceId);
  const current = (lv: string) => overrides.find((o) => o.serviceId === serviceId && o.level === lv)?.price;
  const byService = useMemo(() => {
    const m = new Map<number, { name: string; rows: typeof overrides }>();
    for (const o of overrides) {
      const s = services.find((x) => x.id === o.serviceId);
      if (!m.has(o.serviceId)) m.set(o.serviceId, { name: s?.name || `#${o.serviceId}`, rows: [] });
      m.get(o.serviceId)!.rows.push(o);
    }
    return Array.from(m.entries());
  }, [overrides, services]);
  return (
    <div>
      <form action={action} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end" key={serviceId}>
        <div className="md:col-span-2">
          <label className="lbl">Dịch vụ</label>
          <select className="inp" name="serviceId" value={serviceId} onChange={(e) => setServiceId(Number(e.target.value))}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {LEVELS.map((lv) => (
          <div key={lv.k}>
            <label className="lbl">{lv.label}</label>
            <input className="inp" name={`price_${lv.k}`} type="number" min={0} defaultValue={current(lv.k) || ""} placeholder={svc ? String(svc.panelRate) : ""} />
          </div>
        ))}
        <button className="btn-primary !py-2.5">Lưu giá</button>
      </form>
      <p className="text-xs text-slate-400 mt-2">Giá tính trên 1.000 lượt. Ô gợi ý mờ là giá panel chuẩn của dịch vụ (đã gồm markup). Để trống một bậc = bậc đó dùng giá chuẩn kèm % giảm của bậc; điền số = giá cuối cố định cho bậc đó, không giảm thêm.</p>
      {byService.length > 0 && (
        <div className="mt-4 divide-y divide-slate-100 border border-slate-100 rounded-xl">
          {byService.map(([sid, g]) => (
            <div key={sid} className="px-4 py-3">
              <div className="text-sm font-semibold text-slate-800">{g.name}</div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {g.rows.map((o) => (
                  <span key={o.id} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold px-2.5 py-1">
                    {LEVELS.find((l) => l.k === o.level)?.label}: {vnd(o.price)}
                    <form action={deleteAction} className="inline">
                      <input type="hidden" name="id" value={o.id} />
                      <button className="text-brand-400 hover:text-red-500 font-black" title="Xoá giá riêng này">×</button>
                    </form>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Form mua premium ---------- */
export function PremiumBuyForm({ variants, slug, fulfillment, action, fields, note, maxQty = 50 }: {
  variants: { id: number; name: string; price: number; warrantyDays: number; stock: number }[];
  slug: string;
  fulfillment: string;
  action: (formData: FormData) => void;
  fields?: PremiumCustomField[]; // trường tuỳ chỉnh của sản phẩm — có thì thay ô thông tin bàn giao mặc định
  note?: string | null; // hướng dẫn riêng của sản phẩm (hộp xanh phía trên các ô nhập)
  maxQty?: number; // trần số lượng mỗi đơn — lấy từ cấu hình hệ thống
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id);
  const [qty, setQty] = useState(1);
  const v = variants.find((x) => x.id === variantId) || variants[0];
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {variants.map((x) => (
          <button type="button" key={x.id} onClick={() => setVariantId(x.id)}
            className={`text-left rounded-xl border-2 px-3.5 py-3 transition ${x.id === v?.id ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-slate-900 text-[15px]">{x.name}</span>
              <span className="text-brand-700 font-extrabold whitespace-nowrap">{vnd(x.price)}</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {x.warrantyDays ? `Bảo hành ${x.warrantyDays} ngày` : "Không bảo hành"}
              {fulfillment === "AUTO_STOCK" ? (x.stock > 0 ? ` · Còn ${x.stock} trong kho` : " · Hết kho — giao tay") : fulfillment === "API" ? " · Giao qua nhà cung cấp" : " · Giao thủ công"}
            </div>
          </button>
        ))}
      </div>
      <input type="hidden" name="variantId" value={v?.id || ""} />
      <div className="flex items-end justify-between gap-3">
        <div>
          <label className="lbl">Số lượng</label>
          <div className="flex items-stretch h-[46px]">
            <button type="button" aria-label="Giảm số lượng" onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-11 rounded-l-xl border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-50">−</button>
            <input className="w-16 border-y border-slate-300 bg-transparent text-center text-lg font-bold text-slate-900 outline-none" name="quantity" type="number" min={1} max={maxQty} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
            <button type="button" aria-label="Tăng số lượng" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="w-11 rounded-r-xl border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-50">+</button>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Tổng tiền</div>
          <div className="text-2xl font-extrabold text-brand-700">{vnd((v?.price || 0) * qty)}</div>
        </div>
      </div>
      {note && (
        <div className="rounded-xl bg-sky-50 border border-sky-100 px-4 py-3 text-sm text-sky-900 leading-relaxed">{note}</div>
      )}
      {fields && fields.length > 0 ? (
        <div className="space-y-3.5">
          {fields.map((f, i) => (
            <div key={i}>
              <label className="lbl">{f.label}{f.required ? " *" : ""}</label>
              {f.type === "textarea" ? (
                <textarea className="inp" name={`cf_${i}`} rows={3} required={f.required} placeholder={f.placeholder || ""} />
              ) : f.type === "select" ? (
                <select className="inp" name={`cf_${i}`} required={f.required} defaultValue="">
                  <option value="" disabled>-- Chọn --</option>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input className="inp" name={`cf_${i}`} required={f.required} placeholder={f.placeholder || ""} />
              )}
            </div>
          ))}
        </div>
      ) : (fulfillment === "MANUAL" || fulfillment === "API") && (
        <div>
          <label className="lbl">Email / tài khoản của bạn để bàn giao *</label>
          <input className="inp" name="buyerInfo" required placeholder="Vd: email nhận gói / tài khoản cần nâng cấp" />
          <p className="text-xs text-slate-400 mt-1.5">{fulfillment === "API" ? "Thông tin này được gửi kèm đơn sang nhà cung cấp để bàn giao gói." : "Gói này được nâng cấp trực tiếp lên tài khoản của bạn — chỉ cần email, không cần mật khẩu."}</p>
        </div>
      )}
      {!fields?.length && fulfillment === "AUTO_STOCK" && (
        <div>
          <label className="lbl">Ghi chú (tuỳ chọn)</label>
          <input className="inp" name="buyerInfo" placeholder="Email nhận tài khoản (mặc định dùng email tài khoản của bạn)" />
        </div>
      )}
      <div>
        <label className="lbl">Mã giảm giá (nếu có)</label>
        <input className="inp uppercase" name="promoCode" placeholder="VD: SALE10" autoComplete="off" />
      </div>
      <button className="btn-primary w-full !py-3">Mua ngay bằng số dư</button>
    </form>
  );
}

/** Trình soạn TRƯỜNG TUỲ CHỈNH cho sản phẩm premium (admin): mỗi sản phẩm định nghĩa
 *  các ô khách phải điền khi mua — nhãn, kiểu ô, bắt buộc hay không, gợi ý, lựa chọn. */
export function PremiumFieldsEditor({ initial }: { initial: PremiumCustomField[] }) {
  const [rows, setRows] = useState<PremiumCustomField[]>(initial);
  const set = (i: number, patch: Partial<PremiumCustomField>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div>
      <input type="hidden" name="customFields" value={JSON.stringify(rows.filter((r) => r.label.trim()))} />
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2.5">
            <div className="flex gap-2">
              <input className="inp flex-1" placeholder="Nhãn trường — vd: Gmail cần nâng cấp" value={r.label}
                onChange={(e) => set(i, { label: e.target.value })} />
              <button type="button" className="btn-ghost btn-sm !text-rose-600 shrink-0"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Xoá</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className="inp" value={r.type} onChange={(e) => set(i, { type: e.target.value as PremiumCustomField["type"] })}>
                <option value="text">Ô nhập 1 dòng</option>
                <option value="textarea">Ô nhập nhiều dòng</option>
                <option value="select">Danh sách chọn</option>
              </select>
              <input className="inp" placeholder="Chữ gợi ý trong ô" value={r.placeholder || ""}
                onChange={(e) => set(i, { placeholder: e.target.value })} />
            </div>
            {r.type === "select" && (
              <input className="inp" placeholder="Các lựa chọn, cách nhau dấu phẩy — vd: Android, iOS, TV"
                value={(r.options || []).join(", ")}
                onChange={(e) => set(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            )}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="w-4 h-4" checked={r.required} onChange={(e) => set(i, { required: e.target.checked })} />
              Bắt buộc khách điền
            </label>
          </div>
        ))}
      </div>
      {rows.length < 8 && (
        <button type="button" className="btn-ghost btn-sm mt-3"
          onClick={() => setRows((rs) => [...rs, { label: "", type: "text", required: true }])}>
          + Thêm trường tuỳ chỉnh
        </button>
      )}
    </div>
  );
}

export function CopyBtn({ text, label = "Sao chép" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" title={label} aria-label={label}
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className={`inline-flex items-center justify-center w-[30px] h-[30px] shrink-0 rounded-lg border transition ${ok ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-white text-slate-500 hover:text-brand-600 hover:border-brand-300"}`}>
      {ok ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  );
}

/* ---------- Thẻ đơn Premium + popup chi tiết (kiểu thatim: Sản phẩm đã mua) ---------- */
export type PremiumOrderCard = {
  id: number; code: string; name: string; variant: string; desc: string;
  total: number; quantity: number; status: string; statusLabel: string; statusCls: string;
  created: string; updated: string; delivery: string; buyerInfo: string; warrantyUntil: string | null;
};
const dtf = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour12: false });

export function PremiumOrderCards({ orders }: { orders: PremiumOrderCard[] }) {
  const [sel, setSel] = useState<PremiumOrderCard | null>(null);
  return (
    <div className="space-y-4">
      {orders.map((o) => (
        <div key={o.id} className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-black text-slate-900">#{o.id}</span>
              <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${o.statusCls}`}>{o.statusLabel}</span>
              <span className="text-xs text-slate-400">{dtf(o.created)}</span>
            </div>
            <div className="text-sm text-slate-500">Tổng tiền <b className="text-brand-600 text-base">{vnd(o.total)}</b></div>
          </div>
          <div className="border-t border-slate-100 mt-4 pt-4 flex items-center gap-3.5">
            <span className="w-11 h-11 shrink-0 rounded-xl bg-brand-600 text-white flex items-center justify-center font-black">{o.name.charAt(0).toUpperCase()}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-slate-900 truncate">{o.name} ({o.variant})</div>
              {o.desc && <div className="text-[13px] text-slate-500 truncate">{o.desc}</div>}
            </div>
            <button type="button" onClick={() => setSel(o)} className="btn-dark shrink-0">Chi tiết</button>
          </div>
        </div>
      ))}
      {sel && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSel(null)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between sticky top-0">
              <div className="font-bold">Chi tiết đơn hàng #{sel.id}</div>
              <button type="button" onClick={() => setSel(null)} className="text-sm font-semibold bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5">Đóng</button>
            </div>
            <div className="p-5 space-y-6">
              <section>
                <div className="font-bold text-slate-900 mb-2.5">Thông tin đơn hàng</div>
                <dl className="text-sm space-y-1.5">
                  <div className="flex gap-2"><dt className="text-slate-400 w-36 shrink-0">Tên sản phẩm:</dt><dd className="font-medium text-slate-800">{sel.name} ({sel.variant})</dd></div>
                  <div className="flex gap-2"><dt className="text-slate-400 w-36 shrink-0">Số tiền thanh toán:</dt><dd className="font-medium text-slate-800">{vnd(sel.total)}</dd></div>
                  <div className="flex gap-2"><dt className="text-slate-400 w-36 shrink-0">Trạng thái:</dt><dd className="font-medium text-slate-800">{sel.statusLabel}</dd></div>
                  <div className="flex gap-2"><dt className="text-slate-400 w-36 shrink-0">Ghi chú:</dt><dd className="font-medium text-slate-800 whitespace-pre-wrap">{sel.buyerInfo || "."}</dd></div>
                </dl>
              </section>
              <section>
                <div className="font-bold text-slate-900 mb-2.5">Thông tin tài khoản:</div>
                {sel.delivery ? (
                  <div>
                    <textarea readOnly value={sel.delivery} rows={Math.min(8, sel.delivery.split("\n").length + 1)} className="inp font-mono !text-[13px] w-full" />
                    <div className="mt-2"><CopyBtn text={sel.delivery} label="Sao chép" /></div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{sel.status === "PENDING" ? "Đơn đang chờ giao." : "Chưa có nội dung giao."}</p>
                )}
                {(sel.status === "DELIVERED" || sel.status === "COMPLETED") && sel.warrantyUntil && new Date(sel.warrantyUntil) > new Date() && (
                  <form action={warrantyAction} className="mt-4 flex flex-wrap gap-2">
                    <input type="hidden" name="orderId" value={sel.id} />
                    <input className="inp flex-1 min-w-[200px]" name="note" placeholder="Mô tả lỗi để yêu cầu bảo hành" />
                    <button className="btn-ghost btn-sm !py-2.5">Yêu cầu bảo hành</button>
                  </form>
                )}
              </section>
              <section>
                <div className="font-bold text-slate-900 mb-2.5">Lịch sử xử lý</div>
                <ol className="relative border-l-2 border-slate-100 ml-1.5 space-y-4">
                  {(sel.status === "DELIVERED" || sel.status === "COMPLETED") && (
                    <li className="pl-4 relative"><span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-emerald-500" /><div className="text-sm font-semibold text-slate-800">Đã giao hàng</div><div className="text-xs text-slate-400">{dtf(sel.updated)}</div></li>
                  )}
                  <li className="pl-4 relative"><span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-slate-300" /><div className="text-sm font-semibold text-slate-800">Đã tạo đơn hàng</div><div className="text-xs text-slate-400">{dtf(sel.created)}</div></li>
                </ol>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Tabs tài liệu API (kiểu thatim: danh sách action bên trái, Parameters + Example Response bên phải) ---------- */
export type ApiActionDoc = { id: string; label: string; params: [string, string, string][]; response: string };
export function ApiTabs({ actions }: { actions: ApiActionDoc[] }) {
  const [active, setActive] = useState(actions[0]?.id);
  const cur = actions.find((a) => a.id === active) || actions[0];
  if (!cur) return null;
  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-4 items-start">
      <div className="card p-2 flex md:flex-col gap-1 overflow-x-auto">
        {actions.map((a) => (
          <button key={a.id} type="button" onClick={() => setActive(a.id)} className={`text-left whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${a.id === cur.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{a.label}</button>
        ))}
      </div>
      <div className="card p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Parameters</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead className="border-b border-slate-200"><tr><th className="th !py-2">Parameter</th><th className="th !py-2">Type</th><th className="th !py-2">Description</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {cur.params.map((p) => (
                <tr key={p[0]}><td className="td font-mono text-xs font-bold text-brand-700">{p[0]}</td><td className="td text-slate-500 text-xs">{p[1]}</td><td className="td text-slate-600">{p[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-6 mb-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Example Response</div>
          <CopyBtn text={cur.response} label="Copy" />
        </div>
        <div className="text-xs font-mono text-slate-400 mb-1">response.json</div>
        <pre className="bg-slate-950 text-slate-100 rounded-2xl p-4 text-xs sm:text-[13px] overflow-x-auto">{cur.response}</pre>
      </div>
    </div>
  );
}
