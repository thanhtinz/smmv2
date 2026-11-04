"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/* Menu footer kiểu webapp (app tab bar): cố định dưới màn hình điện thoại,
   nút hành động chính nổi lên ở giữa, mục đang mở sáng màu thương hiệu.
   Ba biến thể: site (khách chưa đăng nhập), app (khu khách hàng), admin. */

function Icon({ d, extra }: { d: string; extra?: React.ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />{extra}
    </svg>
  );
}
const ICONS = {
  home: <Icon d="M4 11.2 12 4l8 7.2V19a1.6 1.6 0 0 1-1.6 1.6H14v-6h-4v6H5.6A1.6 1.6 0 0 1 4 19Z" />,
  grid: <Icon d="M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z" />,
  list: <Icon d="M9 6.2h10.5M9 12h10.5M9 17.8h10.5" extra={<><circle cx="4.6" cy="6.2" r="1.15" fill="currentColor" stroke="none" /><circle cx="4.6" cy="12" r="1.15" fill="currentColor" stroke="none" /><circle cx="4.6" cy="17.8" r="1.15" fill="currentColor" stroke="none" /></>} />,
  gem: <Icon d="M7.2 4h9.6L20.5 9 12 20 3.5 9Z" extra={<path d="M3.5 9h17" />} />,
  wallet: <Icon d="M4 8.2A2.7 2.7 0 0 1 6.7 5.5H19a1 1 0 0 1 1 1V18a1.6 1.6 0 0 1-1.6 1.6H6.7A2.7 2.7 0 0 1 4 16.9Z" extra={<circle cx="16.6" cy="12.6" r="1.25" fill="currentColor" stroke="none" />} />,
  user: <Icon d="M5.2 19.6c1.3-3.1 3.9-4.7 6.8-4.7s5.5 1.6 6.8 4.7" extra={<circle cx="12" cy="8.2" r="3.5" />} />,
  plus: (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5.5v13M5.5 12h13" /></svg>),
  check: <Icon d="m5 12.5 4.5 4.5L19 7.8" />,
  box: <Icon d="M12 3 4 7v10l8 4 8-4V7Z" extra={<><path d="M4 7l8 4 8-4" /><path d="M12 11v10" /></>} />,
  ticket: <Icon d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v2a2.5 2.5 0 0 0 0 5v2a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-2a2.5 2.5 0 0 0 0-5Z" extra={<path d="M13.5 6v2.5M13.5 11v2.5M13.5 17v2" />} />,
  clock: <Icon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" extra={<path d="M12 7v5l3.5 2" />} />,
};

type Item = { href: string; label: string; icon: React.ReactNode; center?: boolean; exact?: boolean };

const VARIANTS: Record<string, Item[]> = {
  site: [
    { href: "/", label: "Trang chủ", icon: ICONS.home, exact: true },
    { href: "/dich-vu", label: "Dịch vụ", icon: ICONS.grid },
    { href: "/dich-vu", label: "Đặt đơn", icon: ICONS.plus, center: true },
    { href: "/premium", label: "Premium", icon: ICONS.gem },
    { href: "/login", label: "Tài khoản", icon: ICONS.user },
  ],
  app: [
    { href: "/dashboard", label: "Tổng quan", icon: ICONS.home, exact: true },
    { href: "/dashboard/don-hang", label: "Đơn hàng", icon: ICONS.list },
    { href: "/dashboard/dat-hang", label: "Đặt đơn", icon: ICONS.plus, center: true },
    { href: "/premium", label: "Premium", icon: ICONS.gem },
    { href: "/dashboard/ho-so", label: "Tài khoản", icon: ICONS.user },
  ],
  admin: [
    { href: "/admin", label: "Tổng quan", icon: ICONS.home, exact: true },
    { href: "/admin/don-smm", label: "Đơn SMM", icon: ICONS.list },
    { href: "/admin/nap-tien", label: "Duyệt nạp", icon: ICONS.check, center: true },
    { href: "/admin/dich-vu", label: "Dịch vụ", icon: ICONS.grid },
    { href: "/admin/nguoi-dung", label: "Người dùng", icon: ICONS.user },
  ],
  // STAFF: chỉ việc của nhân viên — xử lý đơn + ticket, không có mục tiền/quản trị
  staff: [
    { href: "/admin", label: "Tổng quan", icon: ICONS.home, exact: true },
    { href: "/admin/don-premium", label: "Đơn Premium", icon: ICONS.box },
    { href: "/admin/don-smm", label: "Đơn SMM", icon: ICONS.list, center: true },
    { href: "/admin/ticket", label: "Ticket", icon: ICONS.ticket },
    { href: "/admin/nhat-ky", label: "Nhật ký", icon: ICONS.clock },
  ],
};

export default function TabBar({ variant }: { variant: "site" | "app" | "admin" | "staff" }) {
  const pathname = usePathname() || "/";
  const items = VARIANTS[variant];
  const isActive = (it: Item) => (it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + "/"));
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40" aria-label="Menu dưới">
      <div className="bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-8px_28px_rgba(27,46,94,0.10)] grid grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
        {items.map((it) => {
          const active = !it.center && isActive(it);
          if (it.center) {
            return (
              <Link key={it.label} href={it.href} className="flex flex-col items-center justify-end pb-1.5" aria-label={it.label}>
                <span className="-mt-6 w-[52px] h-[52px] rounded-full bg-brand-600 text-white flex items-center justify-center shadow-lg shadow-brand-600/40 ring-4 ring-white dark:ring-[#0a1120] active:scale-95 transition">
                  {it.icon}
                </span>
                <span className="text-[10px] font-bold text-brand-700 mt-1">{it.label}</span>
              </Link>
            );
          }
          return (
            <Link key={it.label} href={it.href} className={`flex flex-col items-center justify-end gap-0.5 pt-1.5 pb-1.5 text-[10px] font-semibold ${active ? "text-brand-700" : "text-slate-400"}`}>
              <span className={`px-3.5 py-1 rounded-full transition ${active ? "bg-brand-50 text-brand-600" : ""}`}>{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
