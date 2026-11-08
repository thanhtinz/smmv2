"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { getTelegramProvider, getTelegramVariants, telegramEnabled } from "@/lib/tg";
import { createPremiumOrder } from "@/lib/orders";
import { FZR_LABELS } from "@/lib/fzr";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

/** Đặt đơn Telegram (Stars/Premium) — chạy qua createPremiumOrder trên đúng gói
 *  đã đồng bộ của nhà cung cấp FZR đã chọn, nên ví/flash/hoàn tiền/thông báo dùng
 *  chung một máy. Username là thông tin nhận hàng chính (docs reseller: giao theo
 *  username); Telegram ID số là TUỲ CHỌN — có ID thì đi endpoint riêng, không có
 *  thì đi offer top-up Telegram theo username, không có nữa thì giữ đơn chờ tay. */
export async function placeTelegramOrderAction(formData: FormData) {
  const user = await requireUser();
  if (!(await telegramEnabled())) back("/dashboard/telegram", "err", "Mục Telegram đang tạm tắt");
  const mode = String(formData.get("mode") || "stars");
  const username = String(formData.get("username") || "").trim().slice(0, 64);
  const telegramId = String(formData.get("telegramId") || "").trim();
  if (!username) back("/dashboard/telegram", "err", "Nhập username Telegram của tài khoản nhận");
  if (telegramId && !/^\d{5,20}$/.test(telegramId)) back("/dashboard/telegram", "err", "Telegram ID phải là dãy số của tài khoản nhận");
  const provider = await getTelegramProvider();
  if (!provider) back("/dashboard/telegram", "err", "Dịch vụ Telegram chưa được cấu hình");
  const { stars, premium } = await getTelegramVariants(provider.id);
  const customData: Record<string, string> = {};
  if (telegramId) customData[FZR_LABELS.telegramId] = telegramId;
  customData["Tên người dùng Telegram"] = username.startsWith("@") ? username : `@${username}`;
  try {
    if (mode === "premium") {
      const months = parseInt(String(formData.get("months") || "0"));
      const variant = premium.find((v) => v.providerItemId === String(months));
      if (!variant) back("/dashboard/telegram", "err", "Gói Premium không khả dụng");
      await createPremiumOrder({ user, variantId: variant!.id, quantity: 1, customData });
    } else {
      if (!stars) back("/dashboard/telegram", "err", "Dịch vụ Telegram chưa được cấu hình");
      const amount = parseInt(String(formData.get("amount") || "0"));
      if (!amount || amount < 1) back("/dashboard/telegram", "err", "Số sao chưa hợp lệ");
      await createPremiumOrder({ user, variantId: stars!.id, quantity: amount, customData });
    }
  } catch (e: any) {
    const msg = String(e?.message || "");
    // Lỗi phía nhà cung cấp được thực thi nền xử lý (hoàn tiền nếu dứt khoát);
    // khách chỉ thấy thông báo sạch, không lộ mã/lỗi thô của provider.
    if (/FZR|provider|nhà cung cấp|402|403/i.test(msg)) back("/dashboard/telegram", "err", "Dịch vụ tạm gián đoạn, vui lòng thử lại sau");
    back("/dashboard/telegram", "err", msg || "Đặt đơn thất bại");
  }
  back("/dashboard/telegram/lich-su", "msg", "Đặt đơn thành công — sao/Premium đang được gửi tới tài khoản của bạn");
}

/** Phân công nhà cung cấp FZR phục vụ khu Telegram (Admin → Nhà cung cấp).
 *  Trang "Cài đặt Telegram" riêng đã bỏ (2026-11-08): FZR là một nhà cung
 *  cấp dùng chung — phân công nằm ở trang Nhà cung cấp, webhook nằm trong
 *  form nhà cung cấp FZR, công tắc mục Telegram nằm ở trang Mô-đun. Khóa
 *  setting giữ nguyên (telegram_provider_id), tầng thực thi đọc như cũ. */
export async function adminFzrAssignmentAction(formData: FormData) {
  await requireAdmin();
  const providerId = parseInt(String(formData.get("telegram_provider_id") || "0")) || 0;
  if (providerId) {
    const p = await prisma.provider.findUnique({ where: { id: providerId }, select: { driver: true } });
    if (!p || p.driver !== "FZR") back("/admin/nha-cung-cap", "err", "Nhà cung cấp đã chọn không phải FazerCards");
  }
  await setSetting("telegram_provider_id", providerId ? String(providerId) : "");
  back("/admin/nha-cung-cap", "msg", "Đã lưu nhà cung cấp phục vụ Telegram");
}

/** Kiểm tra kết nối FZR của nhà cung cấp đang phục vụ Telegram (số dư + gói). */
export async function adminTelegramTestAction() {
  await requireAdmin();
  const provider = await getTelegramProvider();
  if (!provider) back("/admin/nha-cung-cap", "err", "Chưa có nhà cung cấp FazerCards nào đang bật");
  try {
    const { fzrBalance, fzrMe } = await import("@/lib/fzr");
    const bal = await fzrBalance(provider!);
    const me: any = await fzrMe(provider!).catch(() => null);
    const plan = me?.plan || me?.subscription?.plan || me?.account?.plan || "";
    back("/admin/nha-cung-cap", "msg", `Kết nối OK — số dư FZR: ${bal.balance} ${bal.currency}${plan ? ` · gói: ${plan}` : ""}`);
  } catch (e: any) {
    back("/admin/nha-cung-cap", "err", `Kết nối thất bại: ${String(e?.message || e).slice(0, 160)}`);
  }
}

/** Admin kiểm tra trạng thái 1 đơn Telegram ngay (poll FZR theo yêu cầu). */
export async function adminTelegramPollAction(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("orderId") || "0"));
  const order = id ? await prisma.premiumOrder.findUnique({ where: { id }, include: { variant: { select: { providerGroup: true, providerId: true } } } }) : null;
  if (!order || !order.providerOrderId || !order.variant.providerId) back("/admin/telegram", "err", "Đơn chưa có mã phía nhà cung cấp để kiểm tra");
  const provider = await prisma.provider.findUnique({ where: { id: order.variant.providerId! } });
  if (!provider || provider.driver !== "FZR") back(`/admin/telegram/${id}`, "err", "Nhà cung cấp của đơn không phải FazerCards");
  const { pollFzrPremiumOrder } = await import("@/lib/fzr-orders");
  await pollFzrPremiumOrder(order as any).catch(() => null);
  back(`/admin/telegram/${id}`, "msg", "Đã kiểm tra trạng thái phía nhà cung cấp");
}
