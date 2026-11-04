import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { SideNav } from "@/components/nav";
import { ThemePicker } from "@/components/theme";
import TabBar from "@/components/tabbar";
import { I } from "@/components/ui";
import { prisma } from "@/lib/db";
import { vnd } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Panel Admin — khu quản trị RIÊNG của chủ panel con. Chỉ chủ panel vào được;
 *  chưa có panel thì đưa tới trang cấu hình lần đầu. */
export default async function PanelAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  if (!panel) redirect("/dashboard/panel-cua-toi/thiet-lap");
  const [memberCount, orderCount] = await Promise.all([
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.smmOrder.count({ where: { panelId: panel.id } }),
  ]);
  const items = [
    { href: "/panel-admin", label: "Tổng quan", icon: I.home },
    { href: "/panel-admin/dich-vu", label: "Dịch vụ & Giá", icon: I.list },
    { href: "/panel-admin/don-hang", label: "Đơn hàng", icon: I.cart, badge: orderCount },
    { href: "/panel-admin/khach-hang", label: "Khách hàng", icon: I.users, badge: memberCount },
    { href: "/panel-admin/cai-dat", label: "Cài đặt panel", icon: I.gear },
  ];
  return (
    <div data-accent={panel.accent} className="min-h-screen">
      <header className="bg-slate-950 text-white sticky top-0 z-40">
        <div className="max-w-[1440px] mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/panel-admin" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center">{panel.name.charAt(0).toUpperCase()}</span>
            <span className="font-extrabold hidden sm:inline">{panel.name} <span className="text-slate-400 font-medium">/ Panel Admin</span></span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <ThemePicker tone="dark" />
            <Link href={`/cua-hang/${panel.slug}`} className="text-sm text-slate-300 hover:text-white hidden md:inline">Xem gian hàng</Link>
            <Link href="/dashboard" className="text-sm text-slate-300 hover:text-white hidden md:inline">Khu khách hàng</Link>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">{vnd(user.balance)} · {user.username}</span>
            <form action={logoutAction}><button className="btn bg-white/10 hover:bg-white/20 text-white btn-sm !py-2">Đăng xuất</button></form>
          </div>
        </div>
      </header>
      <div className="max-w-[1440px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-6 items-start">
        <aside className="lg:sticky lg:top-24 lg:bg-white lg:rounded-2xl lg:border lg:border-slate-200/60 lg:shadow-soft lg:p-3">
          <SideNav items={items} />
        </aside>
        <main className="min-w-0 pb-20 lg:pb-0">
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
      </div>
      <TabBar variant="app" />
    </div>
  );
}
