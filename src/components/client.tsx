"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { num, PLATFORMS, type PremiumCustomField } from "@/lib/format";
import { I, PLATFORM_COLORS } from "@/components/ui";
import { OrderSupportActions } from "@/components/order-support-actions";
import { warrantyAction } from "@/app/actions/user";
import { useLang } from "@/components/lang";
import { addToCart } from "@/components/cart";

export type ServiceDTO = {
  id: number; name: string; description: string | null; notice?: string | null; rate: number; min: number; max: number;
  avgTime: string | null; refill: boolean; dripfeed?: boolean; categoryId: number; categoryName: string; platform: string;
};

/* ---------- Khám phá dịch vụ (trang công khai + trang đặt đơn) ---------- */
const StarBtn = ({ active, onClick }: { active: boolean; onClick: () => void }) => {
  const { t } = useLang();
  return (
  <button type="button" onClick={onClick} title={active ? t("Bỏ yêu thích") : t("Đánh dấu yêu thích")}
    className={`p-1.5 rounded-lg transition ${active ? "text-amber-500" : "text-slate-300 hover:text-amber-400"}`}>
    <svg width="17" height="17" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.5 14.9 9.4l6.5.9-4.7 4.6 1.1 6.5L12 18.3l-5.8 3.1 1.1-6.5L2.6 10.3l6.5-.9L12 3.5Z" /></svg>
  </button>
  );
};

export function ServicesExplorer({ services, orderMode = false, registerHref }: { services: ServiceDTO[]; orderMode?: boolean; registerHref?: string }) {
  const { t, td, m } = useLang();
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
              <span className="block text-xs text-slate-400">{platCounts.get(p) || 0} {t("dịch vụ")}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mb-5 text-sm text-slate-500">
        {t("Tổng cộng:")} <b className="text-slate-800">{services.length} {t("dịch vụ")}</b> · {catCount} {t("danh mục")} · {platforms.length} {t("nền tảng")}
        {platform !== "all" && <button type="button" onClick={() => setPlatform("all")} className="ml-3 font-semibold text-brand-600">{t("Xem tất cả")}</button>}
      </div>
      <div className="flex flex-col xl:flex-row gap-3 mb-5">
        <input className="inp xl:max-w-xs" placeholder={t("Tìm dịch vụ... (vd: follow TikTok)")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2 items-center xl:ml-auto">
          <select className="inp !w-auto !py-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} title={t("Sắp xếp")}>
            <option value="default">{t("Mặc định")}</option>
            <option value="asc">{t("Giá tăng dần")}</option>
            <option value="desc">{t("Giá giảm dần")}</option>
          </select>
          <select className="inp !w-auto !py-2 text-sm" value={range} onChange={(e) => setRange(e.target.value as typeof range)} title={t("Khoảng giá / 1000")}>
            <option value="all">{t("Mọi mức giá")}</option>
            <option value="u10">{t("Dưới 10.000đ")}</option>
            <option value="m10">{t("10.000 – 50.000đ")}</option>
            <option value="o50">{t("Trên 50.000đ")}</option>
          </select>
          <button onClick={() => setFavOnly((v) => !v)} className={`btn-sm rounded-full font-semibold ${favOnly ? "bg-amber-500 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{t("Yêu thích (")}{favs.length})</button>
          <div className="flex rounded-full border border-slate-200 bg-white p-0.5">
            <button onClick={() => setView("table")} className={`btn-sm rounded-full font-semibold ${view === "table" ? "bg-brand-600 text-white" : "text-slate-500"}`}>{t("Bảng")}</button>
            <button onClick={() => setView("grid")} className={`btn-sm rounded-full font-semibold ${view === "grid" ? "bg-brand-600 text-white" : "text-slate-500"}`}>{t("Lưới")}</button>
          </div>
        </div>
      </div>
      {view === "table" ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr><th className="th">ID</th><th className="th">{t("Dịch vụ")}</th><th className="th">{t("Giá / 1000")}</th><th className="th">Min – Max</th><th className="th">{t("Thời gian")}</th><th className="th"></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="td text-slate-400 font-mono text-xs">{s.id}</td>
                  <td className="td">
                    <div className="font-medium text-slate-800">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.categoryName}{s.refill ? t(" · Có bảo hành bù") : ""}</div>
                  </td>
                  <td className="td font-bold text-brand-700">{m(s.rate)}</td>
                  <td className="td text-slate-500">{num(s.min)} – {num(s.max)}</td>
                  <td className="td text-slate-500">{s.avgTime || "—"}</td>
                  <td className="td text-right whitespace-nowrap">
                    <StarBtn active={favs.includes(s.id)} onClick={() => toggleFav(s.id)} />
                    <Link href={orderHref(s.id)} className="btn-primary btn-sm">{t("Đặt ngay")}</Link>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6} className="td text-center text-slate-400 py-8">{t("Không tìm thấy dịch vụ phù hợp")}</td></tr>}
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
                  <div className="text-xs text-slate-400 mt-0.5">{s.categoryName}{td(` · ID ${s.id}`)}</div>
                </div>
                <StarBtn active={favs.includes(s.id)} onClick={() => toggleFav(s.id)} />
              </div>
              <div className="flex items-end justify-between mt-4">
                <div>
                  <div className="text-xl font-extrabold text-brand-700">{m(s.rate)}</div>
                  <div className="text-[11px] text-slate-400">{t("/ 1000 lượt")}</div>
                </div>
                <div className="text-right text-xs text-slate-500 space-y-0.5">
                  <div>{num(s.min)} – {num(s.max)}</div>
                  <div>{s.avgTime || t("Xử lý nhanh")}{s.refill ? t(" · Có bù") : ""}</div>
                </div>
              </div>
              <Link href={orderHref(s.id)} className="btn-primary btn-sm w-full mt-4 !py-2.5">{t("Đặt ngay")}</Link>
            </div>
          ))}
          {list.length === 0 && <div className="card p-10 text-center text-slate-400 sm:col-span-2 xl:col-span-3">{t("Không tìm thấy dịch vụ phù hợp")}</div>}
        </div>
      )}
      <p className="text-xs text-slate-400 mt-3">{t("Hiển thị")} {list.length}/{services.length} {t("dịch vụ. Giá đã gồm VAT; cấp Đại lý / Tổng đại lý / VIP được chiết khấu thêm tự động khi đặt đơn. Bấm ngôi sao để ghim dịch vụ hay dùng.")}</p>
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
  const { t } = useLang();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] text-slate-500">{t(label)}</span>
        <span className="block truncate text-[15px] font-bold text-slate-800">{value}</span>
      </span>
    </div>
  );
}

/* Nút dán link dạng icon, nằm bên trong khung input của form đặt đơn */
function PasteIconBtn({ onClick }: { onClick: () => void }) {
  const { t } = useLang();
  return (
    <button type="button" title={t("Dán link")} aria-label={t("Dán link")} onClick={onClick} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 hover:text-brand-600">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6" /><path d="M9 16h4" /></svg>
    </button>
  );
}

/** Tiêu đề mục đánh số dùng chung cho các trang đặt hàng kiểu Telegram
 *  (trang đặt đơn SMM; PremiumBuyForm + telegram-order dùng bản tương tự). */
function OrderPanelTitle({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-[15px] font-extrabold text-brand-700">{n}</span>
      <span className="text-[17px] font-extrabold text-slate-900">{label}</span>
    </div>
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
  const { t, td, m } = useLang();
  const [catId, setCatId] = useState<number>(preselect ? services.find((s) => s.id === preselect)?.categoryId || categories[0]?.id : categories[0]?.id);
  const inCat = services.filter((s) => s.categoryId === catId);
  const [serviceId, setServiceId] = useState<number>(preselect || inCat[0]?.id);
  const [qty, setQty] = useState<number>(initialQty || 1000);
  const [dripOn, setDripOn] = useState(false);
  const [dripRuns, setDripRuns] = useState(10);
  const [dripInterval, setDripInterval] = useState(60);
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
  const sumRow = "flex items-center justify-between gap-3 px-4 py-3.5";
  return (
    <form action={action} className="space-y-4 sm:space-y-5" id="order-form">
      {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
      <input type="hidden" name="serviceId" value={service?.id || ""} />
      <section className="card p-3.5 sm:p-5">
        <OrderPanelTitle n={1} label={t("Chọn dịch vụ")} />
        <div className="mt-4 space-y-4">
        <div className="relative">
          <label className="lbl !text-[15px] !font-bold text-slate-800">{t("Tìm nhanh dịch vụ")}</label>
          {openMenu === "quick" && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMenu(null)} />}
          <button type="button" onClick={() => setOpenMenu(openMenu === "quick" ? null : "quick")} className="relative z-10 flex h-[52px] w-full items-center gap-3 rounded-xl border border-slate-200/70 bg-[#f3f5f9] px-4 text-left transition hover:bg-slate-200/70">
            {service ? <><IdBadge id={service.id} /><span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-800">{service.name}</span></> : <span className="flex-1 text-[15px] text-slate-400">{t("Chọn dịch vụ...")}</span>}
            <ChevUD />
          </button>
          {openMenu === "quick" && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              <input autoFocus className="inp mb-1.5" placeholder={t("Gõ tên hoặc mã dịch vụ...")} value={quickQ} onChange={(e) => setQuickQ(e.target.value)} />
              <div className="max-h-64 overflow-auto">
                {quickResults.map((s) => (
                  <button key={s.id} type="button" onClick={() => pickService(s)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 ${s.id === service?.id ? "bg-brand-50" : ""}`}>
                    <IdBadge id={s.id} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{s.name}</span><span className="block text-xs text-slate-400">{s.categoryName} · {m(s.rate)}/1000</span></span>
                  </button>
                ))}
                {quickResults.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">{t("Không tìm thấy dịch vụ nào.")}</p>}
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <label className="lbl !text-[15px] !font-bold text-slate-800">{t("Chọn nền tảng")}</label>
          {openMenu === "platform" && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMenu(null)} />}
          <button type="button" onClick={() => setOpenMenu(openMenu === "platform" ? null : "platform")} className="relative z-10 flex h-[52px] w-full items-center gap-3 rounded-xl border border-slate-200/70 bg-[#f3f5f9] px-4 text-left transition hover:bg-slate-200/70">
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
                  <span className="text-xs text-slate-400">{services.filter((s) => s.platform === p).length} {t("dịch vụ")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <label className="lbl !text-[15px] !font-bold text-slate-800">{t("Chọn dịch vụ")}</label>
          {openMenu === "cat" && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMenu(null)} />}
          <button type="button" onClick={() => setOpenMenu(openMenu === "cat" ? null : "cat")} className="relative z-10 flex h-[52px] w-full items-center gap-3 rounded-xl border border-slate-200/70 bg-[#f3f5f9] px-4 text-left transition hover:bg-slate-200/70">
            <PlatformIcon platform={platform} />
            <span className="flex-1 truncate text-[15px] font-semibold text-slate-800">{categories.find((c) => c.id === catId)?.name || t("Chọn dịch vụ")}</span>
            <ChevUD />
          </button>
          {openMenu === "cat" && (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {catsOfPlatform.map((c) => (
                <button key={c.id} type="button" onClick={() => pickCategory(c)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 ${c.id === catId ? "bg-brand-50" : ""}`}>
                  <PlatformIcon platform={c.platform} size={32} />
                  <span className="flex-1 text-sm font-semibold text-slate-800">{c.name}</span>
                  <span className="text-xs text-slate-400">{services.filter((s) => s.categoryId === c.id).length} {t("máy chủ")}</span>
                </button>
              ))}
              {catsOfPlatform.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">{t("Nền tảng này chưa có dịch vụ.")}</p>}
            </div>
          )}
        </div>
        <div className="relative">
          <label className="lbl !text-[15px] !font-bold text-slate-800">{t("Chọn máy chủ")}</label>
          {openMenu === "svc" && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setOpenMenu(null)} />}
          <button type="button" onClick={() => setOpenMenu(openMenu === "svc" ? null : "svc")} className="relative z-10 flex w-full items-start gap-3 rounded-xl border border-slate-200/70 bg-[#f3f5f9] px-4 py-3.5 text-left transition hover:bg-slate-200/70">
            {service ? (
              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-2.5">
                  <IdBadge id={service.id} />
                  <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-slate-800">{service.name}</span>
                </span>
                <span className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white">{perUnitVnd(service.rate)}</span>
                  {service.refill && <span className="rounded-lg bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">{t("Có bảo hành")}</span>}
                  {service.dripfeed && <span className="rounded-lg bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">{t("Thả nhỏ giọt")}</span>}
                  {service.avgTime && <span className="rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600">{service.avgTime}</span>}
                </span>
              </span>
            ) : <span className="flex-1 py-1.5 text-[15px] text-slate-400">{t("Chọn máy chủ...")}</span>}
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
              {inCat.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">{t("Chưa có máy chủ nào.")}</p>}
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
            <div className="mb-2 text-[13px] font-bold uppercase tracking-wider text-slate-500">{t("Mô tả máy chủ:")}</div>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{service.description}</p>
          </div>
        )}
        {service && (
          <div className="space-y-3.5 rounded-2xl border-2 border-dashed border-slate-200 p-5">
            <DetailLine icon={<span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-emerald-500"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>}>
              {t("Link mẫu:")} {t(EXAMPLE_LINK[service.platform] || "Link công khai")}
            </DetailLine>
            <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-slate-400"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>}>
              {t("Thời gian bắt đầu: Ngay lập tức")}
            </DetailLine>
            <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M12 3v3" /><path d="M5.6 5.6l2.2 2.2" /><path d="M18.4 5.6l-2.2 2.2" /><path d="M8 21h8" /><path d="M12 6a6.5 6.5 0 0 0-4 11.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A6.5 6.5 0 0 0 12 6z" /></svg>}>
              {t("Tối thiểu/Tối đa:")} {num(service.min)}/{num(service.max)}
            </DetailLine>
            <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" /><path d="M21 3v5h-5" /></svg>}>
              {t("Bảo hành:")} {service.refill ? t("Có bảo hành") : t("Không bảo hành")}
            </DetailLine>
            <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-slate-400"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>}>
              {t("Thời gian trung bình")}: {service.avgTime || "—"}
            </DetailLine>
            {service.notice && (
              <div className="pt-1">
                <DetailLine icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="#f59e0b"><path d="M12 3.5 22 20H2z" stroke="#f59e0b" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 10v4.2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="17" r="1.25" fill="#fff" /></svg>}>
                  <span className="font-semibold">{t("Lưu ý:")}</span>
                </DetailLine>
                <p className="mt-1.5 whitespace-pre-line pl-8 text-[15px] leading-relaxed text-slate-700">{service.notice}</p>
              </div>
            )}
          </div>
        )}
        {service && discount > 0 && (
          <p className="flex items-center gap-2 text-[15px] text-slate-700">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="#f59e0b"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z" /></svg>
            {t("Bạn đang được giảm")} {discount}{t("% theo cấp bậc")}
            <svg width="17" height="17" viewBox="0 0 24 24" fill="#f59e0b"><path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5z" /></svg>
          </p>
        )}
        </div>
      </section>
      <section className="card p-3.5 sm:p-5">
        <OrderPanelTitle n={2} label={t("Thông tin đơn")} />
        <div className="mt-4 space-y-4">
        <div className="relative rounded-[20px] border-2 border-dashed border-slate-300/70 px-5 pb-6 pt-9 sm:px-7">
          <div className="absolute -top-[13px] left-5 flex items-center gap-7 bg-white px-2 dark:bg-[#101a2e] sm:left-6">
            {[{ v: false, t: "1 link" }, { v: true, t: "Nhiều link" }].map((o) => (
              <button key={o.t} type="button" onClick={() => setMultiOn(o.v)} aria-pressed={multiOn === o.v} className="flex items-center gap-2.5">
                <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-full transition ${multiOn === o.v ? "bg-brand-500" : "border-2 border-slate-300 bg-white hover:border-slate-400"}`}>{multiOn === o.v && <span className="h-2 w-2 rounded-full bg-white" />}</span>
                <span className={`text-[15px] font-medium ${multiOn === o.v ? "text-slate-900" : "text-slate-500"}`}>{t(o.t)}</span>
              </button>
            ))}
          </div>
          <label className="lbl !text-[15px] !font-bold text-slate-700">{t("Link cần tăng")}</label>
          {multiOn ? (
            <div className="relative">
              <textarea className="inp w-full font-mono !text-[13px] leading-relaxed !pr-20" name="links" required rows={4} placeholder={t("Mỗi dòng 1 link:\nhttps://...\nhttps://...")} value={multiLinks} onChange={(e) => setMultiLinks(e.target.value)} />
              <span className="absolute right-2 top-2 flex gap-1.5">
                <PasteIconBtn onClick={pasteLink} />
                {multiLinks.trim() && (
                  <button type="button" title={t("Xoá hết")} aria-label={t("Xoá hết")} onClick={() => setMultiLinks("")} className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:text-rose-600">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                  </button>
                )}
              </span>
            </div>
          ) : (
            <div className="relative">
              <input className="inp w-full !h-[52px] !rounded-[14px] !text-[15px] !pr-12" name="link" required placeholder={t("https://... (link công khai, không cần mật khẩu)")} value={link} onChange={(e) => setLink(e.target.value)} />
              <span className="absolute right-2 top-1/2 -translate-y-1/2"><PasteIconBtn onClick={pasteLink} /></span>
            </div>
          )}
        </div>
        {pasteMsg && <p className="text-xs text-slate-400">{t(pasteMsg)}</p>}
        {!multiOn && linkMismatch && <p className="text-xs font-medium text-amber-600">{t("Link này có vẻ không thuộc")} {PLATFORMS[service!.platform] || service!.platform}{t(" — kiểm tra lại dịch vụ đã chọn nhé.")}</p>}
        <div>
          <label className="lbl">{t("Số lượng")} {multiOn && <span className="text-brand-600 font-semibold">{t("(cho mỗi link)")}</span>}</label>
          <div className="flex gap-3">
            <input className="inp flex-1 !h-[52px] !rounded-[14px] !text-[15px]" name="quantity" type="number" required min={service?.min} max={service?.max} value={qty || ""} onChange={(e) => setQty(parseInt(e.target.value) || 0)} />
            <div className="flex h-[52px] min-w-[104px] items-center justify-center rounded-[14px] bg-[linear-gradient(120deg,rgb(var(--b700)),rgb(var(--b500)))] px-4 text-base font-bold text-white shadow-md shadow-brand-600/25">{m(shownCharge)}</div>
          </div>
          {service && <p className="mt-1.5 text-[13px] text-slate-400">{t("Tối thiểu:")} {num(service.min)} {t("- Tối đa:")} {num(service.max)}</p>}
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
            <label className="lbl">{t("Nội dung bình luận (mỗi dòng 1 bình luận)")}</label>
            <textarea className="inp" name="comments" rows={4} placeholder={t("Hay quá shop ơi\nChất lượng tuyệt vời...")} />
            <p className="text-xs text-slate-400 mt-1.5">{t("Số lượng đơn nên bằng số dòng bình luận bạn nhập.")}</p>
          </div>
        )}
        {service && /cảm xúc|reaction/i.test(service.name) && (
          <div>
            <label className="lbl">{t("Loại cảm xúc")}</label>
            <select className="inp" name="reaction" defaultValue="like">
              <option value="like">{t("Thích")}</option>
              <option value="love">{t("Yêu thích")}</option>
              <option value="haha">Haha</option>
              <option value="wow">Wow</option>
              <option value="sad">{t("Buồn")}</option>
              <option value="angry">{t("Phẫn nộ")}</option>
              <option value="like|love|haha">{t("Trộn: Thích + Yêu thích + Haha")}</option>
            </select>
          </div>
        )}
        {service && /watch|giờ xem|xem phút/i.test(service.name) && (
          <div>
            <label className="lbl">{t("Số phút mỗi lượt xem")}</label>
            <input className="inp" name="minutes" type="number" min={1} placeholder={t("Vd: 30")} />
          </div>
        )}
        {service?.dripfeed && (
          <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/50 p-4">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" name="dripfeed" value="1" checked={dripOn} onChange={(e) => setDripOn(e.target.checked)} className="w-4 h-4 accent-[#4680ff]" />
              <span className="font-semibold text-slate-800 text-sm">{t("Thả nhỏ giọt")}</span>
              <span className="text-xs text-slate-400">{t("— chia tổng số lượng thành nhiều lượt thả đều theo thời gian, nhìn tự nhiên hơn")}</span>
            </label>
            {dripOn && (
              <div className="grid grid-cols-2 gap-3 mt-3.5">
                <div>
                  <label className="lbl">{t("Số lượt thả")}</label>
                  <input className="inp" name="runs" type="number" min={2} max={100} value={dripRuns} onChange={(e) => setDripRuns(parseInt(e.target.value) || 2)} />
                </div>
                <div>
                  <label className="lbl">{t("Cách nhau (phút)")}</label>
                  <input className="inp" name="interval" type="number" min={5} max={1440} value={dripInterval} onChange={(e) => setDripInterval(parseInt(e.target.value) || 60)} />
                </div>
                <p className="col-span-2 text-xs text-slate-500 leading-relaxed">
                  {qty > 0 && dripRuns > 0 ? (
                    <>{t("Mỗi lượt khoảng")} <b>{num(Math.floor(qty / dripRuns))}</b> {t("(lượt đầu cộng phần dư), tổng thời gian thả ≈")} <b>{num(dripRuns * dripInterval)} {t("phút")}</b>{t(". Mỗi lượt phải ≥")} {num(service.min)} {t("theo giới hạn dịch vụ.")}</>
                  ) : t("Nhập số lượng và số lượt để xem lịch thả.")}
                </p>
              </div>
            )}
          </div>
        )}
        <div>
          <label className="lbl">{t("Mã giảm giá (nếu có)")}</label>
          <input className="inp uppercase" name="promoCode" placeholder={t("VD: SALE10")} autoComplete="off" />
          <p className="mt-1 text-xs text-slate-400">{t("Mã hợp lệ sẽ được giảm trực tiếp vào tiền đơn khi đặt.")}</p>
        </div>
        <div>
          <label className="lbl !text-[17px] !font-bold text-slate-800">{t("Ghi chú:")}</label>
          <textarea className="w-full rounded-2xl border-0 bg-slate-100 px-5 py-4 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-white/5" name="note" rows={3} placeholder={t("Nhập ghi chú nếu cần")} />
        </div>
        </div>
      </section>
      <section className="card p-5 sm:p-6">
        <div className="text-xl font-extrabold text-slate-900">{t("Tóm tắt")}</div>
        {!service && <p className="mt-3 text-sm text-slate-400">{t("Chưa có dịch vụ nào đang bán.")}</p>}
        <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
          <div className={sumRow}><span className="shrink-0 text-[15px] text-slate-500">{t("Dịch vụ")}</span><span className="min-w-0 break-words text-right font-bold text-slate-900">{service ? service.name : "—"}</span></div>
          <div className={sumRow}><span className="text-[15px] text-slate-500">{t("Số lượng")}</span><span className="font-bold text-slate-900">{num(qty || 0)}{multiOn && orderCount > 0 ? ` × ${num(orderCount)} link` : ""}</span></div>
          <div className={sumRow}><span className="text-[15px] text-slate-500">{t("Đơn giá")}</span><span className="font-bold text-slate-900">{service ? `${m(service.rate)}/1000` : "—"}</span></div>
        </div>
        {balance !== undefined && (
          <div className={`mt-4 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${notEnough ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
            {t("Số dư ví:")} <b>{m(balance)}</b>
            {notEnough ? <> {t("— còn thiếu")} <b>{m(shownCharge - balance)}</b>. <Link href="/dashboard/nap-tien" className="font-bold underline">{t("Nạp thêm ngay")}</Link></> : <> {t("— sau đơn này còn")} <b>{m(balance - shownCharge)}</b>.</>}
          </div>
        )}
        {/* Hàng cuối thẻ Tóm tắt: TỔNG CỘNG bên trái + nút ĐẶT HÀNG bên phải
            CÙNG HÀNG — luật chốt của Tín cho trang này (khác trang Telegram). */}
        <div className="mt-5 flex items-center gap-2.5 rounded-[26px] border border-[#d9e6fd] bg-[#eaf1fe] px-3.5 py-3.5 dark:border-white/10 dark:bg-white/5 sm:gap-4 sm:px-5 sm:py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#d3e4ff] text-brand-600 dark:bg-white/10 sm:h-14 sm:w-14">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 sm:h-7 sm:w-7"><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M3 5.5V18a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Z" /><circle cx="17" cy="15" r="1.15" fill="currentColor" stroke="none" /></svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:text-[13px]">{t("Tổng thanh toán")}</span>
            <span className="block whitespace-nowrap text-[19px] font-extrabold leading-tight text-brand-600 sm:text-[28px]">{m(shownCharge)}{multiOn && orderCount === 0 && <span className="text-xs font-semibold text-slate-400 sm:text-sm">{t(" / link")}</span>}</span>
          </span>
          <button type="submit" disabled={notEnough} className="shrink-0 whitespace-nowrap rounded-2xl bg-brand-500 px-4 py-2.5 text-[15px] font-semibold text-white shadow-md shadow-brand-500/30 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-[18px] sm:px-7 sm:py-3.5 sm:text-lg">{t("Đặt hàng")}</button>
        </div>
        {notEnough && <p className="mt-3 text-right text-xs font-medium text-rose-600">{t("Chưa đủ số dư cho đơn này — nạp thêm để đặt hàng.")}</p>}
      </section>
    </form>
  );
}
/* ---------- Đặt hàng loạt (bulk orders): dán nhiều dòng, xem trước tổng tiền rồi đặt tất cả ---------- */
export function BulkOrderForm({ services, discount, balance, action }: {
  services: ServiceDTO[];
  discount: number;
  balance: number;
  action: (formData: FormData) => void;
}) {
  const { t, td, m } = useLang();
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
      if (parts.length < 3 || !sid || !link || !qty) error = t("Sai định dạng");
      else if (!svc) error = `${t("Không có dịch vụ ID")} ${sid}`;
      else if (qty < svc.min) error = `${t("Số lượng < tối thiểu")} ${num(svc.min)}`;
      else if (qty > svc.max) error = `${t("Số lượng > tối đa")} ${num(svc.max)}`;
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
        <label className="lbl">{t("Danh sách đơn — mỗi dòng một đơn, định dạng:")} <code className="font-mono text-brand-700">{t("id dịch vụ | link | số lượng")}</code></label>
        <textarea className="inp font-mono !text-[13px] leading-relaxed" name="bulk" rows={12} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={t("1 | https://facebook.com/trangcanhan | 1000\n6 | https://tiktok.com/@kenhcuaban | 5000\n# dòng bắt đầu bằng # là ghi chú, được bỏ qua")} />
        <p className="text-xs text-slate-400 mt-2">{t("Tối đa 50 dòng/lần. ID dịch vụ xem ở trang Bảng giá dịch vụ. Dòng lỗi được bỏ qua, các dòng đúng vẫn đặt bình thường.")}</p>
      </div>
      <div className="card p-6 lg:col-span-2 lg:sticky lg:top-24">
        <div className="font-bold text-slate-900 mb-3">{t("Xem trước")}</div>
        {parsed.length === 0 ? (
          <div>
            <p className="text-sm text-slate-400">{t("Chưa có dòng nào. Dán danh sách vào ô bên trái để xem trước từng đơn và tổng tiền.")}</p>
            {services.slice(0, 1).length > 0 && (
              <div className="space-y-2.5 mt-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t("Ví dụ kết quả sẽ hiện")}</div>
                {services.slice(0, 1).map((sv) => {
                  const q = Math.min(sv.max, Math.max(sv.min, 1000));
                  const c = Math.round(Math.ceil((sv.rate * q) / 1000) * (1 - discount / 100));
                  return (
                    <div key={sv.id} className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-xs leading-relaxed">
                      <div className="flex justify-between gap-3">
                        <span className="font-bold">{td(`Dòng · ID ${sv.id}`)}</span>
                        <span className="font-bold text-brand-700">{m(c)}</span>
                      </div>
                      <div className="text-slate-500 mt-0.5 truncate">{sv.name} — {num(q)} {t("lượt")}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {parsed.map((p) => (
              <div key={p.n} className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${p.error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50/60"}`}>
                <div className="flex justify-between gap-3">
                  <span className="font-bold">{td(`Dòng ${p.n} · ID ${p.sid || "?"}`)}</span>
                  {p.error ? <span className="font-semibold">{p.error}</span> : <span className="font-bold text-brand-700">{m(p.charge)}</span>}
                </div>
                {!p.error && p.svc && <div className="text-slate-500 mt-0.5 truncate">{p.svc.name} — {num(p.qty)} {t("lượt")}</div>}
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-dashed mt-4 pt-3.5 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">{t("Đơn hợp lệ")}</span><b>{valid.length}/{parsed.length}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">{t("Tổng tiền")}</span><b className="text-brand-700">{m(total)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">{t("Số dư hiện tại")}</span><b>{m(balance)}</b></div>
          {notEnough && <p className="text-xs text-rose-600 font-medium">{t("Còn thiếu")} {m(total - balance)} {t("— nạp thêm hoặc bỏ bớt dòng.")}</p>}
        </div>
        <button type="submit" disabled={valid.length === 0 || notEnough} className="btn-primary w-full mt-4 !py-3 disabled:opacity-50">
          {valid.length === 0 ? t("Nhập ít nhất 1 dòng hợp lệ") : notEnough ? t("Chưa đủ số dư") : <>{t("Đặt")} {valid.length} {t("đơn — tổng")} {m(total)}</>}
        </button>
      </div>
    </form>
  );
}

export type PremiumPromoPreview = { code: string; type: string; value: number; maxDiscount: number; minOrder: number };

/** Công thức flash sale phía client — khớp hệt applyFlashAmount phía server (lib/flash). */
const applyFlashClient = (amount: number, percent: number) =>
  !percent || percent <= 0 ? amount : Math.max(1, Math.round(amount * (1 - Math.min(90, percent) / 100)));

/** Huy hiệu loại giao hàng của gói (Giao nhanh/Giao chậm) — dùng ở thẻ gói
 *  trang chi tiết; trang khách chưa đăng nhập dùng bản tương tự phía server. */
export function DeliveryBadge({ type, t }: { type: "FAST" | "SLOW"; t: (s: string) => string }) {
  return type === "FAST" ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 [&>svg]:h-3 [&>svg]:w-3">
      {I.truck}
      {t("Giao nhanh")}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
      {t("Giao chậm")}
    </span>
  );
}

export function PremiumBuyForm({ variants, slug, fulfillment, action, fields, note, maxQty = 50, backBase, layout, productImage, productColor, belowVariants, promos, flashPct, cartProduct }: {
  variants: { id: number; name: string; price: number; warrantyDays: number; stock: number; delivery?: "FAST" | "SLOW"; soldOut?: boolean; stockQty?: number | null }[];
  slug: string;
  fulfillment: string;
  action: (formData: FormData) => void;
  fields?: PremiumCustomField[]; // trường tuỳ chỉnh của sản phẩm — có thì thay ô thông tin bàn giao mặc định
  note?: string | null; // hướng dẫn riêng của sản phẩm (hộp xanh phía trên các ô nhập)
  maxQty?: number; // trần số lượng mỗi đơn — lấy từ cấu hình hệ thống
  backBase?: string; // gốc đường dẫn trang chi tiết (/premium hoặc /dashboard/premium) để trả về đúng khung khi có lỗi
  layout?: "stacked" | "split"; // split = bố cục shopkey 73/27 (hero 31/69, hộp đặt hàng dính cột phải) — lệnh Tín 2026-11-08 khôi phục, thay bố cục một cột kiểu Telegram của fix5 WS4 (đã gỡ); stacked = dạng cũ ở website con
  productImage?: string | null;
  productColor?: string;
  belowVariants?: React.ReactNode; // khối hiển thị dưới danh sách gói ở cột trái (bố cục split): thông tin / bảo hành / hướng dẫn
  promos?: PremiumPromoPreview[]; // mã giảm giá đang hiệu lực (chỉ để XEM TRƯỚC số tiền giảm trong hộp tóm tắt — server vẫn chốt lại khi đặt đơn)
  flashPct?: number; // % flash sale đang áp cho sản phẩm này (0/không truyền = không có) — hiển thị giá đã giảm + xem trước dòng giảm, server chốt lại khi đặt đơn
  cartProduct?: { id: number; name: string; groups: Record<number, string | null> }; // bật nút thêm vào giỏ (nhóm Telegram không vào giỏ)
}) {
  const { t, td, m } = useLang();
  const [variantId, setVariantId] = useState(() => (variants.find((x) => !x.soldOut) || variants[0])?.id);
  const [qty, setQty] = useState(1);
  const [promoCode, setPromoCode] = useState("");
  const v = variants.find((x) => x.id === variantId) || variants[0];
  const formRef = useRef<HTMLFormElement>(null);
  const cartGroup = cartProduct && v ? cartProduct.groups[v.id] : null;
  const cartable = !!cartProduct && !!v && !(cartGroup || "").startsWith("telegram_");
  const addCurrentToCart = () => {
    if (!cartProduct || !v) return;
    const custom: Record<string, string> = {};
    let buyerInfo: string | null = null;
    const form = formRef.current;
    if (form) {
      (fields || []).forEach((f, i) => {
        const el = form.elements.namedItem(`cf_${i}`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (el && el.value) custom[f.label] = el.value;
      });
      const bi = form.elements.namedItem("buyerInfo") as HTMLInputElement | null;
      if (bi && bi.value) buyerInfo = bi.value;
    }
    addToCart({
      variantId: v.id, productId: cartProduct.id, productName: cartProduct.name, variantName: v.name,
      image: productImage || null, price: v.price, qty,
      custom, buyerInfo,
      stockCap: fulfillment === "AUTO_STOCK" ? (v.stock || 0) : (v.stockQty ?? null),
      delivery: v.delivery ?? null,
      group: cartGroup,
    });
  };

  const total = (v?.price || 0) * qty;
    // Xem trước số tiền giảm — đúng thứ tự server chốt khi đặt đơn: flash sale
    // giảm TRƯỚC trên Tạm tính, mã giảm giá tính trên số tiền ĐÃ trừ flash
    // (công thức checkPromo). Dòng "Giảm giá" trong hộp tóm tắt = flash + mã.
    const afterFlash = applyFlashClient(total, flashPct || 0);
    const promoRow = (promos || []).find((p) => p.code === promoCode.trim().toUpperCase());
    let promoDiscount = 0;
    if (promoRow && afterFlash > 0 && afterFlash >= promoRow.minOrder) {
      promoDiscount = promoRow.type === "PERCENT" ? Math.floor((afterFlash * promoRow.value) / 100) : promoRow.value;
      if (promoRow.type === "PERCENT" && promoRow.maxDiscount > 0) promoDiscount = Math.min(promoDiscount, promoRow.maxDiscount);
      promoDiscount = Math.max(0, Math.min(promoDiscount, afterFlash - 1));
    }
    const discount = (total - afterFlash) + promoDiscount;
    const grandTotal = afterFlash - promoDiscount;
    const infoFields = (
      <>
        {fields && fields.length > 0 ? (
          <div className="space-y-3.5">
            {fields.map((f, i) => (
              <div key={i}>
                <label className="lbl">{f.label}{f.required ? " *" : ""}</label>
                {f.type === "textarea" ? (
                  <textarea className="inp" name={`cf_${i}`} rows={3} required={f.required} placeholder={f.placeholder || ""} />
                ) : f.type === "select" ? (
                  <select className="inp" name={`cf_${i}`} required={f.required} defaultValue="">
                    <option value="" disabled>{t("-- Chọn --")}</option>
                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input className="inp" name={`cf_${i}`} required={f.required} placeholder={f.placeholder || ""} />
                )}
              </div>
            ))}
          </div>
        ) : (fulfillment === "MANUAL" || fulfillment === "API") ? (
          <div>
            <label className="lbl">{t("Email / tài khoản của bạn để bàn giao *")}</label>
            <input className="inp" name="buyerInfo" required placeholder={t("Vd: email nhận gói / tài khoản cần nâng cấp")} />
            <p className="mt-1.5 text-xs text-slate-400">{fulfillment === "API" ? t("Thông tin này được gửi kèm đơn sang nhà cung cấp để bàn giao gói.") : t("Gói này được nâng cấp trực tiếp lên tài khoản của bạn — chỉ cần email, không cần mật khẩu.")}</p>
          </div>
        ) : (
          <div>
            <label className="lbl">{t("Ghi chú (tuỳ chọn)")}</label>
            <input className="inp" name="buyerInfo" placeholder={t("Email nhận tài khoản (mặc định dùng email tài khoản của bạn)")} />
          </div>
        )}
      </>
    );
  if (layout === "split") {
    return (
      <form ref={formRef} action={action} className="flex flex-col gap-8 lg:contents">
        <input type="hidden" name="slug" value={slug} />
        {backBase ? <input type="hidden" name="returnTo" value={`${backBase}/${slug}`} /> : null}
        <input type="hidden" name="variantId" value={v?.id || ""} />
        <div className="order-1 lg:col-start-1">
          <h2 className="text-lg font-extrabold text-slate-900">{t("Chọn gói sản phẩm")}</h2>
          <div className="mt-4 space-y-2.5">
            {variants.map((x) => {
              const selected = x.id === v?.id;
              return (
                <button type="button" key={x.id} disabled={!!x.soldOut} onClick={() => setVariantId(x.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left transition ${x.soldOut ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70" : selected ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-brand-600" : "border-slate-300"}`}>
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
                  </span>
                  {productImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={productImage} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-black text-white" style={{ background: productColor || "#3178fc" }}>{slug.charAt(0).toUpperCase()}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-bold text-slate-900">{x.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {x.warrantyDays ? <>{t("Bảo hành")} {x.warrantyDays} {t("ngày")}</> : t("Không bảo hành")}
                      {fulfillment === "AUTO_STOCK" ? (x.stock > 0 ? <>{t(" · Còn ")}{x.stock}{t(" trong kho")}</> : t(" · Hết kho — giao tay")) : fulfillment === "API" ? t(" · Giao qua nhà cung cấp") : t(" · Giao thủ công")}
                      {x.stockQty != null && fulfillment !== "AUTO_STOCK" && !x.soldOut ? <>{t(" · Còn ")}{x.stockQty}{t(" trong kho")}</> : null}
                    </span>
                    {x.delivery && (
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <DeliveryBadge type={x.delivery} t={t} />
                      </span>
                    )}
                  </span>
                  {fulfillment === "AUTO_STOCK" && x.stock > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xs font-bold text-brand-600 [&>svg]:h-3.5 [&>svg]:w-3.5">
                      {I.truck}
                      {t("Giao ngay")}
                    </span>
                  )}
                  {x.soldOut ? (
                    <span className="shrink-0 font-extrabold text-rose-600">{t("Hết hàng")}</span>
                  ) : flashPct ? (
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-semibold text-slate-400 line-through">{m(x.price)}</span>
                      <span className="block font-extrabold text-rose-600">{m(applyFlashClient(x.price, flashPct))}</span>
                    </span>
                  ) : (
                    <span className="shrink-0 font-extrabold text-rose-600">{m(x.price)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {belowVariants && <div className="order-2 lg:col-start-1">{belowVariants}</div>}
        <div className="card order-3 space-y-4 p-5 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:self-start lg:sticky lg:top-24">
          <div>
            <label className="lbl">{t("Số lượng")}</label>
            <div className="flex h-[46px] items-stretch justify-center lg:justify-start">
              <button type="button" aria-label={t("Giảm số lượng")} onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-11 rounded-l-xl border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-50">−</button>
              <input className="w-16 border-y border-slate-300 bg-transparent text-center text-lg font-bold text-slate-900 outline-none" name="quantity" type="number" min={1} max={maxQty} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
              <button type="button" aria-label={t("Tăng số lượng")} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="w-11 rounded-r-xl border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-50">+</button>
            </div>
          </div>
          {note && <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm leading-relaxed text-brand-900">{note}</div>}
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-400">{t("Thông tin đặt hàng")}</div>
            {infoFields}
          </div>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">
              {t("Bạn có mã giảm giá?")}
              <span className="text-slate-400 transition-transform duration-200 group-open:rotate-180">{I.chevron}</span>
            </summary>
            <input className="inp mt-2 uppercase" name="promoCode" placeholder={t("VD: SALE10")} autoComplete="off" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
          </details>
          <div className="space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-500"><span>{t("Tạm tính")}</span><span className="font-semibold text-slate-700">{m(total)}</span></div>
            {discount > 0 && (
              <div className="flex justify-between font-semibold text-emerald-600"><span>{t("Giảm giá")}</span><span>−{m(discount)}</span></div>
            )}
            <div className="flex items-baseline justify-between border-t border-slate-200/70 pt-2"><span className="font-semibold text-slate-700">{t("Tổng cộng")}</span><span className="text-xl font-extrabold text-rose-600">{m(grandTotal)}</span></div>
          </div>
          <div className="text-xs text-slate-400">
            {fulfillment === "AUTO_STOCK" ? <>{t("Kho hàng:")} {v?.stock || 0} {t("sản phẩm")}</> : fulfillment === "API" ? t("Giao tự động qua nhà cung cấp") : t("Nâng cấp thủ công trên tài khoản của bạn")}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1 !py-3">{t("Đặt hàng ngay")}</button>
            {cartable && <CartDetailBtn onAdd={addCurrentToCart} />}
          </div>
        </div>
      </form>
    );
  }
  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      {backBase ? <input type="hidden" name="returnTo" value={`${backBase}/${slug}`} /> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {variants.map((x) => (
          <button type="button" key={x.id} onClick={() => setVariantId(x.id)}
            className={`text-left rounded-xl border-2 px-3.5 py-3 transition ${x.id === v?.id ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-slate-900 text-[15px]">{x.name}</span>
              <span className="whitespace-nowrap text-right">
                {flashPct ? <span className="mr-1.5 text-xs font-semibold text-slate-400 line-through">{m(x.price)}</span> : null}
                <span className="text-brand-700 font-extrabold">{m(applyFlashClient(x.price, flashPct || 0))}</span>
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {x.warrantyDays ? <>{t("Bảo hành")} {x.warrantyDays} {t("ngày")}</> : t("Không bảo hành")}
              {fulfillment === "AUTO_STOCK" ? (x.stock > 0 ? <>{t(" · Còn ")}{x.stock}{t(" trong kho")}</> : t(" · Hết kho — giao tay")) : fulfillment === "API" ? t(" · Giao qua nhà cung cấp") : t(" · Giao thủ công")}
            </div>
          </button>
        ))}
      </div>
      <input type="hidden" name="variantId" value={v?.id || ""} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="w-full lg:w-auto">
          <label className="lbl">{t("Số lượng")}</label>
          <div className="flex items-stretch h-[46px] justify-center lg:justify-start">
            <button type="button" aria-label={t("Giảm số lượng")} onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-11 rounded-l-xl border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-50">−</button>
            <input className="w-16 border-y border-slate-300 bg-transparent text-center text-lg font-bold text-slate-900 outline-none" name="quantity" type="number" min={1} max={maxQty} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
            <button type="button" aria-label={t("Tăng số lượng")} onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="w-11 rounded-r-xl border border-slate-300 text-xl font-bold text-slate-600 hover:bg-slate-50">+</button>
          </div>
        </div>
        <div className="self-end text-right lg:self-auto">
          <div className="text-xs text-slate-500">{t("Tổng tiền")}</div>
          <div className="text-2xl font-extrabold text-brand-700">{m(applyFlashClient((v?.price || 0) * qty, flashPct || 0))}</div>
        </div>
      </div>
      {note && (
        <div className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-sm text-brand-900 leading-relaxed">{note}</div>
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
                  <option value="" disabled>{t("-- Chọn --")}</option>
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
          <label className="lbl">{t("Email / tài khoản của bạn để bàn giao *")}</label>
          <input className="inp" name="buyerInfo" required placeholder={t("Vd: email nhận gói / tài khoản cần nâng cấp")} />
          <p className="text-xs text-slate-400 mt-1.5">{fulfillment === "API" ? t("Thông tin này được gửi kèm đơn sang nhà cung cấp để bàn giao gói.") : t("Gói này được nâng cấp trực tiếp lên tài khoản của bạn — chỉ cần email, không cần mật khẩu.")}</p>
        </div>
      )}
      {!fields?.length && fulfillment === "AUTO_STOCK" && (
        <div>
          <label className="lbl">{t("Ghi chú (tuỳ chọn)")}</label>
          <input className="inp" name="buyerInfo" placeholder={t("Email nhận tài khoản (mặc định dùng email tài khoản của bạn)")} />
        </div>
      )}
      <div>
        <label className="lbl">{t("Mã giảm giá (nếu có)")}</label>
        <input className="inp uppercase" name="promoCode" placeholder={t("VD: SALE10")} autoComplete="off" />
      </div>
      <div className="flex gap-2">
        <button className="btn-primary flex-1 !py-3">{t("Mua ngay bằng số dư")}</button>
        {cartable && <CartDetailBtn onAdd={addCurrentToCart} />}
      </div>
    </form>
  );
}

/** Trình soạn TRƯỜNG TUỲ CHỈNH cho sản phẩm premium (admin): mỗi sản phẩm định nghĩa
 *  các ô khách phải điền khi mua — nhãn, kiểu ô, bắt buộc hay không, gợi ý, lựa chọn. */
export function PremiumFieldsEditor({ initial }: { initial: PremiumCustomField[] }) {
  const { t } = useLang();
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
              <input className="inp flex-1" placeholder={t("Nhãn trường — vd: Gmail cần nâng cấp")} value={r.label}
                onChange={(e) => set(i, { label: e.target.value })} />
              <button type="button" className="btn-ghost btn-sm !text-rose-600 shrink-0"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>{t("Xoá")}</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className="inp" value={r.type} onChange={(e) => set(i, { type: e.target.value as PremiumCustomField["type"] })}>
                <option value="text">{t("Ô nhập 1 dòng")}</option>
                <option value="textarea">{t("Ô nhập nhiều dòng")}</option>
                <option value="select">{t("Danh sách chọn")}</option>
              </select>
              <input className="inp" placeholder={t("Chữ gợi ý trong ô")} value={r.placeholder || ""}
                onChange={(e) => set(i, { placeholder: e.target.value })} />
            </div>
            {r.type === "select" && (
              <input className="inp" placeholder={t("Các lựa chọn, cách nhau dấu phẩy — vd: Android, iOS, TV")}
                value={(r.options || []).join(", ")}
                onChange={(e) => set(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
            )}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="w-4 h-4" checked={r.required} onChange={(e) => set(i, { required: e.target.checked })} />
              {t("Bắt buộc khách điền")}
            </label>
          </div>
        ))}
      </div>
      {rows.length < 8 && (
        <button type="button" className="btn-ghost btn-sm mt-3"
          onClick={() => setRows((rs) => [...rs, { label: "", type: "text", required: true }])}>
          {t("+ Thêm trường tuỳ chỉnh")}
        </button>
      )}
    </div>
  );
}

export function CopyBtn({ text, label = "Sao chép" }: { text: string; label?: string }) {
  const { t } = useLang();
  const [ok, setOk] = useState(false);
  return (
    <button type="button" title={t(label)} aria-label={t(label)}
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

/** Ô hiện API key: mặc định che giữa (6 ký tự đầu + 4 ký tự cuối), nút con mắt
 *  để hiện/ẩn toàn bộ + nút sao chép (luôn chép bản đầy đủ). Thuần trình bày. */
export function ApiKeyReveal({ value }: { value: string }) {
  const { t } = useLang();
  const [show, setShow] = useState(false);
  const masked = value.length > 12 ? `${value.slice(0, 6)}••••••••••${value.slice(-4)}` : "••••••••••";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input className="inp min-w-0 flex-1 font-mono" readOnly value={show ? value : masked} onFocus={(e) => e.target.select()} />
      <button type="button" title={show ? t("Ẩn bớt") : t("Hiện toàn bộ key")} aria-label={show ? t("Ẩn bớt") : t("Hiện toàn bộ key")}
        onClick={() => setShow((v) => !v)}
        className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-brand-300 hover:text-brand-600">
        {show ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.5 9.5 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-3.79 4.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20M9.88 9.88a3 3 0 1 0 4.24 4.24" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
      <CopyBtn text={value} />
    </div>
  );
}

/* ---------- Thẻ đơn Premium + popup chi tiết (kiểu thatim: Sản phẩm đã mua) ---------- */
export type PremiumOrderCard = {
  id: number; code: string; name: string; variant: string; desc: string;
  total: number; quantity: number; status: string; statusLabel: string; statusCls: string;
  created: string; updated: string; delivery: string; deliveryType: "FAST" | "SLOW"; buyerInfo: string; warrantyUntil: string | null;
};
const dtf = (iso: string) => new Date(iso).toLocaleString("vi-VN", { hour12: false });

export function PremiumOrderCards({ orders }: { orders: PremiumOrderCard[] }) {
  const { t, td, m } = useLang();
  const [sel, setSel] = useState<PremiumOrderCard | null>(null);
  return (
    <div className="space-y-3.5">
      {orders.map((o) => (
        <div key={o.id} className="card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-sm font-black text-slate-900">{o.code}</span>
              <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${o.statusCls}`}>{t(o.statusLabel)}</span>
              <DeliveryBadge type={o.deliveryType} t={t} />
            </div>
            <div className="font-black text-slate-900">{m(o.total)}</div>
          </div>
          <div className="mt-3.5 border-t border-slate-100 pt-3.5">
            <div className="flex items-center gap-3.5">
              <span className="w-11 h-11 shrink-0 rounded-xl bg-brand-600 text-white flex items-center justify-center font-black">{o.name.charAt(0).toUpperCase()}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 truncate">{o.name} ({o.variant})</div>
                {o.desc && <div className="text-[13px] text-slate-500 truncate">{o.desc}</div>}
                <div className="mt-0.5 text-xs text-slate-400">{t("Số lượng")}: {o.quantity}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-400">{dtf(o.created)}</span>
              <button type="button" onClick={() => setSel(o)} className="btn-dark btn-sm shrink-0">{t("Chi tiết")}</button>
            </div>
          </div>
        </div>
      ))}
      {sel && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSel(null)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Thẻ header kiểu Telegram: mã đơn mono + sao chép + trạng thái + ngày tạo */}
            <div className="sticky top-0 z-10 border-b border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-brand-600">{t("Chi tiết đơn hàng")}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-lg font-black leading-tight text-slate-900">{sel.code}</span>
                    <CopyBtn text={sel.code} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${sel.statusCls}`}>{t(sel.statusLabel)}</span>
                    <span className="text-xs text-slate-400">{dtf(sel.created)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setSel(null)} aria-label={t("Đóng")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-rose-600 text-white transition hover:bg-rose-500">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="p-4 space-y-4 sm:p-5 sm:space-y-5">
              <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <OrderPanelTitle n={1} label={t("Thông tin đơn hàng")} />
                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Tên sản phẩm:")}</span><span className="min-w-0 break-words text-right font-bold text-slate-900">{sel.name} ({sel.variant})</span></div>
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Số lượng")}</span><span className="font-bold text-slate-900">{sel.quantity}</span></div>
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Số tiền thanh toán:")}</span><span className="font-bold text-slate-900">{m(sel.total)}</span></div>
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Trạng thái:")}</span><span className="font-bold text-slate-900">{t(sel.statusLabel)}</span></div>
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Loại giao hàng")}</span><span className="font-bold text-slate-900">{sel.deliveryType === "FAST" ? t("Giao nhanh") : t("Giao chậm")}</span></div>
                  {sel.warrantyUntil && (
                    <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Bảo hành đến")}</span><span className="font-bold text-slate-900">{dtf(sel.warrantyUntil)}</span></div>
                  )}
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5"><span className="shrink-0 text-[15px] text-slate-500">{t("Ghi chú:")}</span><span className="min-w-0 whitespace-pre-wrap break-words text-right font-bold text-slate-900">{sel.buyerInfo || "."}</span></div>
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <OrderPanelTitle n={2} label={t("Thông tin tài khoản:")} />
                <div className="mt-4">
                  {sel.delivery ? (
                    <div>
                      <textarea readOnly value={sel.delivery} rows={Math.min(8, sel.delivery.split("\n").length + 1)} className="inp font-mono !text-[13px] w-full" />
                      <div className="mt-2"><CopyBtn text={sel.delivery} label="Sao chép" /></div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">{sel.status === "PENDING" ? t("Đơn đang chờ giao.") : t("Chưa có nội dung giao.")}</p>
                  )}
                  {(sel.status === "DELIVERED" || sel.status === "COMPLETED") && sel.warrantyUntil && new Date(sel.warrantyUntil) > new Date() && (
                    <form action={warrantyAction} className="mt-4 flex flex-wrap gap-2">
                      <input type="hidden" name="orderId" value={sel.id} />
                      <input className="inp flex-1 min-w-[200px]" name="note" placeholder={t("Mô tả lỗi để yêu cầu bảo hành")} />
                      <button className="btn-ghost btn-sm !py-2.5">{t("Yêu cầu bảo hành")}</button>
                    </form>
                  )}
                </div>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <OrderPanelTitle n={3} label={t("Lịch sử xử lý")} />
                <ol className="relative ml-1.5 mt-4 space-y-4 border-l-2 border-slate-100">
                  {(sel.status === "DELIVERED" || sel.status === "COMPLETED") && (
                    <li className="pl-4 relative"><span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-emerald-500" /><div className="text-sm font-semibold text-slate-800">{t("Đã giao hàng")}</div><div className="text-xs text-slate-400">{dtf(sel.updated)}</div></li>
                  )}
                  <li className="pl-4 relative"><span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-slate-300" /><div className="text-sm font-semibold text-slate-800">{t("Đã tạo đơn hàng")}</div><div className="text-xs text-slate-400">{dtf(sel.created)}</div></li>
                </ol>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <div className="text-[17px] font-extrabold text-slate-900">{t("Hỗ trợ đơn này")}</div>
                <OrderSupportActions code={sel.code} category="premium" />
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Tabs tài liệu API (kiểu thatim: danh sách action bên trái, Parameters + Example Response bên phải) ---------- */
export type ApiActionDoc = { id: string; label: string; params: [string, string, string][]; response: string; curl?: string; note?: string };
export function ApiTabs({ actions }: { actions: ApiActionDoc[] }) {
  const { t } = useLang();
  const [active, setActive] = useState(actions[0]?.id);
  const cur = actions.find((a) => a.id === active) || actions[0];
  if (!cur) return null;
  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-4 items-start">
      <div className="card p-2 flex md:flex-col gap-1 overflow-x-auto min-w-0 max-w-full">
        {actions.map((a) => (
          <button key={a.id} type="button" onClick={() => setActive(a.id)} className={`text-left whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${a.id === cur.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{a.label}</button>
        ))}
      </div>
      <div className="card p-5 min-w-0">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{t("Tham số")}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead className="border-b border-slate-200"><tr><th className="th !py-2">{t("Tham số")}</th><th className="th !py-2">{t("Kiểu")}</th><th className="th !py-2">{t("Mô tả")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {cur.params.map((p) => (
                <tr key={p[0]}><td className="td font-mono text-xs font-bold text-brand-700">{p[0]}</td><td className="td text-slate-500 text-xs">{p[1]}</td><td className="td text-slate-600">{p[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {cur.note && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800">
            <span className="font-bold">{t("Lưu ý")}: </span>{cur.note}
          </div>
        )}
        {cur.curl && (
          <>
            <div className="flex items-center justify-between mt-6 mb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("Ví dụ curl")}</div>
              <CopyBtn text={cur.curl} label="Sao chép" />
            </div>
            <pre className="bg-slate-950 text-slate-100 rounded-2xl p-4 text-xs sm:text-[13px] overflow-x-auto">{cur.curl}</pre>
          </>
        )}
        <div className="flex items-center justify-between mt-6 mb-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("Phản hồi mẫu")}</div>
          <CopyBtn text={cur.response} label="Sao chép" />
        </div>
        <div className="text-xs font-mono text-slate-400 mb-1">response.json</div>
        <pre className="bg-slate-950 text-slate-100 rounded-2xl p-4 text-xs sm:text-[13px] overflow-x-auto">{cur.response}</pre>
      </div>
    </div>
  );
}

/** Nút vuông thêm vào giỏ ở hộp đặt hàng trang chi tiết (kiểu shopkey). */
function CartDetailBtn({ onAdd }: { onAdd: () => void }) {
  const { t } = useLang();
  const [added, setAdded] = useState(false);
  return (
    <button type="button" aria-label={t("Thêm vào giỏ")} title={t("Thêm vào giỏ")}
      onClick={() => { onAdd(); setAdded(true); setTimeout(() => setAdded(false), 1400); }}
      className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center self-center rounded-xl border-2 transition ${added ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-slate-300 text-slate-600 hover:border-brand-500 hover:text-brand-600"}`}>
      {added ? I.check : I.cart}
    </button>
  );
}
