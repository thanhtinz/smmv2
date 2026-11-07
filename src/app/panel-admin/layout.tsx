import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import AdminNav, { AdminNavEntry } from "@/components/admin-nav";
import AdminRealtime from "@/components/admin-realtime";
import { PanelSwitcher } from "@/components/panel-switcher";
import { DisplaySettings } from "@/components/display";
import { prisma } from "@/lib/db";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { vnd } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Panel Admin — khu quản trị RIÊNG của chủ panel con, dùng chung khung giao diện
 *  với admin web mẹ (sidebar navy + topbar trắng + nền xám nhạt). Phạm vi cố định:
 *  chỉ xem đơn/khách của panel mình và CHỈNH GIÁ — không nguồn, không thêm dịch vụ,
 *  không thao tác tiền hệ thống hay cấu hình hệ thống. */
export default async function PanelAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { getPanelAccess, listAccessiblePanels } = await import("@/lib/panel-access");
  const access = await getPanelAccess(user.id);
  const accessiblePanels = await listAccessiblePanels(user.id);
  if (!access) redirect("/dashboard/panel-cua-toi/thiet-lap");
  const panel = access.panel;
  const isOwner = access.isOwner;
  const [memberCount, orderCount, openTickets, pendingDeposits, premiumPending] = await Promise.all([
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.smmOrder.count({ where: { panelId: panel.id } }),
    prisma.ticket.count({ where: { user: { panelId: panel.id }, status: "OPEN" } }),
    prisma.deposit.count({ where: { user: { panelId: panel.id }, status: "PENDING" } }),
    prisma.premiumOrder.count({ where: { panelId: panel.id, status: { in: ["PENDING", "WARRANTY"] } } }),
  ]);
  // Thứ tự + tên mục bám đúng sidebar admin web mẹ / panel mẫu: Tổng quan → Quản lý SMM ▾ →
  // Tài khoản Premium ▾ → Khách hàng → Ticket hỗ trợ → tiền → ... → Mô-đun → Cài đặt →
  // Bảo mật nâng cao → Bài viết ▾ → Dọn dẹp hệ thống (mọi mục đều trong phạm vi dữ liệu của panel).
  const lang = getLang();
  const L = (t: string) => tr(lang, t);
  const allEntries: AdminNavEntry[] = [
    { href: "/panel-admin", label: L("Tổng quan"), icon: "home" },
    { href: "/panel-admin/phan-tich", label: L("Phân tích"), icon: "chart" },
    {
      group: "Quản lý SMM", icon: "cart",
      children: [
        { href: "/panel-admin/danh-muc", label: L("Danh mục"), icon: "layers" },
        { href: "/panel-admin/dich-vu", label: L("Dịch vụ & Giá"), icon: "list" },
        { href: "/panel-admin/nguon-api", label: L("Nguồn API"), icon: "server" },
        { href: "/panel-admin/cap-bac", label: L("Cấp bậc"), icon: "gem" },
        { href: "/panel-admin/gia-thong-minh", label: L("Giá thông minh"), icon: "percent" },
        { href: "/panel-admin/don-hang", label: L("Quản lý đơn hàng"), icon: "cart", badge: orderCount },
        { href: "/panel-admin/kiem-tra-ai", label: L("Kiểm tra AI"), icon: "cpu" },
        { href: "/panel-admin/hoa-hong", label: L("Nhật ký hoa hồng"), icon: "wallet" },
      ],
    },
    {
      group: "Tài khoản Premium", icon: "gem",
      children: [
        { href: "/panel-admin/dich-vu", label: L("Giá Premium"), icon: "gem" },
        { href: "/panel-admin/premium", label: L("Sản phẩm & Gói"), icon: "box" },
        { href: "/panel-admin/don-premium", label: L("Quản lý đơn hàng"), icon: "box", badge: premiumPending || undefined },
      ],
    },
    { href: "/panel-admin/khach-hang", label: L("Khách hàng"), icon: "users", badge: memberCount },
    { href: "/panel-admin/panel-con", label: L("Website con"), icon: "panels" },
    { href: "/panel-admin/ho-tro", label: L("Ticket hỗ trợ"), icon: "ticket", badge: openTickets },
    {
      group: "Tài chính", icon: "wallet",
      children: [
        { href: "/panel-admin/nap-tien", label: L("Quản lý Nạp tiền"), icon: "money", badge: pendingDeposits || undefined },
        { href: "/panel-admin/cau-hinh-nap-tien", label: L("Cấu hình nạp tiền"), icon: "gear" },
        { href: "/panel-admin/bien-dong", label: L("Biến động số dư"), icon: "chart" },
        { href: "/panel-admin/ngan-hang", label: L("Ngân hàng"), icon: "landmark" },
        { href: "/panel-admin/tien-te", label: L("Quản lý tiền tệ"), icon: "money" },
      ],
    },
    {
      group: "Marketing", icon: "megaphone",
      children: [
        { href: "/panel-admin/ma-giam-gia", label: L("Mã giảm giá"), icon: "gift" },
        { href: "/panel-admin/khuyen-mai", label: L("Khuyến mãi"), icon: "percent" },
        { href: "/panel-admin/email-marketing", label: L("Email Marketing"), icon: "mail" },
        { href: "/panel-admin/lien-he", label: L("Widget Liên hệ"), icon: "megaphone" },
        { href: "/panel-admin/thong-bao", label: L("Thông báo khách"), icon: "bell" },
      ],
    },
    {
      group: "Bài viết", icon: "file",
      children: [
        { href: "/panel-admin/bai-viet", label: L("Tất cả bài viết"), icon: "file" },
      ],
    },
    {
      group: "Hệ thống", icon: "gear",
      children: [
        { href: "/panel-admin/mo-dun", label: L("Mô-đun"), icon: "layers" },
        { href: "/panel-admin/cau-hinh", label: L("Cài đặt"), icon: "gear" },
        { href: "/panel-admin/bao-cao", label: L("Báo cáo & Thông báo"), icon: "bell" },
        { href: "/panel-admin/bao-mat", label: L("Bảo mật nâng cao"), icon: "shield" },
        { href: "/panel-admin/rui-ro", label: L("Đơn rủi ro"), icon: "shield" },
        { href: "/panel-admin/nhat-ky", label: L("Nhật ký API"), icon: "list" },
        { href: "/panel-admin/nhan-vien", label: L("Nhân viên & Phân quyền"), icon: "users" },
        { href: "/panel-admin/ai", label: L("AI tư vấn"), icon: "cpu" },
        { href: "/panel-admin/he-thong", label: L("Dọn dẹp hệ thống"), icon: "cpu" },
      ],
    },
  ];
  // Phân quyền 2 tầng: NHÂN VIÊN chỉ thấy Tổng quan / Phân tích / Đơn hàng / Ticket / Khách hàng.
  const STAFF_ALLOWED = new Set(["/panel-admin", "/panel-admin/phan-tich", "/panel-admin/don-hang", "/panel-admin/don-premium", "/panel-admin/ho-tro", "/panel-admin/khach-hang"]);
  const entries: AdminNavEntry[] = [];
  if (isOwner) {
    entries.push(...allEntries);
  } else {
    for (const e of allEntries) {
      if ("group" in e) {
        const kids = e.children.filter((c) => STAFF_ALLOWED.has(c.href));
        if (kids.length) entries.push({ group: e.group, icon: e.icon, children: kids });
      } else if (STAFF_ALLOWED.has(e.href)) {
        entries.push(e);
      }
    }
  }
  const initial = (user.username || "A").slice(0, 1).toUpperCase();
  return (
    <div data-accent={panel.accent} className="admin-scope min-h-screen bg-[#f4f6fb]">
      <AdminNav siteName={panel.name} logoText={panel.name.charAt(0).toUpperCase()} entries={entries} />
      <div className="flex min-h-screen flex-col lg:pl-[260px]">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
            <Link href="/panel-admin" className="ml-11 flex items-center gap-2.5 lg:hidden">
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
{accessiblePanels.length > 1 && <PanelSwitcher panels={accessiblePanels.map((a) => ({ id: a.panel.id, label: a.panel.domain || a.panel.name }))} currentId={panel.id} />}
                            <AdminRealtime endpoint="/api/panel-admin/realtime" suffix={`panel-${panel.id}`} />
              <DisplaySettings />
              <Link href={`/cua-hang/${panel.slug}`} className="hidden text-sm font-medium text-slate-500 hover:text-slate-800 xl:inline">Xem website</Link>
              <Link href="/dashboard" className="hidden text-sm font-medium text-slate-500 hover:text-slate-800 xl:inline">Khu khách hàng</Link>
              <span className="hidden items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3 sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-xs font-bold text-white">{initial}</span>
                <span className="text-sm font-semibold text-slate-800">{user.username}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{vnd(user.balance)}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isOwner ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"}`}>{isOwner ? "CHỦ PANEL" : "NHÂN VIÊN"}</span>
              </span>
              <form action={logoutAction}><button className="btn btn-sm whitespace-nowrap bg-slate-900 text-white hover:bg-slate-700">Đăng xuất</button></form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 lg:px-6">
          {!isOwner && (
            <div className="card px-5 py-4 mb-6 border !border-amber-200 bg-amber-50 text-sm text-amber-800">
              Bạn đang vào Panel Admin của <b>{panel.name}</b> với quyền <b>Nhân viên</b> — chỉ xử lý đơn hàng, trả lời ticket và xem khách hàng/thống kê. Giá, tiền, cấu hình và nhân sự do chủ panel quản lý.
            </div>
          )}
          {panel.status !== "ACTIVE" && (
            <div className="card px-5 py-4 mb-6 border !border-rose-200 bg-rose-50 text-sm text-rose-700">
              Panel đang bị <b>tạm ngưng</b> — khách tạm thời mua theo giá gốc của web mẹ và bạn không nhận hoa hồng. Liên hệ quản trị hệ thống nếu cần mở lại.
            </div>
          )}
          {isOwner && !panel.setupDone && panel.status === "ACTIVE" && (
            <div className="card px-5 py-4 mb-6 flex flex-wrap items-center gap-3 border !border-amber-200 bg-amber-50">
              <p className="text-sm text-amber-800 flex-1 min-w-[240px]">Panel của bạn chưa qua <b>cấu hình lần đầu</b> — hoàn tất để đặt giá theo cấp bậc, API key liên kết, tên miền riêng và liên hệ hỗ trợ.</p>
              <Link href="/dashboard/panel-cua-toi/thiet-lap" className="btn-primary btn-sm !px-4 !py-2 shrink-0">Cấu hình ngay</Link>
            </div>
          )}
          {children}
        </main>
        <footer className="pb-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} {panel.name} · Panel Admin</footer>
      </div>
    </div>
  );
}
