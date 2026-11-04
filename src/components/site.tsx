import Link from "next/link";
import { getSession } from "@/lib/auth";
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
              <Link href={user && (user.role === "ADMIN" || user.role === "STAFF") ? "/admin" : "/dashboard"} className="btn-primary btn-sm !px-4 !py-2">Bảng điều khiển</Link>
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

export async function SiteFooter() {
  const s = await getSettings();
  return (
    <>
    <FloatingSupport s={s} />
    <footer className="bg-slate-950 text-slate-400 mt-20">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm">
        <div>
          <div className="text-white font-extrabold text-lg mb-3">{s.site_name}</div>
          <p className="leading-relaxed">{s.site_tagline}</p>
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
            {s.support_hotline && <li>Hotline: {s.support_hotline}</li>}
            {s.support_telegram && <li>Telegram: {s.support_telegram}</li>}
            {s.support_facebook && <li>Facebook: {s.support_facebook}</li>}
            <li><Link href="/dashboard/ticket" className="hover:text-white">Gửi ticket hỗ trợ</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-800 py-5 text-center text-xs">© {new Date().getFullYear()} {s.site_name}. Mọi dịch vụ chỉ cần link công khai — tuyệt đối không yêu cầu mật khẩu của khách.</div>
    </footer>
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
    <div className="fixed bottom-5 right-4 sm:right-5 z-50 flex flex-col gap-2.5">
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
