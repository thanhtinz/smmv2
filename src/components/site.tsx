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

/** Footer dùng chung cho mọi trang công khai. */
export async function SiteFooter({ brand }: { brand?: FooterBrand } = {}) {
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
  const contacts = merged.support_widget_enabled !== "0" ? await getFloatingContacts().catch(() => []) : [];
  return (
    <>
    {contacts.length > 0 && <FloatingSupport items={contacts} />}
    {merged.livechat_enabled !== "0" && <LiveChat />}
    <footer className="bg-white border-t border-slate-200 text-slate-500 mt-20">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="text-slate-900 font-extrabold text-lg mb-3">{brand?.name || s.site_name}</div>
          <p className="leading-relaxed">{L(brand?.tagline || s.site_tagline)}</p>
        </div>
        <div>
          <div className="text-slate-900 font-semibold mb-3">{L("Dịch vụ")}</div>
          <ul className="space-y-2">
            <li><Link href="/premium" className="hover:text-brand-600">{L("Tài khoản Premium")}</Link></li>
            <li><Link href="/dashboard/dich-vu" className="hover:text-brand-600">{L("Bảng giá dịch vụ")}</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-slate-900 font-semibold mb-3">{L("Tài khoản")}</div>
          <ul className="space-y-2">
            <li><Link href="/register" className="hover:text-brand-600">{L("Đăng ký")}</Link></li>
            <li><Link href="/login" className="hover:text-brand-600">{L("Đăng nhập")}</Link></li>
            <li><Link href="/dashboard/nap-tien" className="hover:text-brand-600">{L("Nạp tiền")}</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-slate-900 font-semibold mb-3">{L("Hỗ trợ 24/7")}</div>
          <ul className="space-y-2">
            {merged.support_hotline && <li>{L("Hotline:")} {merged.support_hotline}</li>}
            {merged.support_telegram && <li>Telegram: {merged.support_telegram}</li>}
            {merged.support_facebook && <li>Facebook: {merged.support_facebook}</li>}
            <li><Link href="/dashboard/ticket" className="hover:text-brand-600">{L("Gửi ticket hỗ trợ")}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 py-5 text-center text-xs">© {new Date().getFullYear()} {brand?.name || s.site_name}. {L("Mọi dịch vụ chỉ cần link công khai — tuyệt đối không yêu cầu mật khẩu của khách.")}</div>
    </footer>
    </>
  );
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
