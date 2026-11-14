import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, enforceAdminSecurity } from "@/lib/auth";
import { guardSetupDone } from "@/lib/setup";
import { getSettings, siteUrlFromSettings } from "@/lib/settings";
import { logoutAction } from "@/app/actions/auth";
import { DisplaySettings } from "@/components/display";
import AdminNav, { AdminNavEntry } from "@/components/admin-nav";
import { headerLogoUrl, wideLogoUrl } from "@/lib/brand";
import AdminRealtime from "@/components/admin-realtime";
import { prisma } from "@/lib/db";
import { getServerI18n } from "@/lib/lang-server";
import { LangProvider } from "@/components/lang";
import { vnd } from "@/lib/format";
import { regularPremiumWhere } from "@/lib/order-scope";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await guardSetupDone();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "STAFF") redirect("/");
  await enforceAdminSecurity(user);
  const s = await getSettings();
  const [prePending, depPending, ticketOpen] = await Promise.all([
    prisma.premiumOrder.count({ where: { ...regularPremiumWhere(), status: { in: ["PENDING", "PARTIAL", "WARRANTY"] } } }),
    prisma.deposit.count({ where: { status: "PENDING" } }),
    prisma.ticket.count({ where: { status: "OPEN" } }),
  ]);
  // Phân quyền 2 tầng: STAFF chỉ thấy việc của mình (đơn + ticket + nhật ký);
  // các mục tiền/nguồn/dịch vụ/kho/người dùng/thông báo/cấu hình là của ADMIN.
  const isAdmin = user.role === "ADMIN";
  // Thứ tự + tên mục bám sidebar admin: Tổng quan → Tài khoản Premium ▾ →
  // Người dùng → Ticket hỗ trợ → tiền → ... → Mô-đun → Cài đặt →
  // Bảo mật nâng cao → Bài viết ▾ → Cập nhật hệ thống → Dọn dẹp hệ thống.
  // Các tính năng riêng của web (Phân tích, Báo cáo, Rủi ro, Nhật ký API, Hệ thống)
  // đặt ngay sau mục gần nhất của mẫu để không phá thứ tự gốc.
  const i18n = await getServerI18n(null);
  const { L, M } = i18n;
  const all: (AdminNavEntry & { adminOnly?: boolean })[] = [
    { href: "/admin", label: L("Tổng quan"), icon: "home" },
    { href: "/admin/phan-tich", label: L("Phân tích"), icon: "chart", adminOnly: true },
    // Nhóm "Quản lý SMM" ĐÃ GỠ (lệnh Tín 2026-11-12 — web tách thành Digital
    // Shop thuần, SMM làm web riêng): danh mục/dịch vụ/đơn SMM, kiểm tra AI
    // link đơn, giá thông minh và cấp bậc (chiết khấu cấp bậc chỉ áp giá
    // SMM) đều đã gỡ cùng đợt.
    // FIX7 E1 (lệnh Tín 2026-11-08 02:12): Nhà cung cấp RA KHỎI dropdown —
    // thành mục top-level (trước đây chôn trong nhóm nên khó thấy; nhà cung
    // cấp là nguồn sống của nguồn hàng Premium).
    { href: "/admin/nha-cung-cap", label: L("Nhà cung cấp (API)"), icon: "link", adminOnly: true },
    {
      group: "Tài khoản Premium", icon: "gem",
      children: [
        { href: "/admin/premium/danh-muc", label: L("Danh mục sản phẩm"), icon: "layers", adminOnly: true } as any,
        { href: "/admin/premium", label: L("Sản phẩm & Gói"), icon: "box", adminOnly: true } as any,
        { href: "/admin/kho-premium", label: L("Kho Premium"), icon: "db", adminOnly: true } as any,
        { href: "/admin/don-premium", label: L("Quản lý đơn hàng"), icon: "receipt", badge: prePending },
      ],
    } as any,
    {
      group: "Telegram", icon: "send",
      children: [
        { href: "/admin/telegram", label: L("Đơn Telegram"), icon: "receipt" } as any,
        { href: "/admin/telegram/san-pham", label: L("Sản phẩm Telegram"), icon: "box", adminOnly: true } as any,
      ],
    } as any,
    // FIX7 E4: khu Steam trong admin (gương theo khu Telegram) — đơn hàng
    // Steam (STAFF xử lý được như mọi đơn Premium) + sản phẩm Steam (ADMIN).
    {
      group: "Steam", icon: "gamepad",
      children: [
        { href: "/admin/steam", label: L("Đơn hàng Steam"), icon: "receipt" } as any,
        { href: "/admin/steam/san-pham", label: L("Sản phẩm Steam"), icon: "box", adminOnly: true } as any,
      ],
    } as any,
    // FIX10: khu Game Key trong admin (nhóm dropdown như Telegram/Steam) —
    // đơn hàng (STAFF xử lý được) + sản phẩm theo cấu trúc FZR (ADMIN).
    {
      group: "Game Key", icon: "key",
      children: [
        { href: "/admin/game-key", label: L("Đơn hàng Game Key"), icon: "receipt" } as any,
        { href: "/admin/game-key/san-pham", label: L("Sản phẩm Game Key"), icon: "box", adminOnly: true } as any,
      ],
    } as any,
    // Khu Gift Card trong admin (nhóm dropdown như Game Key) — đơn hàng
    // (STAFF xử lý được) + sản phẩm theo cấu trúc FZR giftcards (ADMIN).
    {
      group: "Gift Card", icon: "gift",
      children: [
        { href: "/admin/gift-card", label: L("Đơn hàng Gift Card"), icon: "receipt" } as any,
        { href: "/admin/gift-card/san-pham", label: L("Sản phẩm Gift Card"), icon: "box", adminOnly: true } as any,
      ],
    } as any,
    // Khu Top-Up trong admin (nhóm dropdown như các khu FZR khác) — đơn hàng
    // (STAFF xử lý được) + sản phẩm theo cấu trúc FZR topups (ADMIN): 1
    // category = 1 sản phẩm, fields[] của category sửa nhãn tại đó.
    {
      group: "Top-Up", icon: "zap",
      children: [
        { href: "/admin/top-up", label: L("Đơn hàng Top-Up"), icon: "receipt" } as any,
        { href: "/admin/top-up/san-pham", label: L("Sản phẩm Top-Up"), icon: "box", adminOnly: true } as any,
      ],
    } as any,
    // Khu Manual Services trong admin — đơn hàng (STAFF xử lý được) + sản
    // phẩm theo cấu trúc FZR manual-services (ADMIN): 1 category = 1 sản
    // phẩm, fields[] replenishment sửa nhãn tại trang sản phẩm.
    {
      group: "Manual Services", icon: "wrench",
      children: [
        { href: "/admin/manual-services", label: L("Đơn hàng Manual Services"), icon: "receipt" } as any,
        { href: "/admin/manual-services/san-pham", label: L("Sản phẩm Manual Services"), icon: "box", adminOnly: true } as any,
      ],
    } as any,
    { href: "/admin/nguoi-dung", label: L("Người dùng"), icon: "users", adminOnly: true },
    { href: "/admin/ticket", label: L("Ticket hỗ trợ"), icon: "ticket", badge: ticketOpen },
    {
      group: "Tài chính", icon: "wallet",
      children: [
        { href: "/admin/nap-tien", label: L("Quản lý Nạp tiền"), icon: "inbox", badge: depPending, adminOnly: true } as any,
        { href: "/admin/cau-hinh-nap-tien", label: L("Cấu hình nạp tiền"), icon: "sliders", adminOnly: true } as any,
        { href: "/admin/bien-dong", label: L("Biến động số dư"), icon: "refresh", adminOnly: true } as any,
        { href: "/admin/ngan-hang", label: L("Ngân hàng"), icon: "landmark", adminOnly: true } as any,
        { href: "/admin/tien-te", label: L("Quản lý tiền tệ"), icon: "percent", adminOnly: true } as any,
      ],
    } as any,
    {
      group: "Marketing", icon: "megaphone",
      children: [
        { href: "/admin/ma-giam-gia", label: L("Mã giảm giá"), icon: "code", adminOnly: true } as any,
        { href: "/admin/khuyen-mai", label: L("Khuyến mãi"), icon: "tag", adminOnly: true } as any,
        { href: "/admin/email-marketing", label: L("Email Marketing"), icon: "mail", adminOnly: true } as any,
        { href: "/admin/lien-he", label: L("Widget Liên hệ"), icon: "phone", adminOnly: true } as any,
        { href: "/admin/banner", label: L("Banner trang chủ"), icon: "panels", adminOnly: true } as any,
      ],
    } as any,
    {
      group: "Bài viết", icon: "file",
      children: [
        { href: "/admin/bai-viet", label: L("Tất cả bài viết"), icon: "book", adminOnly: true } as any,
        { href: "/admin/bai-viet/danh-muc", label: L("Danh mục"), icon: "layers", adminOnly: true } as any,
      ],
    } as any,
    {
      group: "Hệ thống", icon: "monitor",
      children: [
        { href: "/admin/mo-dun", label: L("Mô-đun"), icon: "panels", adminOnly: true } as any,
        { href: "/admin/cau-hinh", label: L("Cài đặt"), icon: "gear", adminOnly: true } as any,
        { href: "/admin/ngon-ngu", label: L("Quản lý ngôn ngữ"), icon: "globe", adminOnly: true } as any,
        { href: "/admin/bao-cao", label: L("Báo cáo & Thông báo"), icon: "bell", adminOnly: true } as any,
        { href: "/admin/trung-tam-bao-mat", label: L("Trung tâm bảo mật"), icon: "shield", adminOnly: true } as any,
        { href: "/admin/bao-mat", label: L("Bảo mật nâng cao"), icon: "lock", adminOnly: true } as any,
        { href: "/admin/rui-ro", label: L("Phát hiện rủi ro"), icon: "fingerprint", adminOnly: true } as any,
        { href: "/admin/nhat-ky", label: L("Nhật ký API"), icon: "clock" } as any,
        { href: "/admin/cap-nhat", label: L("Cập nhật hệ thống"), icon: "history", adminOnly: true } as any,
        { href: "/admin/he-thong", label: L("Hệ thống"), icon: "server", adminOnly: true } as any,
        { href: "/admin/don-dep", label: L("Dọn dẹp hệ thống"), icon: "trash", adminOnly: true } as any,
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
    <div className="admin-scope min-h-screen bg-[#f5f7fa]">
      <AdminNav siteName={s.site_name} logoUrl={headerLogoUrl(s.logo_url)} entries={entries} siteUrl={siteUrlFromSettings(s)} userName={user.username} userRole={user.role} />
      <div className="flex min-h-screen flex-col lg:pl-[248px]">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
            {/* Header admin mobile: CHỈ một logo ngang (cùng luật header
                mobile phía khách, lệnh Tín 2026-11-13) — bỏ ô icon vuông. */}
            <Link href="/admin" className="ml-11 flex min-w-0 shrink items-center gap-2 lg:hidden" aria-label={s.site_name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wideLogoUrl(s.logo_menu_url, s.logo_url)} alt={s.site_name} className="h-8 w-auto max-w-full object-contain object-left" />
              <span className="shrink-0 font-medium whitespace-nowrap text-slate-400 max-sm:hidden">/ Admin</span>
            </Link>
            <form action="/admin/don-premium" className="hidden max-w-md flex-1 md:block">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                </span>
                <input name="q" placeholder={L("Tìm kiếm đơn hàng, username...")} className="inp !pl-10" />
              </div>
            </form>
            <div className="ml-auto flex items-center gap-2.5">
              <AdminRealtime endpoint="/api/admin/realtime" suffix="mother" />
              <DisplaySettings />
              <Link href={siteUrlFromSettings(s) || "/"} className="hidden text-sm font-medium text-slate-500 hover:text-slate-800 xl:inline">{L("Xem website")}</Link>
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
        <main className="mx-auto w-full min-w-0 max-w-[1240px] flex-1 px-4 py-6 lg:px-6">{children}</main>
        <footer className="pb-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} {s.site_name} · Admin Panel</footer>
      </div>
    </div>
    </LangProvider>
  );
}
