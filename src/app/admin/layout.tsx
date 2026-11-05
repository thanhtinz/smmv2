import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "@/app/actions/auth";
import { DisplaySettings } from "@/components/display";
import AdminNav, { AdminNavEntry } from "@/components/admin-nav";
import TabBar from "@/components/tabbar";
import { I } from "@/components/ui";
import { prisma } from "@/lib/db";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "STAFF") redirect("/dashboard");
  const s = await getSettings();
  const [manualPending, prePending, depPending, ticketOpen] = await Promise.all([
    prisma.smmOrder.count({ where: { fulfillment: "MANUAL", status: { in: ["PENDING", "PROCESSING"] } } }),
    prisma.premiumOrder.count({ where: { status: { in: ["PENDING", "WARRANTY"] } } }),
    prisma.deposit.count({ where: { status: "PENDING" } }),
    prisma.ticket.count({ where: { status: "OPEN" } }),
  ]);
  // Phân quyền 2 tầng: STAFF chỉ thấy việc của mình (đơn + ticket + nhật ký);
  // các mục tiền/nguồn/dịch vụ/kho/người dùng/thông báo/cấu hình là của ADMIN.
  const isAdmin = user.role === "ADMIN";
  const all: (AdminNavEntry & { adminOnly?: boolean })[] = [
    { href: "/admin", label: "Tổng quan", icon: "home" },
    {
      group: "Quản lý SMM", icon: "cart",
      children: [
        { href: "/admin/don-smm", label: "Đơn SMM", icon: "cart", badge: manualPending },
        { href: "/admin/dich-vu", label: "Dịch vụ SMM", icon: "list", adminOnly: true } as any,
        { href: "/admin/nha-cung-cap", label: "Nhà cung cấp API", icon: "server", adminOnly: true } as any,
        { href: "/admin/cap-bac", label: "Cấp bậc", icon: "percent", adminOnly: true } as any,
      ],
    } as any,
    {
      group: "Premium", icon: "gem",
      children: [
        { href: "/admin/don-premium", label: "Đơn Premium", icon: "box", badge: prePending },
        { href: "/admin/premium", label: "Sản phẩm Premium", icon: "gem", adminOnly: true } as any,
        { href: "/admin/kho-premium", label: "Kho Premium", icon: "db", adminOnly: true } as any,
      ],
    } as any,
    { href: "/admin/nap-tien", label: "Nạp tiền", icon: "wallet", badge: depPending, adminOnly: true },
    { href: "/admin/bien-dong", label: "Biến động số dư", icon: "money", adminOnly: true },
    { href: "/admin/ngan-hang", label: "Ngân hàng", icon: "landmark", adminOnly: true },
    { href: "/admin/ma-giam-gia", label: "Mã giảm giá", icon: "gift", adminOnly: true },
    {
      group: "Bài viết", icon: "file",
      children: [
        { href: "/admin/bai-viet", label: "Tất cả bài viết", icon: "file", adminOnly: true } as any,
        { href: "/admin/bai-viet/danh-muc", label: "Danh mục bài viết", icon: "list", adminOnly: true } as any,
      ],
    } as any,
    { href: "/admin/email-marketing", label: "Email Marketing", icon: "mail", adminOnly: true },
    { href: "/admin/nguoi-dung", label: "Người dùng", icon: "users", adminOnly: true },
    { href: "/admin/panel-con", label: "Panel con", icon: "panels", adminOnly: true },
    { href: "/admin/ticket", label: "Ticket", icon: "ticket", badge: ticketOpen },
    { href: "/admin/thong-bao", label: "Thông báo", icon: "megaphone", adminOnly: true },
    { href: "/admin/nhat-ky", label: "Nhật ký API", icon: "clock" },
    { href: "/admin/bao-mat", label: "Bảo mật nâng cao", icon: "shield", adminOnly: true },
    { href: "/admin/he-thong", label: "Hệ thống", icon: "cpu", adminOnly: true },
    { href: "/admin/cau-hinh", label: "Cấu hình", icon: "gear", adminOnly: true },
  ];
  const entries: AdminNavEntry[] = [];
  for (const e of all) {
    if (!isAdmin && (e as any).adminOnly) continue;
    if ("group" in e) {
      const kids = (e.children as any[]).filter((c) => isAdmin || !c.adminOnly).map(({ adminOnly, ...rest }) => rest);
      if (kids.length) entries.push({ group: (e as any).group, icon: (e as any).icon, children: kids });
    } else {
      const { adminOnly, ...rest } = e as any;
      entries.push(rest);
    }
  }
  const initial = (user.username || "A").slice(0, 1).toUpperCase();
  return (
    <div className="admin-scope min-h-screen bg-[#f4f6fb]">
      <AdminNav siteName={s.site_name} logoText={s.site_logo_text || "S"} entries={entries} />
      <div className="flex min-h-screen flex-col lg:pl-[260px]">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
            <Link href="/admin" className="flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-black text-white">{s.site_logo_text || "S"}</span>
              <span className="font-extrabold text-slate-900">{s.site_name} <span className="font-medium text-slate-400">/ Admin</span></span>
            </Link>
            <form action="/admin/don-smm" className="hidden max-w-md flex-1 md:block">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                </span>
                <input name="q" placeholder="Tìm kiếm đơn hàng, link, username..." className="inp !rounded-full !pl-10" />
              </div>
            </form>
            <div className="ml-auto flex items-center gap-2.5">
              <Link href="/admin/ticket" className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700" title="Ticket đang mở">
                {I.bell}
                {ticketOpen > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">{ticketOpen}</span>}
              </Link>
              <DisplaySettings />
              <Link href="/" className="hidden text-sm font-medium text-slate-500 hover:text-slate-800 xl:inline">Xem website</Link>
              <span className="hidden items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3 sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{initial}</span>
                <span className="text-sm font-semibold text-slate-800">{user.username}</span>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{user.role}</span>
              </span>
              <form action={logoutAction}><button className="btn btn-sm bg-slate-900 text-white hover:bg-slate-700">Đăng xuất</button></form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 pb-24 lg:px-6 lg:pb-6">{children}</main>
        <footer className="pb-24 text-center text-xs text-slate-400 lg:pb-6">© {new Date().getFullYear()} {s.site_name} · Admin Panel</footer>
      </div>
      <TabBar variant={isAdmin ? "admin" : "staff"} />
    </div>
  );
}
