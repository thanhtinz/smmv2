import { getSettings } from "./settings";
import { prisma } from "./db";

/** Mô-đun bật/tắt của hệ thống. Hai tầng cộng dồn kiểu VÀ:
 *  - Web mẹ tắt (setting module_*) -> tắt với mọi khách.
 *  - Panel con tắt (ChildPanel.module*) -> chỉ tắt với khách của panel đó.
 *  Các mảng smm/premium/panels/affiliate/register chỉ có tầng web mẹ (panel dùng
 *  sellSmm/sellPremium/moduleAffiliate/moduleRegister riêng ở Cài đặt panel). */
export type ModuleKey =
  | "smm" | "premium" | "panels" | "affiliate" | "register"
  | "bulk" | "subscriptions" | "campaigns" | "promo" | "tickets" | "api" | "blog";

const SETTING_KEY: Record<ModuleKey, string> = {
  smm: "module_smm",
  premium: "module_premium",
  panels: "module_panels",
  affiliate: "module_affiliate",
  register: "module_register",
  bulk: "module_bulk",
  subscriptions: "module_subscriptions",
  campaigns: "module_campaigns",
  promo: "module_promo",
  tickets: "module_tickets",
  api: "module_api",
  blog: "module_blog",
};

const PANEL_FIELD: Partial<Record<ModuleKey, "moduleBulk" | "moduleSubscriptions" | "moduleCampaigns" | "modulePromo" | "moduleTickets" | "moduleApi" | "moduleBlog">> = {
  bulk: "moduleBulk",
  subscriptions: "moduleSubscriptions",
  campaigns: "moduleCampaigns",
  promo: "modulePromo",
  tickets: "moduleTickets",
  api: "moduleApi",
  blog: "moduleBlog",
};

export async function moduleOn(key: ModuleKey, panelId?: number | null): Promise<boolean> {
  const s = await getSettings();
  if ((s as Record<string, string>)[SETTING_KEY[key]] === "0") return false;
  const field = PANEL_FIELD[key];
  if (field && panelId) {
    const p = await prisma.childPanel.findUnique({ where: { id: panelId }, select: { [field]: true } });
    if (p && (p as unknown as Record<string, boolean>)[field] === false) return false;
  }
  return true;
}
