import { redirect } from "next/navigation";
import { getSettings } from "./settings";

/** Mô-đun bật/tắt của hệ thống (luật Tín ban hành 2026-11-13: admin có MỘT
 *  khu Mô-đun liệt kê đầy đủ mọi module, mỗi module một công tắc lưu DB;
 *  TẮT = biến mất khỏi menu/trang phía khách VÀ route/API/action bị chặn
 *  ở phía máy chủ — helper này là điểm đọc chung cho cả hai lớp).
 *  Khoá setting giữ nguyên tên lịch sử (không đổi tên khoá); mặc định của
 *  từng khoá ở DEFAULT_SETTINGS giữ nguyên hành vi hiện tại của web. */
export type ModuleKey =
  | "premium" | "affiliate" | "register"
  | "promo" | "tickets" | "api" | "blog"
  | "telegram" | "pass" | "livechat"
  | "flashsale" | "heroBanner"
  | "steam" | "gamekey" | "giftcard" | "topup" | "manual";

const SETTING_KEY: Record<ModuleKey, string> = {
  premium: "module_premium",
  affiliate: "module_affiliate",
  register: "module_register",
  promo: "module_promo",
  tickets: "module_tickets",
  api: "module_api",
  blog: "module_blog",
  telegram: "telegram_enabled",
  pass: "pass_enabled",
  livechat: "livechat_enabled",
  flashsale: "module_flashsale",
  heroBanner: "hero_banner_enabled",
  steam: "area_steam_enabled",
  gamekey: "area_gamekey_enabled",
  giftcard: "area_giftcard_enabled",
  topup: "area_topup_enabled",
  manual: "area_manual_enabled",
};

export async function moduleOn(key: ModuleKey): Promise<boolean> {
  const s = await getSettings();
  return (s as Record<string, string>)[SETTING_KEY[key]] !== "0";
}

/** Guard cho TRANG phía khách: module tắt → chuyển thẳng về trang chủ.
 *  Dùng ở đầu server component của trang thuộc module (lớp chặn thứ nhất;
 *  action/API của module vẫn phải tự kiểm tra riêng — lớp thứ hai). */
export async function requireModuleOn(key: ModuleKey): Promise<void> {
  if (!(await moduleOn(key))) redirect("/");
}

/** Nhóm sản phẩm FZR (providerGroup của variant) → module khu riêng tương
 *  ứng. createPremiumOrder dùng map này để chặn đơn theo ĐÚNG công tắc của
 *  khu (đợt 126): nhóm không có trong map = sản phẩm Premium thường, do
 *  module_premium gác. Danh sách nhóm khớp DEDICATED_GROUPS của
 *  lib/order-scope (8 nhóm: telegram_stars, telegram_premium, steam_topup,
 *  steam_gift, gamekeys, giftcards, topups, manual). */
const GROUP_MODULE: Record<string, ModuleKey> = {
  telegram_stars: "telegram",
  telegram_premium: "telegram",
  steam_topup: "steam",
  steam_gift: "steam",
  gamekeys: "gamekey",
  giftcards: "giftcard",
  topups: "topup",
  manual: "manual",
};

export function moduleKeyForGroup(group?: string | null): ModuleKey | null {
  return group ? GROUP_MODULE[group] ?? null : null;
}

/** Tên hiển thị của module khu riêng — dùng trong thông báo lỗi khi đơn bị
 *  chặn vì khu đang tắt. */
export const MODULE_LABEL: Partial<Record<ModuleKey, string>> = {
  telegram: "Telegram",
  steam: "Steam",
  gamekey: "Game Key",
  giftcard: "Gift Card",
  topup: "Top-Up",
  manual: "Manual Services",
};
