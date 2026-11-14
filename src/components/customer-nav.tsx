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
  const premiumOn = s.module_premium !== "0";
  const affiliateOn = s.module_affiliate !== "0";
  const ticketsOn = s.module_tickets !== "0";
  const apiOn = s.module_api !== "0";
  const telegramOn = s.telegram_enabled !== "0";
  // Đợt 126 (luật module 2026-11-13): Ưu đãi theo module_promo và từng khu
  // FZR theo công tắc khu area_* — tắt ở Admin → Mô-đun thì nhóm/mục biến
  // mất khỏi menu (trang + action của chúng cũng bị chặn ở máy chủ).
  const promoOn = s.module_promo !== "0";
  const steamOn = s.area_steam_enabled !== "0";
  const gamekeyOn = s.area_gamekey_enabled !== "0";
  const giftcardOn = s.area_giftcard_enabled !== "0";
  const topupOn = s.area_topup_enabled !== "0";
  const manualOn = s.area_manual_enabled !== "0";
  // Menu gom nhóm dropdown cho gọn: nhóm nào đang chứa trang hiện tại thì tự mở.
  // Nhóm "Dịch vụ mạng xã hội" (SMM) ĐÃ GỠ (lệnh Tín 2026-11-12 — web tách
  // thành Digital Shop thuần, SMM làm web riêng).
  // Premium KHÔNG còn là nhóm dropdown (lệnh Tín 2026-11-07 23:36): nó là mặt
  // hàng chính nên thành 2 mục phẳng ngay sau Trang chủ — "Tất cả sản phẩm"
  // trỏ về mặt tiền cửa hàng /premium, "Đơn Premium của tôi" giữ lịch sử mua.
  const telegramChildren = [
    { href: "/dashboard/telegram", label: L("Đặt đơn") },
    { href: "/dashboard/telegram/lich-su", label: L("Lịch sử") },
  ];
  // Tài chính (lệnh Tín 2026-11-13): Ưu đãi + Pass GỘP vào cùng dropdown
  // Tài chính với Lịch sử số dư + Giới thiệu bạn bè — menu chỉ còn ĐÚNG MỘT
  // nhóm "Tài chính" (NavLinks mở nhóm/chấm điểm theo nhãn nên hai nhóm
  // trùng nhãn sẽ xung đột trạng thái mở). Nhóm đứng ở vị trí mục Ưu đãi
  // phẳng trước đây. Ưu đãi: trang công khai gom mã giảm giá dùng cho tất
  // cả (lệnh Tín 2026-11-12); Pass: gói thành viên trả phí (lib/pass.ts) —
  // chỉ hiện khi admin bật pass_enabled, nhãn là tên gói admin đặt
  // (pass_name, trống = "Pass"). Link chữ "Xem mã ưu đãi" ở khối mã giảm
  // của giỏ hàng là cửa khác, giữ nguyên.
  const financeChildren = [
    ...(promoOn ? [{ href: "/uu-dai", label: L("Ưu đãi") }] : []),
    ...(s.pass_enabled === "1" ? [{ href: "/pass", label: (s.pass_name || "").trim() || "Pass" }] : []),
    { href: "/dashboard/giao-dich", label: L("Lịch sử số dư") },
    ...(affiliateOn ? [{ href: "/dashboard/kiem-tien", label: L("Giới thiệu bạn bè") }] : []),
  ];
  const supportChildren = [
    ...(ticketsOn ? [{ href: "/dashboard/ticket", label: L("Hỗ trợ / Ticket"), badge: openTickets }] : []),
    // FAQ đã gộp vào trang Hỗ trợ / Ticket (lệnh Tín 2026-11-09 19:12) — menu
    // chỉ còn một cửa duy nhất; /dashboard/faq redirect về /dashboard/ticket#faq.
    { href: "/dashboard/thong-bao", label: L("Thông báo"), badge: unreadNoti },
    ...(s.module_blog !== "0" ? [{ href: "/dashboard/bai-viet", label: L("Bài viết") }] : []),
  ];
  // Steam (lệnh Tín 2026-11-08 02:02): dropdown hiện kể cả khi chưa đồng
  // bộ sản phẩm Steam nào (trang đích tự hiện trạng thái chưa có dữ liệu),
  // nằm ngay sau nhóm Tài chính — từ đợt 126 thêm điều kiện công tắc khu
  // area_steam_enabled (tắt thì nhóm ẩn như các module khác).
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
  // Gift Card (lệnh Tín 2026-11-08 14:27): dropdown riêng ngay sau Game key —
  // khu bán thẻ quà tặng/mã nạp của nhóm FZR giftcards, tách khỏi catalog
  // Premium như các khu riêng khác (trang đích tự hiện trạng thái chưa có dữ liệu).
  const giftCardChildren = [
    { href: "/dashboard/gift-card", label: L("Mua gift card") },
    { href: "/dashboard/gift-card/don-hang", label: L("Đơn hàng") },
  ];
  // Top-Up (lệnh Tín 2026-11-08 17:50 + 18:14): dropdown riêng ngay sau
  // Gift Card — nhóm FZR topups tách HẲN khỏi Premium; trang mua theo ảnh
  // mẫu FZR (danh sách game phân trang + trang mua hai cột trên PC).
  const topupChildren = [
    { href: "/dashboard/top-up", label: L("Nạp game") },
    { href: "/dashboard/top-up/don-hang", label: L("Đơn hàng") },
  ];
  // Manual Services (lệnh Tín 2026-11-08 18:58): dropdown riêng ngay sau
  // Top-Up — nhóm FZR manual-services, khu cuối cùng của FZR có khu riêng;
  // tách hẳn khỏi Premium như các khu khác.
  const manualChildren = [
    { href: "/dashboard/manual-services", label: L("Đặt dịch vụ") },
    { href: "/dashboard/manual-services/don-hang", label: L("Đơn hàng") },
  ];
  // (Đã bỏ phân đoạn nền tảng SMM riêng trong menu theo lệnh Tín 2026-11-07 20:33 —
  // khách đặt đơn qua mục Đặt đơn và tự chọn nền tảng/phân loại trong form.)
  const items: NavEntry[] = [
    { href: "/", label: L("Trang chủ"), icon: I.home },
    ...(premiumOn ? [{ href: "/premium", label: L("Tất cả sản phẩm"), icon: I.gem }] : []),
    { href: "/dashboard/don-premium", label: L("Đơn Premium của tôi"), icon: I.box },
    // Nhóm Tài chính đứng đúng vị trí mục Ưu đãi phẳng trước đây (gộp Ưu
    // đãi + Pass vào đây — xem financeChildren ở trên).
    { label: L("Tài chính"), icon: I.wallet, children: financeChildren },
    ...(steamOn ? [{ label: "Steam", icon: I.gamepad, children: steamChildren }] : []),
    ...(gamekeyOn ? [{ label: "Game key", icon: I.key, children: gameKeyChildren }] : []),
    ...(giftcardOn ? [{ label: "Gift Card", icon: I.gift, children: giftCardChildren }] : []),
    ...(topupOn ? [{ label: "Top-Up", icon: I.zap, children: topupChildren }] : []),
    ...(manualOn ? [{ label: "Manual Services", icon: I.wrench, children: manualChildren }] : []),
    ...(telegramOn ? [{ label: "Telegram Premium", icon: I.send, children: telegramChildren }] : []),
    ...(apiOn ? [{ href: "/dashboard/api-docs", label: L("Tài liệu API"), icon: I.code }] : []),
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
