import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import AdminNav, { AdminNavEntry } from "@/components/admin-nav";
import { DisplaySettings } from "@/components/display";
import TabBar from "@/components/tabbar";
import { prisma } from "@/lib/db";
import { vnd } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Panel Admin — khu quản trị RIÊNG của chủ panel con, dùng chung khung giao diện
 *  với admin web mẹ (sidebar navy + topbar trắng + nền xám nhạt). Phạm vi cố định:
 *  chỉ xem đơn/khách của panel mình và CHỈNH GIÁ — không nguồn, không thêm dịch vụ,
 *  không thao tác tiền hệ thống hay cấu hình hệ thống. */
export default async function PanelAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  if (!panel) redirect("/dashboard/panel-cua-toi/thiet-lap");
  const [memberCount, orderCount, openTickets] = await Promise.all([
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.smmOrder.count({ where: { panelId: panel.id } }),
    prisma.ticket.count({ where: { user: { panelId: panel.id }, status: "OPEN" } }),
  ]);
  const entries: AdminNavEntry[] = [
    { href: "/panel-admin", label: "Tổng quan", icon: "home" },
    { href: "/panel-admin/phan-tich", label: "Phân tích", icon: "chart" },
    {
      group: "Bán hàng", icon: "cart",
      children: [
        { href: "/panel-admin/dich-vu", label: "Dịch vụ & Giá", icon: "list" },
        { href: "/panel-admin/don-hang", label: "Đơn hàng", icon: "cart", badge: orderCount },
        { href: "/panel-admin/ma-giam-gia", label: "Mã giảm giá", icon: "gift" },
        { href: "/panel-admin/hoa-hong", label: "Nhật ký hoa hồng", icon: "wallet" },
        { href: "/panel-admin/rui-ro", label: "Đơn rủi ro", icon: "shield" },
      ],
    },
    {
      group: "Khách hàng", icon: "users",
      children: [
        { href: "/panel-admin/khach-hang", label: "Khách hàng", icon: "users", badge: memberCount },
        { href: "/panel-admin/ho-tro", label: "Hỗ trợ / Ticket", icon: "ticket", badge: openTickets },
        { href: "/panel-admin/thong-bao", label: "Thông báo khách", icon: "megaphone" },
        { href: "/panel-admin/email-marketing", label: "Email marketing", icon: "mail" },
      ],
    },
    { href: "/panel-admin/bai-viet", label: "Bài viết", icon: "file" },
    { href: "/panel-admin/cai-dat", label: "Cài đặt panel", icon: "gear" },
  ];
  const initial = (user.username || "A").slice(0, 1).toUpperCase();
  return (
    <div data-accent={panel.accent} className="admin-scope min-h-screen bg-[#f4f6fb]">
      <AdminNav siteName={panel.name} logoText={panel.name.charAt(0).toUpperCase()} entries={entries} />
      <div className="flex min-h-screen flex-col lg:pl-[260px]">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
            <Link href="/panel-admin" className="flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-black text-white">{panel.name.charAt(0).toUpperCase()}</span>
              <span className="font-extrabold text-slate-900">{panel.name} <span className="font-medium text-slate-400">/ Panel Admin</span></span>
            </Link>
            <form action="/panel-admin/don-hang" className="hidden max-w-md flex-1 md:block">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                </span>
                <input name="q" placeholder="Tìm đơn hàng của panel..." className="inp !rounded-full !pl-10" />
              </div>
            </form>
            <div className="ml-auto flex items-center gap-2.5">
              <DisplaySettings />
              <Link href={`/cua-hang/${panel.slug}`} className="hidden text-sm font-medium text-slate-500 hover:text-slate-800 xl:inline">Xem gian hàng</Link>
              <Link href="/dashboard" className="hidden text-sm font-medium text-slate-500 hover:text-slate-800 xl:inline">Khu khách hàng</Link>
              <span className="hidden items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3 sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{initial}</span>
                <span className="text-sm font-semibold text-slate-800">{user.username}</span>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{vnd(user.balance)}</span>
              </span>
              <form action={logoutAction}><button className="btn btn-sm bg-slate-900 text-white hover:bg-slate-700">Đăng xuất</button></form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 pb-24 lg:px-6 lg:pb-6">
          {panel.status !== "ACTIVE" && (
            <div className="card px-5 py-4 mb-6 border !border-rose-200 bg-rose-50 text-sm text-rose-700">
              Panel đang bị <b>tạm ngưng</b> — khách tạm thời mua theo giá gốc của web mẹ và bạn không nhận hoa hồng. Liên hệ quản trị hệ thống nếu cần mở lại.
            </div>
          )}
          {!panel.setupDone && panel.status === "ACTIVE" && (
            <div className="card px-5 py-4 mb-6 flex flex-wrap items-center gap-3 border !border-amber-200 bg-amber-50">
              <p className="text-sm text-amber-800 flex-1 min-w-[240px]">Panel của bạn chưa qua <b>cấu hình lần đầu</b> — hoàn tất để đặt giá theo cấp bậc, API key liên kết, tên miền riêng và liên hệ hỗ trợ.</p>
              <Link href="/dashboard/panel-cua-toi/thiet-lap" className="btn-primary btn-sm !px-4 !py-2 shrink-0">Cấu hình ngay</Link>
            </div>
          )}
          {children}
        </main>
        <footer className="pb-24 text-center text-xs text-slate-400 lg:pb-6">© {new Date().getFullYear()} {panel.name} · Panel Admin</footer>
      </div>
      <TabBar variant="app" />
    </div>
  );
}
