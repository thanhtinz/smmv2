import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { MenuBottomCluster, type NavEntry } from "@/components/nav";
import { I } from "@/components/ui";
import { getSettings } from "@/lib/settings";

type Settings = Awaited<ReturnType<typeof getSettings>>;
type NavUser = { id: number; fullName: string | null; username: string; email: string; role: string };

/** Menu khu khách hàng + cụm đáy menu — NGUỒN DUY NHẤT cho cả layout
 *  dashboard và khung công khai: từ 2026-11-07 23:03 cửa hàng dùng chung
 *  header trắng của khu khách hàng nên ngăn kéo mobile + menu phải giống hệt
 *  nhau ở mọi trang (trước đây đoạn này nằm inline trong dashboard/layout). */
export async function buildCustomerNav(
  user: NavUser,
  s: Settings,
  L: (t: string) => string
): Promise<{ items: NavEntry[]; menuFooter: ReactNode }> {
  const openTickets = await prisma.ticket.count({ where: { userId: user.id, status: "ANSWERED" } });
  const unreadNoti = await prisma.notification.count({ where: { userId: user.id, read: false } });
  const smmOn = s.module_smm !== "0";
  const premiumOn = s.module_premium !== "0";
  const affiliateOn = s.module_affiliate !== "0";
  const bulkOn = s.module_bulk !== "0";
  const ticketsOn = s.module_tickets !== "0";
  const apiOn = s.module_api !== "0";
  const telegramOn = s.telegram_enabled !== "0";
  // Menu gom nhóm dropdown cho gọn: nhóm nào đang chứa trang hiện tại thì tự mở
  const smmChildren = [
    ...(smmOn ? [{ href: "/dashboard/dat-hang", label: L("Đặt đơn") }] : []),
    ...(smmOn && bulkOn ? [{ href: "/dashboard/dat-hang-loat", label: L("Đặt hàng loạt") }] : []),
    { href: "/dashboard/don-hang", label: L("Đơn hàng") },
    ...(smmOn ? [{ href: "/dashboard/dich-vu", label: L("Bảng giá") }] : []),
  ];
  // Premium KHÔNG còn là nhóm dropdown (lệnh Tín 2026-11-07 23:36): nó là mặt
  // hàng chính nên thành 2 mục phẳng ngay sau Trang chủ — "Tất cả sản phẩm"
  // trỏ về mặt tiền cửa hàng /premium, "Đơn Premium của tôi" giữ lịch sử mua.
  const telegramChildren = [
    { href: "/dashboard/telegram", label: L("Đặt đơn") },
    { href: "/dashboard/telegram/lich-su", label: L("Lịch sử") },
  ];
  const financeChildren = [
    { href: "/dashboard/giao-dich", label: L("Lịch sử số dư") },
    ...(affiliateOn ? [{ href: "/dashboard/kiem-tien", label: L("Kiếm tiền") }] : []),
  ];
  const supportChildren = [
    ...(ticketsOn ? [{ href: "/dashboard/ticket", label: L("Hỗ trợ / Ticket"), badge: openTickets }] : []),
    { href: "/dashboard/faq", label: L("Hỏi đáp thường gặp") },
    { href: "/dashboard/thong-bao", label: L("Thông báo"), badge: unreadNoti },
    ...(s.module_blog !== "0" ? [{ href: "/dashboard/bai-viet", label: L("Bài viết") }] : []),
  ];
  // Steam (lệnh Tín 2026-11-08 02:02): dropdown LUÔN hiện (kể cả khi chưa
  // đồng bộ sản phẩm Steam nào — trang đích tự hiện trạng thái chưa có dữ
  // liệu), nằm ngay sau "Đơn Premium của tôi", trước nhóm Dịch vụ mạng xã hội.
  const steamChildren = [
    { href: "/dashboard/steam/top-up", label: L("Steam Top-Up (CIS)") },
    { href: "/dashboard/steam/gift-games", label: L("Steam Gift Games") },
    { href: "/dashboard/steam/lich-su", label: L("Đơn hàng Steam") },
  ];
  // Game Key (lệnh Tín 2026-11-08 12:45): dropdown riêng ngay sau Steam —
  // khu bán key game của nhóm FZR gamekeys, tách khỏi catalog Premium như
  // các khu riêng khác (trang đích tự hiện trạng thái chưa có dữ liệu).
  const gameKeyChildren = [
    { href: "/dashboard/game-key", label: L("Mua game") },
    { href: "/dashboard/game-key/don-hang", label: L("Đơn hàng") },
  ];
  // (Đã bỏ phân đoạn nền tảng SMM riêng trong menu theo lệnh Tín 2026-11-07 20:33 —
  // khách đặt đơn qua mục Đặt đơn và tự chọn nền tảng/phân loại trong form.)
  const items: NavEntry[] = [
    { href: "/", label: L("Trang chủ"), icon: I.home },
    ...(premiumOn ? [{ href: "/premium", label: L("Tất cả sản phẩm"), icon: I.gem }] : []),
    { href: "/dashboard/don-premium", label: L("Đơn Premium của tôi"), icon: I.box },
    { label: "Steam", icon: I.gamepad, children: steamChildren },
    { label: "Game key", icon: I.key, children: gameKeyChildren },
    ...(smmChildren.length ? [{ label: L("Dịch vụ mạng xã hội"), icon: I.cart, children: smmChildren }] : []),
    ...(telegramOn ? [{ label: "Telegram Premium", icon: I.send, children: telegramChildren }] : []),
    ...(financeChildren.length ? [{ label: L("Tài chính"), icon: I.wallet, children: financeChildren }] : []),
    ...(apiOn ? [{ href: "/dashboard/api-docs", label: L("Tài liệu API"), icon: I.key }] : []),
    ...(supportChildren.length ? [{ label: L("Hỗ trợ"), icon: I.ticket, children: supportChildren }] : []),
    { href: "/dashboard/ho-so", label: L("Hồ sơ"), icon: I.user },
  ];
  // Cụm đáy menu ghim cố định: tài khoản + Nạp tiền + Admin Panel (chỉ đúng
  // tài khoản đang thấy link Admin Panel như hiện tại: role ADMIN) + Đăng xuất.
  const nameParts = (user.fullName || user.username).trim().split(/\s+/);
  const accountInitials = (nameParts.length > 1 ? nameParts[0][0] + nameParts[nameParts.length - 1][0] : (user.fullName || user.username).slice(0, 2)).toUpperCase();
  const menuFooter = <MenuBottomCluster accountName={user.fullName || user.username} accountEmail={user.email} accountInitials={accountInitials} depositLabel={L("Nạp tiền")} adminLabel={user.role === "ADMIN" ? "Admin Panel" : null} logoutLabel={L("Đăng xuất")} />;
  return { items, menuFooter };
}
