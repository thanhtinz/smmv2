import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "@/app/actions/auth";
import { vnd } from "@/lib/format";
import { prisma } from "@/lib/db";

export async function SiteHeader() {
  const session = await getSession();
  const s = await getSettings();
  const user = session ? await prisma.user.findUnique({ where: { id: session.id }, select: { balance: true, role: true } }) : null;
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200">
      {s.announcement_bar && (
        <div className="bg-brand-600 text-white text-center text-xs sm:text-sm py-2 px-4 font-medium">{s.announcement_bar}</div>
      )}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="w-9 h-9 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center text-lg">{s.site_logo_text || "S"}</span>
          <span className="font-extrabold text-lg text-slate-900">{s.site_name}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <Link href="/dich-vu" className="hover:text-brand-600">Dịch vụ SMM</Link>
          <Link href="/premium" className="hover:text-brand-600">Tài khoản Premium</Link>
          <Link href="/api-docs" className="hover:text-brand-600">API đại lý</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
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
              <Link href="/login" className="btn-ghost btn-sm !px-4 !py-2">Đăng nhập</Link>
              <Link href="/register" className="btn-primary btn-sm !px-4 !py-2">Đăng ký miễn phí</Link>
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
    <footer className="bg-slate-950 text-slate-400 mt-20">
      <div className="max-w-7xl mx-auto px-4 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm">
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
  );
}
