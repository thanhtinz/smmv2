import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "@/app/actions/auth";
import { SideNav } from "@/components/nav";
import { DisplaySettings } from "@/components/display";
import TabBar from "@/components/tabbar";
import { I } from "@/components/ui";
import { vnd, LEVEL_NAME } from "@/lib/format";
import { prisma } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const s = await getSettings();
  if (s.maintenance === "1" && user.role === "USER") {
    return <div className="min-h-screen flex items-center justify-center p-6 text-center"><div><h1 className="text-2xl font-bold mb-2">Hệ thống đang bảo trì</h1><p className="text-slate-500">Vui lòng quay lại sau ít phút.</p></div></div>;
  }
  const openTickets = await prisma.ticket.count({ where: { userId: user.id, status: "ANSWERED" } });
  const unreadNoti = await prisma.notification.count({ where: { userId: user.id, read: false } });
  const items = [
    { href: "/dashboard", label: "Tổng quan", icon: I.home },
    { href: "/dashboard/dat-hang", label: "Đặt đơn SMM", icon: I.cart },
    { href: "/dashboard/dat-hang-loat", label: "Đặt hàng loạt", icon: I.layers },
    { href: "/dashboard/don-hang", label: "Đơn hàng SMM", icon: I.list },
    { href: "/dashboard/dinh-ky", label: "Đăng ký định kỳ", icon: I.clock },
    { href: "/dashboard/chien-dich", label: "Chiến dịch", icon: I.megaphone },
    { href: "/dashboard/so-sanh", label: "So sánh dịch vụ", icon: I.chart },
    { href: "/premium", label: "Mua Premium", icon: I.gem },
    { href: "/dashboard/don-premium", label: "Đơn hàng Premium", icon: I.box },
    { href: "/dashboard/nap-tien", label: "Nạp tiền", icon: I.wallet },
    { href: "/dashboard/giao-dich", label: "Lịch sử số dư", icon: I.chart },
    { href: "/dashboard/kiem-tien", label: "Kiếm tiền", icon: I.money },
    { href: "/dashboard/api", label: "API đại lý", icon: I.key },
    { href: "/panel-admin", label: "Panel Admin", icon: I.server },
    { href: "/dashboard/ticket", label: "Hỗ trợ / Ticket", icon: I.ticket, badge: openTickets },
    { href: "/dashboard/thong-bao", label: "Thông báo", icon: I.bell, badge: unreadNoti },
    { href: "/dashboard/ho-so", label: "Hồ sơ", icon: I.users },
  ];
  return (
    <div className="min-h-screen">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center">{s.site_logo_text || "S"}</span>
            <span className="font-extrabold text-slate-900 hidden sm:inline">{s.site_name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2.5">
            <DisplaySettings />
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hidden sm:inline-block">{LEVEL_NAME[user.level]}</span>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-3.5 py-1.5 text-sm font-bold">{vnd(user.balance)}</span>
            <span className="hidden md:inline text-sm font-medium text-slate-700">{user.username}</span>
            <form action={logoutAction}><button className="btn-ghost btn-sm !py-2">Đăng xuất</button></form>
          </div>
        </div>
      </header>
      <div className="max-w-[1400px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-6 items-start">
        <aside className="lg:sticky lg:top-24 lg:bg-white lg:rounded-2xl lg:border lg:border-slate-200/60 lg:shadow-soft lg:p-3">
          <SideNav items={items} />
        </aside>
        <main className="min-w-0 pb-20 lg:pb-0">{children}</main>
      </div>
      {/* Menu footer kiểu webapp cho điện thoại */}
      <TabBar variant="app" />
    </div>
  );
}
