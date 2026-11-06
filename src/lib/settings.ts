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
  sepay_secret: "",
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
  // Landing + thương hiệu mở rộng + SEO (Cài đặt → Landing Page / Chung)
  landing_enabled: "1",
  landing_headline: "",
  landing_subtitle: "",
  auth_style: "classic",
  logo_url: "",
  favicon_url: "",
  meta_description: "",
  meta_keywords: "",
  og_image_url: "",
  contact_email: "",
  footer_text: "",
  // Thông báo & điều khoản (Cài đặt → Thông báo)
  home_modal_enabled: "0",
  home_modal_content: "",
  terms_enabled: "0",
  terms_title: "Quy định & Điều khoản sử dụng hệ thống",
  terms_content: "",
  terms_version: "1",
  terms_checkbox_text: "Tôi đã đọc và đồng ý với điều khoản sử dụng",
  terms_button_text: "Xác nhận & Tiếp tục",
  // Bot Telegram theo dịch vụ (JSON [{id,name,token,chatId}]) — Cài đặt → Telegram
  telegram_bots: "[]",
  // Chính sách mật khẩu (Cài đặt → Bảo mật / Bảo mật nâng cao)
  pw_require_upper: "0",
  pw_require_number: "0",
  pw_require_special: "0",
  // reCAPTCHA v2 (Cài đặt → Bảo mật)
  recaptcha_enabled: "0",
  recaptcha_site_key: "",
  recaptcha_secret: "",
  recaptcha_login: "0",
  recaptcha_register: "0",
  // Chống brute-force đăng nhập (Cài đặt → Bảo mật)
  bf_enabled: "1",
  bf_max_attempts: "10",
  bf_lock_seconds: "300",
  // Bảo mật đăng ký (Bảo mật nâng cao)
  reg_honeypot: "1",
  reg_block_disposable: "0",
  reg_max_per_ip_hour: "0",
  reg_banned_domains: "mailinator.com\nyopmail.com\ntemp-mail.com\nthrowawaymail.com\nguerrillamail.com",
  smtp_enabled: "1",
  smtp_from_name: "",
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
  // Báo tin & báo cáo đa kênh cho admin (Email / Discord + sự kiện + báo cáo ngày)
  alert_email_enabled: "0",
  alert_email_to: "",
  alert_discord_enabled: "0",
  alert_discord_webhook: "",
  alert_events: "",
  report_daily_enabled: "0",
  report_time: "21:00",
  report_channels: "telegram",
  report_email_to: "",
  report_last_sent: "",
  // Script tuỳ chỉnh chèn vào trang (kiểu panel mẫu)
  custom_head_html: "",
  custom_body_html: "",
  // Bảo mật mật khẩu
  password_min_length: "6",
  module_register: "1",
  module_affiliate: "1",
  module_panels: "1",
  module_bulk: "1",
  module_subscriptions: "1",
  module_campaigns: "1",
  module_promo: "1",
  module_tickets: "1",
  module_api: "1",
  module_blog: "1",
  // NameServer khách trỏ tên miền website con về (admin điền theo hạ tầng thật; trống = chưa cấu hình)
  child_ns1: "",
  child_ns2: "",
  module_premium: "1",
  module_smm: "1",
  ai_enabled: "0",
  // AI Kiểm tra: quét link đơn hàng bằng AI, gắn cờ rủi ro nếu vi phạm (tab AI Kiểm tra)
  ai_check_enabled: "0",
  // SMM Tool API: key cho tool ngoài lấy đơn thủ công chờ xử lý + cập nhật trạng thái (tab SMM Tool API)
  tool_api_key: "",
  // Phí tạo website con cho khách của WEB MẸ (VNĐ, 0 = miễn phí) — panel con tự đặt phí riêng cho khách của mình
  panel_fee: "0",
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

/** Mốc thưởng nạp của một khách — NẠP LÀ RIÊNG, KHÔNG TÍNH CHUNG (luật của Tín):
 *  khách thuộc panel nào thì CHỈ dùng % thưởng của panel đó do chủ panel tự set
 *  (panel chưa set mốc = khách của panel không có thưởng, KHÔNG mượn mốc của web mẹ);
 *  khách của web mẹ dùng mốc của web mẹ. */
export function bonusTiersFor(panelTiers: string | null | undefined, isPanelMember: boolean, globalJson: string): string {
  if (isPanelMember) return panelTiers && panelTiers.trim() ? panelTiers : "[]";
  return globalJson;
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
