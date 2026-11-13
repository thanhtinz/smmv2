import { RichText } from "@/components/rich-text";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getServerI18n } from "@/lib/lang-server";
import { LiveChat } from "@/components/livechat";
import { getFloatingContacts, type FloatingContact } from "@/lib/contact";

export type FooterBrand = {
  name: string;
  slug?: string;
  tagline?: string | null;
  zalo?: string | null;
  telegram?: string | null;
  facebook?: string | null;
  hotline?: string | null;
};

/** Footer dùng chung cho mọi trang công khai. `widgets={false}` = chỉ vẽ thẻ
 *  <footer>, bỏ nút nổi liên hệ + LiveChat đi kèm — dùng ở layout dashboard,
 *  nơi layout đã tự render LiveChat riêng (tránh trùng widget). */
export async function SiteFooter({ brand, widgets = true }: { brand?: FooterBrand; widgets?: boolean } = {}) {
  const { L, Ld } = await getServerI18n();
  const s = await getSettings();
  const merged = brand
    ? {
        ...s,
        support_zalo: brand.zalo || s.support_zalo,
        support_telegram: brand.telegram || s.support_telegram,
        support_facebook: brand.facebook || s.support_facebook,
        support_hotline: brand.hotline || s.support_hotline,
      }
    : s;
  const allContacts = await getFloatingContacts().catch(() => []);
  const contacts = merged.support_widget_enabled !== "0" ? allContacts : [];
  // Kênh liên hệ ở footer dùng CHUNG danh sách admin quản lý (Admin → Liên
  // hệ, dự phòng cấu hình support_* cũ) — hiện cả khi nút nổi bị tắt vì
  // footer là bề mặt khác; kênh nào admin chưa cấu hình thì không hiện.
  const footerContacts = brand
    ? [
        { name: "Zalo", value: brand.zalo },
        { name: "Telegram", value: brand.telegram },
        { name: "Facebook", value: brand.facebook },
        { name: "Hotline", value: brand.hotline },
      ]
        .filter((e) => e.value && e.value.trim())
        .map((e) => ({ name: e.name, href: "", image: null as string | null, bg: "", value: e.value!.trim() }))
    : allContacts.map((c) => ({ ...c, value: contactDisplay(c) }));
  const headCls = "flex items-center gap-2 text-slate-900 font-extrabold mb-4";
  const linkCls = "inline-block py-1 transition hover:text-brand-600";
  return (
    <>
    {widgets && contacts.length > 0 && <FloatingSupport items={contacts} />}
    {widgets && merged.livechat_enabled !== "0" && <LiveChat />}
    <footer className="bg-white border-t border-slate-200 text-slate-500 mt-20">
      {/* Thiết kế lại 2026-11-09 theo cấu trúc footer shopkey (lệnh Tín):
          cột thương hiệu (logo + mô tả + vòng tròn kênh liên hệ) · hai cột
          link (Dịch vụ / Hỗ trợ) · cột Liên hệ bấm được · thanh dưới cùng.
          Mọi nội dung đều là dữ liệu thật: tên/mô tả từ Cấu hình, kênh liên
          hệ từ Admin → Liên hệ, link chỉ trỏ tới trang đang có thật. */}
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.35fr_0.8fr_0.9fr_1.15fr] gap-10 lg:gap-8 text-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-black text-white shadow-md shadow-brand-600/25">{(brand?.name || s.site_name || "S").charAt(0).toUpperCase()}</span>
            <span className="text-slate-900 font-extrabold text-lg">{brand?.name || s.site_name}</span>
          </div>
          <p className="mt-3 max-w-xs leading-relaxed">{L(brand?.tagline || s.site_tagline)}</p>
          {footerContacts.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2.5">
              {footerContacts.map((c) => (
                <a key={c.name} href={c.href || undefined} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" title={c.name} aria-label={c.name}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm transition hover:opacity-85" style={{ background: c.bg || "#475569" }}>
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt={c.name} className="h-full w-full rounded-full object-cover" />
                  ) : footerGlyph(c.name)}
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className={headCls}><span className="h-4 w-1 rounded-full bg-brand-500" />{L("Dịch vụ")}</div>
          <ul className="space-y-1.5">
            <li><Link href="/" className={linkCls}>{L("Trang chủ")}</Link></li>
            <li><Link href="/premium" className={linkCls}>{L("Tất cả sản phẩm")}</Link></li>
            <li><Link href="/dashboard/dich-vu" className={linkCls}>{L("Bảng giá dịch vụ")}</Link></li>
            <li><Link href="/bai-viet" className={linkCls}>{L("Bài viết")}</Link></li>
          </ul>
        </div>
        <div>
          <div className={headCls}><span className="h-4 w-1 rounded-full bg-brand-500" />{L("Hỗ trợ")}</div>
          <ul className="space-y-1.5">
            <li><Link href="/dashboard/ticket#faq" className={linkCls}>{L("Câu hỏi thường gặp")}</Link></li>
            <li><Link href="/dashboard/ticket" className={linkCls}>{L("Gửi ticket hỗ trợ")}</Link></li>
            <li><Link href="/dashboard/nap-tien" className={linkCls}>{L("Nạp tiền")}</Link></li>
            <li><Link href="/dashboard/api-docs" className={linkCls}>{L("Tài liệu API")}</Link></li>
            <li><Link href="/dashboard/dieu-khoan" className={linkCls}>{L("Điều khoản sử dụng")}</Link></li>
          </ul>
        </div>
        <div>
          <div className={headCls}><span className="h-4 w-1 rounded-full bg-brand-500" />{L("Liên hệ")}</div>
          <ul className="space-y-3.5">
            {footerContacts.map((c) => (
              <li key={c.name}>
                <a href={c.href || undefined} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="group flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition group-hover:opacity-85" style={{ background: c.bg || "#475569" }}>
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt={c.name} className="h-full w-full rounded-xl object-cover" />
                    ) : footerGlyph(c.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs text-slate-400">{c.name}</span>
                    <span className="block truncate font-semibold text-slate-700 transition group-hover:text-brand-600">{c.value}</span>
                  </span>
                </a>
              </li>
            ))}
            <li>
              <Link href="/dashboard/ticket" className="group flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm transition group-hover:opacity-85">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6Z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-slate-400">{L("Hỗ trợ")}</span>
                  <span className="block font-semibold text-slate-700 transition group-hover:text-brand-600">{L("Gửi ticket hỗ trợ")}</span>
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-between gap-1.5 px-4 py-5 text-center text-xs lg:flex-row lg:text-left">
          <span>© {new Date().getFullYear()} {brand?.name || s.site_name}.</span>
          <span>{L("Mọi dịch vụ chỉ cần link công khai — tuyệt đối không yêu cầu mật khẩu của khách.")}</span>
        </div>
      </div>
    </footer>
    </>
  );
}

/** Giá trị hiển thị của một kênh liên hệ, suy từ link đã chuẩn hoá:
 *  tel: → số điện thoại; t.me → @tên; còn lại bỏ phần miền. */
function contactDisplay(c: FloatingContact): string {
  const h = c.href || "";
  if (h.startsWith("tel:")) return h.slice(4);
  const m = h.match(/^https?:\/\/(?:www\.)?([^/]+)\/(.+)$/);
  if (m) return m[1].includes("t.me") ? `@${m[2]}` : m[2];
  return h;
}

/** Icon trắng cho vòng tròn/ô kênh liên hệ ở footer (theo tên kênh). */
function footerGlyph(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("zalo")) return <span className="font-black text-[14px] leading-none">Z</span>;
  if (lower.includes("telegram")) return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>);
  if (lower.includes("facebook") || lower.includes("fanpage") || lower.includes("messenger")) return (<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7V11H8.2v3h2.5v7h2.8Z" /></svg>);
  if (lower.includes("hotline") || lower.includes("điện thoại") || lower.includes("phone")) return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9Z" /></svg>);
  if (lower.includes("youtube")) return (<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.5 12 5.5 12 5.5s-6 0-7.9.6A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.6 7.9.6 7.9.6s6 0 7.9-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 22.4 12 31 31 0 0 0 22 8.2ZM10 15V9l5.2 3Z" /></svg>);
  if (lower.includes("tiktok")) return (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 3c.4 2.2 1.8 3.6 4 3.9v3c-1.6 0-3-.5-4-1.3v6.6c0 3.9-2.6 6-5.8 6A5.5 5.5 0 0 1 5 15.7c0-3.2 2.5-5.6 5.9-5.5v3.1c-1.6-.3-2.8.8-2.8 2.3 0 1.4 1 2.4 2.4 2.4 1.6 0 2.7-1.1 2.7-3V3h3.4Z" /></svg>);
  if (lower.includes("discord")) return (<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M18.6 5.3A16 16 0 0 0 14.5 4l-.2.4a13 13 0 0 1 1.9 1 12.3 12.3 0 0 0-10.4 0A13 13 0 0 1 7.7 4.4L7.5 4a16 16 0 0 0-4.1 1.3A16.4 16.4 0 0 0 .2 18.1a16 16 0 0 0 4.9 2.5l.4-.6a10 10 0 0 1-1.6-.8l.4-.3a11.4 11.4 0 0 0 9.4 0l.4.3c-.5.3-1 .6-1.6.8l.4.6a16 16 0 0 0 4.9-2.5A16.4 16.4 0 0 0 18.6 5.3ZM8.7 15.3c-1 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2Zm6.6 0c-1 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2Z" /></svg>);
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></svg>);
}

/* Nút liên hệ nổi góc phải dưới — dựng từ danh sách Widget Liên hệ admin quản lý
 * (ảnh tải lên nếu có, không thì icon theo tên kênh / chữ cái đầu) */
function FloatingSupport({ items }: { items: FloatingContact[] }) {
  const glyph = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("zalo")) return <span className="font-black text-[15px] leading-none">Z</span>;
    if (lower.includes("telegram")) return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>);
    if (lower.includes("facebook") || lower.includes("fanpage") || lower.includes("messenger")) return (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7V11H8.2v3h2.5v7h2.8Z" /></svg>);
    if (lower.includes("hotline") || lower.includes("điện thoại") || lower.includes("phone")) return (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9Z" /></svg>);
    return <span className="font-black text-[15px] leading-none">{name.trim().charAt(0).toUpperCase() || "?"}</span>;
  };
  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-3 sm:bottom-5 sm:right-5 z-50 flex flex-col gap-2 sm:gap-2.5">
      {items.map((it, i) => (
        <a key={i} href={it.href} target={it.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" title={it.name}
          className="group flex items-center gap-0 hover:gap-2.5 flex-row-reverse transition-all">
          {it.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.image} alt={it.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover shadow-lg shrink-0 transition-transform group-hover:scale-105 bg-white" />
          ) : (
            <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-full text-white flex items-center justify-center shadow-lg shrink-0 transition-transform group-hover:scale-105" style={{ background: it.bg }}>{glyph(it.name)}</span>
          )}
          <span className="max-w-0 overflow-hidden group-hover:max-w-[180px] transition-all duration-300">
            <span className="whitespace-nowrap text-xs font-semibold bg-slate-900 text-white rounded-full px-3 py-1.5 inline-block">{it.name}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

/** Các mục thông tin đầy đủ ở trang chi tiết premium: Thông tin sản phẩm /
 *  Thông tin bảo hành / Hướng dẫn sử dụng — nội dung admin nhập theo từng sản phẩm. */
export async function PremiumInfoSections({ product }: {
  product: {
    description?: string | null;
    usageGuide?: string | null;
    warrantyInfo?: string | null;
    categoryName: string;
    fulfillment: string;
    variants: { name: string; warrantyDays: number }[];
  };
}) {
  const { L, Ld } = await getServerI18n();
  const fulfillmentLabel = product.fulfillment === "AUTO_STOCK" ? L("Giao ngay tự động từ kho") : product.fulfillment === "API" ? L("Giao tự động qua nhà cung cấp") : L("Nâng cấp chính chủ / giao thủ công");
  const maxWarranty = Math.max(0, ...product.variants.map((v) => v.warrantyDays || 0));
  const warrantySection = (
    <section className="card p-6">
      <h2 className="text-lg font-extrabold text-slate-900 mb-4">{L("Thông tin bảo hành")}</h2>
      {product.warrantyInfo
        ? <RichText value={product.warrantyInfo} className="text-sm text-slate-600 leading-relaxed" />
        : (
          <ul className="text-sm text-slate-600 space-y-1.5">
            {product.variants.map((v) => (
              <li key={v.name}>{L("Gói ")}{v.name}: {v.warrantyDays ? <>{L("bảo hành ")}{v.warrantyDays}{L(" ngày")}</> : L("không bảo hành")}</li>
            ))}
          </ul>
        )}
    </section>
  );
  const usageSection = product.usageGuide ? (
    <section className="card p-6">
      <h2 className="text-lg font-extrabold text-slate-900 mb-4">{L("Hướng dẫn sử dụng")}</h2>
      <RichText value={product.usageGuide} className="text-sm text-slate-600 leading-relaxed" />
    </section>
  ) : null;
  return (
    <div className="mt-12 space-y-6">
      <section className="card p-6">
        <h2 className="text-lg font-extrabold text-slate-900 mb-4">{L("Thông tin sản phẩm")}</h2>
        {product.description && <RichText value={product.description} className="text-sm text-slate-600 leading-relaxed mb-5" />}
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{L("Danh mục")}</dt><dd className="font-semibold text-slate-800 mt-1">{product.categoryName}</dd></div>
          <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{L("Hình thức giao")}</dt><dd className="font-semibold text-slate-800 mt-1">{fulfillmentLabel}</dd></div>
          <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{L("Bảo hành tối đa")}</dt><dd className="font-semibold text-slate-800 mt-1">{maxWarranty ? <>{maxWarranty}{L(" ngày")}</> : L("Không bảo hành")}</dd></div>
        </dl>
      </section>
      {warrantySection}
      {usageSection}
    </div>
  );
}
