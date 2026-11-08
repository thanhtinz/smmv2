import { getSettings } from "./settings";

/** Mô-đun bật/tắt của hệ thống: setting module_* = "0" là tắt cho mọi khách. */
export type ModuleKey =
  | "smm" | "premium" | "affiliate" | "register"
  | "bulk" | "subscriptions" | "campaigns" | "promo" | "tickets" | "api" | "blog";

const SETTING_KEY: Record<ModuleKey, string> = {
  smm: "module_smm",
  premium: "module_premium",
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


export async function moduleOn(key: ModuleKey): Promise<boolean> {
  const s = await getSettings();
  return (s as Record<string, string>)[SETTING_KEY[key]] !== "0";
}
