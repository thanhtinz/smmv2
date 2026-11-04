import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "@/app/actions/auth";
import { SideNav } from "@/components/nav";
import { ThemePicker } from "@/components/theme";
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
  const allItems = [
    { href: "/admin", label: "Tổng quan", icon: I.home },
    { href: "/admin/don-smm", label: "Đơn SMM", icon: I.cart, badge: manualPending },
    { href: "/admin/don-premium", label: "Đơn Premium", icon: I.box, badge: prePending },
    { href: "/admin/nap-tien", label: "Nạp tiền", icon: I.wallet, badge: depPending, adminOnly: true },
    { href: "/admin/dich-vu", label: "Dịch vụ SMM", icon: I.list, adminOnly: true },
    { href: "/admin/nha-cung-cap", label: "Nhà cung cấp API", icon: I.server, adminOnly: true },
    { href: "/admin/premium", label: "Sản phẩm Premium", icon: I.gem, adminOnly: true },
    { href: "/admin/kho-premium", label: "Kho Premium", icon: I.db, adminOnly: true },
    { href: "/admin/nguoi-dung", label: "Người dùng", icon: I.users, adminOnly: true },
    { href: "/admin/ticket", label: "Ticket", icon: I.ticket, badge: ticketOpen },
    { href: "/admin/thong-bao", label: "Thông báo", icon: I.megaphone, adminOnly: true },
    { href: "/admin/nhat-ky", label: "Nhật ký API", icon: I.clock },
    { href: "/admin/cau-hinh", label: "Cấu hình", icon: I.gear, adminOnly: true },
  ];
  const items = allItems.filter((it) => isAdmin || !it.adminOnly);
  return (
    <div className="min-h-screen">
      <header className="bg-slate-950 text-white sticky top-0 z-40">
        <div className="max-w-[1440px] mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center">{s.site_logo_text || "S"}</span>
            <span className="font-extrabold hidden sm:inline">{s.site_name} <span className="text-slate-400 font-medium">/ Admin</span></span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <ThemePicker tone="dark" />
            <Link href="/" className="text-sm text-slate-300 hover:text-white hidden md:inline">Xem website</Link>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">{user.role} · {user.username}</span>
            <form action={logoutAction}><button className="btn bg-white/10 hover:bg-white/20 text-white btn-sm !py-2">Đăng xuất</button></form>
          </div>
        </div>
      </header>
      <div className="max-w-[1440px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-6 items-start">
        <aside className="lg:sticky lg:top-24 lg:bg-white lg:rounded-2xl lg:border lg:border-slate-200/60 lg:shadow-soft lg:p-3">
          <SideNav items={items} />
        </aside>
        <main className="min-w-0 pb-20 lg:pb-0">{children}</main>
      </div>
      <TabBar variant={isAdmin ? "admin" : "staff"} />
    </div>
  );
}
