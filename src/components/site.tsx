import Link from "next/link";
import { getSession } from "@/lib/auth";
import TabBar from "@/components/tabbar";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "@/app/actions/auth";
import { vnd } from "@/lib/format";
import { prisma } from "@/lib/db";
import { ThemePicker } from "@/components/theme";

export async function SiteHeader() {
  const session = await getSession();
  const s = await getSettings();
  const user = session ? await prisma.user.findUnique({ where: { id: session.id }, select: { balance: true, role: true } }) : null;
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
      {s.announcement_bar && (
        <div className="bg-brand-600 text-white text-center text-xs sm:text-sm py-2 px-4 font-medium">{s.announcement_bar}</div>
      )}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3 sm:gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="w-9 h-9 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center text-lg">{s.site_logo_text || "S"}</span>
          <span className="font-extrabold text-lg text-slate-900 hidden min-[420px]:inline">{s.site_name}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <Link href="/dich-vu" className="hover:text-brand-600">Dịch vụ SMM</Link>
          <Link href="/premium" className="hover:text-brand-600">Tài khoản Premium</Link>
          <Link href="/api-docs" className="hover:text-brand-600">API đại lý</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <ThemePicker />
          {session ? (
            <>
              {user && <span className="hidden sm:inline-flex rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 text-sm font-bold">{vnd(user.balance)}</span>}
              <Link href="/dashboard" className="btn-primary btn-sm !px-4 !py-2 whitespace-nowrap">Bảng điều khiển</Link>
              {/* Link Admin Panel CHỈ hiện khi role đúng ADMIN — STAFF và USER không thấy */}
              {user?.role === "ADMIN" && (
                <Link href="/admin" className="btn btn-sm !px-4 !py-2 whitespace-nowrap bg-slate-900 text-white hover:bg-slate-700">Admin Panel</Link>
              )}
              <form action={logoutAction}>
                <button className="btn-ghost btn-sm !px-3 !py-2">Đăng xuất</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost btn-sm !px-4 !py-2 whitespace-nowrap">Đăng nhập</Link>
              <Link href="/register" className="btn-primary btn-sm !px-4 !py-2 whitespace-nowrap"><span className="hidden sm:inline">Đăng ký miễn phí</span><span className="sm:hidden">Đăng ký</span></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export type FooterBrand = {
  name: string;
  tagline?: string | null;
  zalo?: string | null;
  telegram?: string | null;
  facebook?: string | null;
  hotline?: string | null;
};

/** Footer dùng chung. Trang panel con truyền `brand` để footer + nút liên hệ nổi
 *  mang thương hiệu và kênh hỗ trợ RIÊNG của panel (kênh nào panel để trống thì dùng của web mẹ). */
export async function SiteFooter({ brand }: { brand?: FooterBrand } = {}) {
  const s = await getSettings();
  const session = await getSession().catch(() => null);
  const merged = brand
    ? {
        ...s,
        support_zalo: brand.zalo || s.support_zalo,
        support_telegram: brand.telegram || s.support_telegram,
        support_facebook: brand.facebook || s.support_facebook,
        support_hotline: brand.hotline || s.support_hotline,
      }
    : s;
  return (
    <>
    <FloatingSupport s={merged} />
    <footer className="bg-slate-950 text-slate-400 mt-20">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="text-white font-extrabold text-lg mb-3">{brand?.name || s.site_name}</div>
          <p className="leading-relaxed">{brand?.tagline || s.site_tagline}</p>
        </div>
        <div>
          <div className="text-white font-semibold mb-3">Dịch vụ</div>
          <ul className="space-y-2">
            <li><Link href="/dich-vu" className="hover:text-white">Tăng tương tác SMM</Link></li>
            <li><Link href="/premium" className="hover:text-white">Tài khoản Premium</Link></li>
            <li><Link href="/api-docs" className="hover:text-white">API cho đại lý</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-3">Tài khoản</div>
          <ul className="space-y-2">
            <li><Link href="/register" className="hover:text-white">Đăng ký</Link></li>
            <li><Link href="/login" className="hover:text-white">Đăng nhập</Link></li>
            <li><Link href="/dashboard/nap-tien" className="hover:text-white">Nạp tiền</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-3">Hỗ trợ 24/7</div>
          <ul className="space-y-2">
            {merged.support_hotline && <li>Hotline: {merged.support_hotline}</li>}
            {merged.support_telegram && <li>Telegram: {merged.support_telegram}</li>}
            {merged.support_facebook && <li>Facebook: {merged.support_facebook}</li>}
            <li><Link href="/dashboard/ticket" className="hover:text-white">Gửi ticket hỗ trợ</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-5 text-center text-xs">© {new Date().getFullYear()} {brand?.name || s.site_name}. Mọi dịch vụ chỉ cần link công khai — tuyệt đối không yêu cầu mật khẩu của khách.</div>
    </footer>
    <div className="h-[68px] lg:hidden" />
    <TabBar variant={session ? "app" : "site"} />
    </>
  );
}

/* Nút liên hệ nổi góc phải dưới — kiểu thatim: Zalo / Telegram / Fanpage / Hotline luôn trong tầm tay */
function FloatingSupport({ s }: { s: Record<string, string> }) {
  const zalo = s.support_zalo ? (s.support_zalo.startsWith("http") ? s.support_zalo : `https://zalo.me/${s.support_zalo.replace(/\s/g, "")}`) : "";
  const tele = s.support_telegram ? (s.support_telegram.startsWith("http") ? s.support_telegram : `https://t.me/${s.support_telegram.replace(/^@/, "")}`) : "";
  const fb = s.support_facebook ? (s.support_facebook.startsWith("http") ? s.support_facebook : `https://facebook.com/${s.support_facebook}`) : "";
  const items: { href: string; label: string; bg: string; icon: React.ReactNode }[] = [];
  if (zalo) items.push({ href: zalo, label: "Chat Zalo", bg: "#0068ff", icon: <span className="font-black text-[15px] leading-none">Z</span> });
  if (tele) items.push({
    href: tele, label: "Telegram hỗ trợ", bg: "#229ed9",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>),
  });
  if (fb) items.push({
    href: fb, label: "Fanpage Facebook", bg: "#1877f2",
    icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7V11H8.2v3h2.5v7h2.8Z" /></svg>),
  });
  if (s.support_hotline) items.push({
    href: `tel:${s.support_hotline.replace(/\s/g, "")}`, label: `Hotline ${s.support_hotline}`, bg: "#059669",
    icon: (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7A2 2 0 0 1 22 16.9Z" /></svg>),
  });
  if (items.length === 0) return null;
  return (
    <div className="fixed bottom-[5.5rem] lg:bottom-5 right-4 sm:right-5 z-50 flex flex-col gap-2.5">
      {items.map((it) => (
        <a key={it.label} href={it.href} target={it.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" title={it.label}
          className="group flex items-center gap-0 hover:gap-2.5 flex-row-reverse transition-all">
          <span className="w-12 h-12 rounded-full text-white flex items-center justify-center shadow-lg shrink-0 transition-transform group-hover:scale-105" style={{ background: it.bg }}>{it.icon}</span>
          <span className="max-w-0 overflow-hidden group-hover:max-w-[180px] transition-all duration-300">
            <span className="whitespace-nowrap text-xs font-semibold bg-slate-900 text-white rounded-full px-3 py-1.5 inline-block">{it.label}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

/** Các mục thông tin đầy đủ ở trang chi tiết premium: Thông tin sản phẩm /
 *  Thông tin bảo hành / Hướng dẫn sử dụng — nội dung admin nhập theo từng sản phẩm. */
export function PremiumInfoSections({ product }: {
  product: {
    description?: string | null;
    usageGuide?: string | null;
    warrantyInfo?: string | null;
    categoryName: string;
    fulfillment: string;
    variants: { name: string; warrantyDays: number }[];
  };
}) {
  const fulfillmentLabel = product.fulfillment === "AUTO_STOCK" ? "Giao ngay tự động từ kho" : product.fulfillment === "API" ? "Giao tự động qua nhà cung cấp" : "Nâng cấp chính chủ / giao thủ công";
  const maxWarranty = Math.max(0, ...product.variants.map((v) => v.warrantyDays || 0));
  return (
    <div className="mt-12 space-y-6">
      <section className="card p-6">
        <h2 className="text-lg font-extrabold text-slate-900 mb-4">Thông tin sản phẩm</h2>
        {product.description && <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line mb-5">{product.description}</div>}
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Danh mục</dt><dd className="font-semibold text-slate-800 mt-1">{product.categoryName}</dd></div>
          <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Hình thức giao</dt><dd className="font-semibold text-slate-800 mt-1">{fulfillmentLabel}</dd></div>
          <div className="rounded-xl bg-slate-50 px-4 py-3"><dt className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Bảo hành tối đa</dt><dd className="font-semibold text-slate-800 mt-1">{maxWarranty ? `${maxWarranty} ngày` : "Không bảo hành"}</dd></div>
        </dl>
      </section>
      <section className="card p-6">
        <h2 className="text-lg font-extrabold text-slate-900 mb-4">Thông tin bảo hành</h2>
        {product.warrantyInfo
          ? <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{product.warrantyInfo}</div>
          : (
            <ul className="text-sm text-slate-600 space-y-1.5">
              {product.variants.map((v) => (
                <li key={v.name}>Gói {v.name}: {v.warrantyDays ? `bảo hành ${v.warrantyDays} ngày` : "không bảo hành"}</li>
              ))}
            </ul>
          )}
      </section>
      {product.usageGuide && (
        <section className="card p-6">
          <h2 className="text-lg font-extrabold text-slate-900 mb-4">Hướng dẫn sử dụng</h2>
          <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{product.usageGuide}</div>
        </section>
      )}
    </div>
  );
}

/** Thanh điều hướng khu tài khoản TRÊN GIAN HÀNG panel con — khách của panel xem
 *  đơn hàng / dòng tiền / kiếm tiền / tài liệu API ngay tại thương hiệu của panel */
export function PanelAccountNav({ slug, active }: { slug: string; active: string }) {
  const items = [
    { key: "don-hang", href: `/cua-hang/${slug}/don-hang`, label: "Đơn SMM" },
    { key: "don-premium", href: `/cua-hang/${slug}/don-premium`, label: "Đơn Premium" },
    { key: "giao-dich", href: `/cua-hang/${slug}/giao-dich`, label: "Dòng tiền" },
    { key: "kiem-tien", href: `/cua-hang/${slug}/kiem-tien`, label: "Kiếm tiền" },
    { key: "tai-lieu-api", href: `/cua-hang/${slug}/tai-lieu-api`, label: "Tài liệu API" },
  ];
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {items.map((i) => (
        <Link key={i.key} href={i.href} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${i.key === active ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700"}`}>{i.label}</Link>
      ))}
    </div>
  );
}
