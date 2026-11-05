import { prisma } from "./db";

export const DEFAULT_SETTINGS: Record<string, string> = {
  site_name: "SMMv2",
  site_tagline: "SMM Panel & Tài khoản Premium — tự động 24/7",
  site_logo_text: "S",
  support_widget_enabled: "1",
  livechat_enabled: "1",
  support_telegram: "",
  support_facebook: "",
  support_zalo: "",
  support_hotline: "",
  // Giao diện mặc định cho khách mới (khách tự đổi được, lưu trên máy họ)
  default_accent: "blue",
  default_mode: "light",
  // Nạp ngân hàng
  bank_name: "",
  bank_account: "",
  bank_holder: "",
  bank_branch: "",
  // MoMo
  momo_phone: "",
  momo_name: "",
  // Nạp tiền
  deposit_min: "10000",
  // Bảo vệ lợi nhuận: "1" = chặn đặt đơn khi giá bán sau chiết khấu thấp hơn giá vốn
  profit_protection: "1",
  // Thanh toán quốc tế (PayPal / Stripe) — khách trả USD, hệ thống cộng VND theo tỉ giá này
  usd_rate: "25000",
  paypal_enabled: "0",
  paypal_client_id: "",
  paypal_client_secret: "",
  paypal_mode: "sandbox",
  stripe_enabled: "0",
  stripe_publishable_key: "",
  stripe_secret_key: "",
  stripe_webhook_secret: "",
  // Hoa hồng giới thiệu (% trên tiền nạp của người được giới thiệu) — trang Kiếm tiền
  affiliate_percent: "6",
  // Thưởng nạp dạng JSON: [{"from":500000,"percent":2},{"from":2000000,"percent":5}]
  deposit_bonus_tiers: "[]",
  maintenance: "0",
  announcement_bar: "",
  // % giảm theo cấp bậc (để trống ở DB thì dùng mặc định MEMBER 0 / RESELLER 5 / AGENCY 10 / VIP 15)
  level_discount_MEMBER: "0",
  level_discount_RESELLER: "5",
  level_discount_AGENCY: "10",
  level_discount_VIP: "15",
  // Email SMTP (Email Marketing + mail hệ thống)
  smtp_host: "",
  smtp_port: "587",
  smtp_user: "",
  smtp_pass: "",
  smtp_from: "",
  smtp_secure: "0",
  // Telegram báo tin cho admin (đơn mới / nạp thành công / ticket mới)
  telegram_bot_token: "",
  telegram_chat_id: "",
  telegram_notify: "0",
  // Script tuỳ chỉnh chèn vào trang (kiểu panel mẫu)
  custom_head_html: "",
  custom_body_html: "",
  // Bảo mật mật khẩu
  password_min_length: "6",
  module_register: "1",
  module_affiliate: "1",
  module_panels: "1",
  module_premium: "1",
  module_smm: "1",
  ai_enabled: "0",
  ai_provider: "openai",
  ai_base_url: "",
  ai_api_key: "",
  ai_model: "",
  google_enabled: "0",
  google_client_id: "",
  google_client_secret: "",
  usdt_enabled: "0",
  usdt_address: "",
  usdt_network: "TRC20",
  rate_usd: "25400",
  rate_eur: "27500",
  rate_cny: "3500",
  rate_thb: "730",
  rate_jpy: "165",
  rate_krw: "18",
};

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Nội dung chuyển khoản chuẩn của 1 user: "SMM <depositCode>" */
export function depositContent(code: string) {
  return `SMM ${code}`;
}

/** Tính thưởng nạp theo mốc */
export function calcBonus(amount: number, tiersJson: string): number {
  try {
    const tiers = JSON.parse(tiersJson || "[]") as { from: number; percent: number }[];
    let pct = 0;
    for (const t of tiers) if (amount >= t.from && t.percent > pct) pct = t.percent;
    return Math.floor((amount * pct) / 100);
  } catch {
    return 0;
  }
}

/** VietQR (img.vietqr.io) — bank BIN map rút gọn các ngân hàng phổ biến */
export const BANK_BINS: Record<string, string> = {
  Vietcombank: "VCB",
  Techcombank: "TCB",
  MB: "MB",
  "MB Bank": "MB",
  VietinBank: "ICB",
  BIDV: "BIDV",
  Agribank: "VBA",
  ACB: "ACB",
  Sacombank: "STB",
  VPBank: "VPB",
  TPBank: "TPB",
  SHB: "SHB",
  HDBank: "HDB",
  OCB: "OCB",
  MSB: "MSB",
  SeABank: "SEAB",
  VIB: "VIB",
  "Ngân hàng Á Châu": "ACB",
};

export function vietQrUrl(bankName: string, account: string, amount: number, content: string, holder: string) {
  const bin = BANK_BINS[bankName] || bankName;
  const q = new URLSearchParams({
    amount: String(amount),
    addInfo: content,
    accountName: holder,
  });
  return `https://img.vietqr.io/image/${bin}-${account}-compact2.png?${q.toString()}`;
}


/** % giảm giá theo cấp bậc — admin sửa được trong Cấu hình/Cấp bậc, mặc định như LEVEL_DISCOUNT */
export function levelDiscountFromSettings(s: Record<string, string>, level: string): number {
  const v = parseInt(s["level_discount_" + level] || "");
  if (Number.isFinite(v) && v >= 0 && v <= 90) return v;
  return { MEMBER: 0, RESELLER: 5, AGENCY: 10, VIP: 15 }[level] || 0;
}
