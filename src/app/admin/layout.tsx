import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, enforceAdminSecurity } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { logoutAction } from "@/app/actions/auth";
import { DisplaySettings } from "@/components/display";
import AdminNav, { AdminNavEntry } from "@/components/admin-nav";
import AdminRealtime from "@/components/admin-realtime";
import { prisma } from "@/lib/db";
import { getServerI18n } from "@/lib/lang-server";
import { LangProvider } from "@/components/lang";
import { vnd } from "@/lib/format";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "STAFF") redirect("/");
  await enforceAdminSecurity(user);
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
  // Thứ tự + tên mục bám đúng sidebar admin của panel mẫu (trumapi): Tổng quan → Quản lý SMM ▾ →
  // Tài khoản Premium ▾ → Người dùng → Ticket hỗ trợ → tiền → ... → Mô-đun → Cài đặt →
  // Bảo mật nâng cao → Bài viết ▾ → Cập nhật hệ thống → Dọn dẹp hệ thống.
  // Các tính năng riêng của SMMv2 (Phân tích, Panel con, Báo cáo, Rủi ro, Nhật ký API, Hệ thống)
  // đặt ngay sau mục gần nhất của mẫu để không phá thứ tự gốc.
  const i18n = await getServerI18n(null);
  const { L, M } = i18n;
  const all: (AdminNavEntry & { adminOnly?: boolean })[] = [
    { href: "/admin", label: L("Tổng quan"), icon: "home" },
    { href: "/admin/phan-tich", label: L("Phân tích"), icon: "chart", adminOnly: true },
    {
      group: "Quản lý SMM", icon: "cart",
      children: [
        { href: "/admin/danh-muc", label: L("Danh mục dịch vụ"), icon: "layers", adminOnly: true } as any,
        { href: "/admin/dich-vu", label: L("Danh sách dịch vụ"), icon: "list", adminOnly: true } as any,
        { href: "/admin/cap-bac", label: L("Cấp bậc người dùng"), icon: "percent", adminOnly: true } as any,
        { href: "/admin/don-smm", label: L("Quản lý đơn hàng"), icon: "cart", badge: manualPending },
        { href: "/admin/kiem-tra-ai", label: L("Kiểm tra AI"), icon: "cpu", adminOnly: true } as any,
        { href: "/admin/gia-thong-minh", label: L("Giá thông minh"), icon: "money", adminOnly: true } as any,
      ],
    } as any,
    // FIX7 E1 (lệnh Tín 2026-11-08 02:12): Nhà cung cấp RA KHỎI dropdown —
    // thành mục top-level ngay sau nhóm Quản lý SMM (trước đây chôn trong
    // nhóm nên khó thấy; nhà cung cấp là nguồn sống của cả SMM lẫn Premium).
    { href: "/admin/nha-cung-cap", label: L("Nhà cung cấp (API)"), icon: "server", adminOnly: true },
    {
      group: "Tài khoản Premium", icon: "gem",
      children: [
        { href: "/admin/premium/danh-muc", label: L("Danh mục sản phẩm"), icon: "layers", adminOnly: true } as any,
        { href: "/admin/premium", label: L("Sản phẩm & Gói"), icon: "gem", adminOnly: true } as any,
        { href: "/admin/don-premium", label: L("Quản lý đơn hàng"), icon: "box", badge: prePending },
      ],
    } as any,
    {
      group: "Telegram", icon: "send",
      children: [
        { href: "/admin/telegram", label: L("Đơn Telegram"), icon: "send" } as any,
        { href: "/admin/telegram/san-pham", label: L("Sản phẩm Telegram"), icon: "gem", adminOnly: true } as any,
        { href: "/admin/telegram/cai-dat", label: L("Cài đặt Telegram"), icon: "gear", adminOnly: true } as any,
      ],
    } as any,
    // FIX7 E4: khu Steam trong admin (gương theo khu Telegram) — đơn hàng
    // Steam (STAFF xử lý được như mọi đơn Premium) + sản phẩm Steam (ADMIN).
    {
      group: "Steam", icon: "gamepad",
      children: [
        { href: "/admin/steam", label: L("Đơn hàng Steam"), icon: "box" } as any,
        { href: "/admin/steam/san-pham", label: L("Sản phẩm Steam"), icon: "gem", adminOnly: true } as any,
      ],
    } as any,
    { href: "/admin/nguoi-dung", label: L("Người dùng"), icon: "users", adminOnly: true },
    { href: "/admin/ticket", label: L("Ticket hỗ trợ"), icon: "ticket", badge: ticketOpen },
    {
      group: "Tài chính", icon: "wallet",
      children: [
        { href: "/admin/nap-tien", label: L("Quản lý Nạp tiền"), icon: "wallet", badge: depPending, adminOnly: true } as any,
        { href: "/admin/cau-hinh-nap-tien", label: L("Cấu hình nạp tiền"), icon: "gear", adminOnly: true } as any,
        { href: "/admin/bien-dong", label: L("Biến động số dư"), icon: "money", adminOnly: true } as any,
        { href: "/admin/ngan-hang", label: L("Ngân hàng"), icon: "landmark", adminOnly: true } as any,
        { href: "/admin/tien-te", label: L("Quản lý tiền tệ"), icon: "money", adminOnly: true } as any,
      ],
    } as any,
    {
      group: "Marketing", icon: "megaphone",
      children: [
        { href: "/admin/ma-giam-gia", label: L("Mã giảm giá"), icon: "gift", adminOnly: true } as any,
        { href: "/admin/khuyen-mai", label: L("Khuyến mãi"), icon: "percent", adminOnly: true } as any,
        { href: "/admin/email-marketing", label: L("Email Marketing"), icon: "mail", adminOnly: true } as any,
        { href: "/admin/lien-he", label: L("Widget Liên hệ"), icon: "megaphone", adminOnly: true } as any,
      ],
    } as any,
    {
      group: "Bài viết", icon: "file",
      children: [
        { href: "/admin/bai-viet", label: L("Tất cả bài viết"), icon: "file", adminOnly: true } as any,
        { href: "/admin/bai-viet/danh-muc", label: L("Danh mục"), icon: "list", adminOnly: true } as any,
      ],
    } as any,
    {
      group: "Hệ thống", icon: "gear",
      children: [
        { href: "/admin/mo-dun", label: L("Mô-đun"), icon: "layers", adminOnly: true } as any,
        { href: "/admin/cau-hinh", label: L("Cài đặt"), icon: "gear", adminOnly: true } as any,
        { href: "/admin/ngon-ngu", label: L("Quản lý ngôn ngữ"), icon: "globe", adminOnly: true } as any,
        { href: "/admin/bao-cao", label: L("Báo cáo & Thông báo"), icon: "bell", adminOnly: true } as any,
        { href: "/admin/trung-tam-bao-mat", label: L("Trung tâm bảo mật"), icon: "shield", adminOnly: true } as any,
        { href: "/admin/bao-mat", label: L("Bảo mật nâng cao"), icon: "shield", adminOnly: true } as any,
        { href: "/admin/rui-ro", label: L("Phát hiện rủi ro"), icon: "shield", adminOnly: true } as any,
        { href: "/admin/nhat-ky", label: L("Nhật ký API"), icon: "clock" } as any,
        { href: "/admin/cap-nhat", label: L("Cập nhật hệ thống"), icon: "cpu", adminOnly: true } as any,
        { href: "/admin/he-thong", label: L("Hệ thống"), icon: "server", adminOnly: true } as any,
        { href: "/admin/don-dep", label: L("Dọn dẹp hệ thống"), icon: "file", adminOnly: true } as any,
      ],
    } as any,
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
    <LangProvider lang={i18n.lang} ov={i18n.cfg.overrides[i18n.lang]} cur={i18n.cur} rates={i18n.rates}>
    <div className="admin-scope min-h-screen bg-[#f4f6fb]">
      <AdminNav siteName={s.site_name} logoText={s.site_logo_text || "S"} entries={entries} />
      <div className="flex min-h-screen flex-col lg:pl-[260px]">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
            <Link href="/admin" className="ml-11 flex items-center gap-2.5 lg:hidden">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-black text-white">{s.site_logo_text || "S"}</span>
              <span className="font-extrabold text-slate-900">{s.site_name} <span className="font-medium text-slate-400">/ Admin</span></span>
            </Link>
            <form action="/admin/don-smm" className="hidden max-w-md flex-1 md:block">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                </span>
                <input name="q" placeholder={L("Tìm kiếm đơn hàng, link, username...")} className="inp !rounded-full !pl-10" />
              </div>
            </form>
            <div className="ml-auto flex items-center gap-2.5">
              <AdminRealtime endpoint="/api/admin/realtime" suffix="mother" />
              <DisplaySettings />
              <Link href="/" className="hidden text-sm font-medium text-slate-500 hover:text-slate-800 xl:inline">{L("Xem website")}</Link>
              <span className="hidden items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3 sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">{initial}</span>
                <span className="text-sm font-semibold text-slate-800">{user.username}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{M(user.balance)}</span>
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{user.role}</span>
              </span>
              <form action={logoutAction}><button className="btn btn-sm whitespace-nowrap bg-slate-900 text-white hover:bg-slate-700">{L("Đăng xuất")}</button></form>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 lg:px-6">{children}</main>
        <footer className="pb-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} {s.site_name} · Admin Panel</footer>
      </div>
    </div>
    </LangProvider>
  );
}
