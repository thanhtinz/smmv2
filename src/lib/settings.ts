import { prisma } from "./db";
import { encryptSecret, decryptSecret, isSecretSettingKey } from "./secret-box";

export const DEFAULT_SETTINGS: Record<string, string> = {
  // Thiết lập lần đầu (lệnh Tín 2026-11-11): "1" = đã tạo tài khoản quản trị
  // đầu tiên qua trang /setup. Bản cài mới KHÔNG có tài khoản mẫu/mặc định nào;
  // chừng nào users còn trống và cờ này chưa bật thì mọi trang khách bị dẫn về
  // /setup. Cờ chỉ lật một lần (xem lib/setup.ts).
  setup_completed: "",
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
  sepay_enabled: "1", // tick mục đích "Nạp vào ví" của SePay (mặc định bật — giữ nguyên hành vi cũ)
  cron_secret: "",
  intl_min_usd: "5",
  premium_max_qty: "50",
  order_max_links: "50",
  session_days: "7",
  paypal_enabled: "0",
  paypal_client_id: "",
  paypal_client_secret: "",
  paypal_mode: "sandbox",
  stripe_enabled: "0",
  stripe_publishable_key: "",
  stripe_secret_key: "",
  stripe_webhook_secret: "",
  // Hoa hồng giới thiệu (% trên giao dịch MUA của người được giới thiệu) — trang Giới thiệu bạn bè.
  // Hoa hồng cộng vào SỐ DƯ HOA HỒNG riêng; rút về ví chính khi đạt mức tối thiểu dưới đây.
  affiliate_percent: "6",
  affiliate_withdraw_min: "10000",
  // Gói thành viên PASS (lib/pass.ts, trang bán /pass — mẫu ldshop Pass, lệnh Tín
  // 2026-11-12): MỌI giá trị thương mại đều do admin đặt tại Cấu hình → tab Pass,
  // không hardcode. pass_enabled "0" = tắt hẳn (ẩn menu + trang). Giá kỳ = 0đ =
  // không bán kỳ đó. Phạm vi pass_scope: ALL | PREMIUM. Quà tháng: cặp
  // product/variant id của sản phẩm Premium admin chọn sẵn (trống = không có quà).
  pass_enabled: "0",
  pass_name: "",
  pass_price_1m: "0",
  pass_price_3m: "0",
  pass_price_12m: "0",
  pass_cashback_percent: "0",
  pass_discount_percent: "0",
  pass_scope: "ALL",
  pass_gift_product_id: "",
  pass_gift_variant_id: "",
  // Thưởng nạp dạng JSON: [{"from":500000,"percent":2},{"from":2000000,"percent":5}]
  deposit_bonus_tiers: JSON.stringify([{ from: 1000000, percent: 2 }, { from: 5000000, percent: 5 }]), // mốc thưởng mặc định — nguồn duy nhất (seed không ghi nữa)
  maintenance: "0",
  announcement_bar: "",
  // Trang trí mùa lễ hội (Tín duyệt thiết kế 2026-11-11): "1" = bật trang trí
  // toàn site theo seasonal_theme — 9 theme trong lib/seasonal (tet | noel |
  // halloween | trungthu | phucsinh | blackfriday | valentine | nammoi | quockhanh).
  seasonal_decor_enabled: "0",
  seasonal_theme: "tet",
  sys_announce_enabled: "1",
  sys_announce_content: "",
  // Landing + thương hiệu mở rộng + SEO (Cài đặt → Landing Page / Chung)
  auth_style: "classic",
  logo_url: "",
  logo_menu_url: "",
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
  // Bảo mật Enterprise GĐ1: bắt buộc tài khoản quản trị bật 2FA + whitelist IP vào khu quản trị
  admin_2fa_required: "1", // "1" = ADMIN/STAFF web mẹ + chủ/Admin panel con chưa bật 2FA thì bị dẫn đi thiết lập, chưa vào được khu quản trị
  admin_ip_whitelist: "", // mỗi IP 1 dòng; để trống = tắt (không chặn ai)
  emergency_lockdown: "0", // "1" = khoá khẩn cấp: khách không đăng nhập mới / đặt đơn / nạp / mua premium được (GĐ2)
  lockdown_reason: "", // lý do khoá khẩn cấp, hiện cho khách khi bị chặn
  stepup_amount_threshold: "1000000", // duyệt nạp từ số tiền này (VNĐ) phải xác thực lại (step-up); 0 = mọi lần duyệt
  // Bảo mật Enterprise GĐ3: Fraud Detection + Risk Score 0-100 (lib/risk.ts) — ngưỡng hành động
  risk_watch: "40", // >= ngưỡng này: gắn cờ theo dõi, hiện ở Trung tâm bảo mật
  risk_restrict: "70", // >= ngưỡng này: chặn tạo đơn + tạo lệnh nạp mới cho tới khi admin duyệt
  risk_critical: "90", // >= ngưỡng này: cấp CRITICAL chờ admin duyệt (không tự khoá tiền/khoá tài khoản)
  // GĐ3: trọng số từng tín hiệu rủi ro (điểm tối đa mỗi tín hiệu bị chặn bởi trần trong code)
  risk_w_shared: "10", // điểm cho MỖI tài khoản khác dùng chung IP/thiết bị đăng nhập gần nhất
  risk_w_faillogin: "3", // điểm cho mỗi lần đăng nhập thất bại trong 7 ngày
  risk_w_login_locked: "15", // điểm cộng thêm khi tài khoản đang bị khoá tạm vì đăng nhập sai nhiều lần
  risk_w_ipban: "25", // điểm nếu IP đăng nhập gần đây của tài khoản nằm trong danh sách cấm IP
  risk_w_deposit_reject: "30", // điểm tối đa theo tỉ lệ lệnh nạp bị từ chối (cần tối thiểu 3 lệnh nạp)
  risk_w_deposit_velocity: "20", // điểm khi số lệnh nạp trong 24 giờ vượt ngưỡng dưới
  risk_deposit_velocity_count: "8", // ngưỡng số lệnh nạp trong 24 giờ bị coi là bất thường
  risk_w_young_big: "15", // điểm khi tài khoản mới nạp 1 lần lớn bất thường
  risk_young_days: "7", // tuổi tài khoản (ngày) bị coi là "mới"
  risk_big_deposit_vnd: "5000000", // số tiền 1 lần nạp (VNĐ) bị coi là "lớn" với tài khoản mới
  risk_w_order_burst: "20", // điểm khi số đơn tạo trong 1 giờ vượt ngưỡng dưới
  risk_order_burst_count: "20", // ngưỡng số đơn trong 1 giờ bị coi là spam
  risk_w_cancel_ratio: "20", // điểm khi tỉ lệ đơn huỷ/hoàn cao (tối thiểu 10 đơn)
  risk_w_api_errors: "20", // điểm khi số lỗi gọi API reseller trong 24 giờ vượt ngưỡng dưới
  risk_api_error_count: "50", // ngưỡng lỗi API trong 24 giờ bị coi là lạm dụng
  risk_w_refunds: "20", // điểm khi số lần hoàn tiền/bảo hành trong 30 ngày từ 3 lần trở lên
  // GĐ3: Passkey (WebAuthn) — "1" = cho phép đăng ký + đăng nhập bằng Face ID/Touch ID/Windows Hello
  passkeys_enabled: "1",
  // GĐ3: xoay vòng khoá phiên — khoá ký JWT lưu trong DB (mã hoá bằng secret-box khi có
  // APP_ENC_KEY); trống = dùng AUTH_SECRET ở env như trước. Khoá cũ (prev) còn hiệu lực 7 ngày.
  session_secret: "",
  session_secret_prev: "",
  session_secret_rotated_at: "",
  // Chống brute-force đăng nhập (Cài đặt → Bảo mật)
  bf_enabled: "1",
  bf_max_attempts: "10",
  bf_lock_seconds: "300",
  // Bảo mật đăng ký (Bảo mật nâng cao)
  reg_honeypot: "1",
  reg_block_disposable: "0",
  reg_max_per_ip_hour: "5",
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
  // Email nhận RIÊNG theo sự kiện (đợt 111, Tín chốt 2026-11-12): điền thì sự
  // kiện đó gửi tới danh sách này; để trống thì dùng danh sách chung
  // alert_email_to như hành vi cũ. Khoá động alert_email_to_<event> theo
  // ALERT_EVENTS trong lib/alerts.ts.
  alert_email_to_premium_order: "",
  alert_email_to_deposit_pending: "",
  alert_email_to_deposit_success: "",
  alert_email_to_ticket: "",
  alert_email_to_new_user: "",
  alert_email_to_risk: "",
  alert_email_to_low_balance: "",
  alert_email_to_stock: "",
  // Ngưỡng "sắp hết kho" cho sự kiện stock: tồn còn lại rơi xuống bằng/dưới
  // số này thì cảnh báo 1 lần khi vừa vượt mốc. 0 = tắt cảnh báo sắp hết,
  // chỉ báo khi hết kho hẳn (tồn chạm 0).
  alert_stock_low_threshold: "5",
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
  module_promo: "1",
  module_tickets: "1",
  module_api: "1",
  module_blog: "1",
  module_premium: "1",
  // Telegram (khu riêng Admin → Telegram): bật/tắt + nhà cung cấp FZR phục vụ
  telegram_enabled: "1",
  fzr_webhook_secret: "", // secret webhook FazerCards (lưu mã hoá qua secret-box)
  telegram_topup_offer_id: "", // offer top-up Telegram (theo username) do đồng bộ FZR ghi nhận
  telegram_topup_field: "",
  telegram_topup_provider_id: "",
  telegram_provider_id: "",
  ai_enabled: "0",
  // AI Kiểm tra: quét link đơn hàng bằng AI, gắn cờ rủi ro nếu vi phạm (tab AI Kiểm tra)
  ai_check_enabled: "0",
  // SMM Tool API: key cho tool ngoài lấy đơn thủ công chờ xử lý + cập nhật trạng thái (tab SMM Tool API)
  tool_api_key: "",
  ai_provider: "openai",
  ai_base_url: "",
  ai_api_key: "",
  ai_model: "",
  // Meta Model API (Muse): key + model RIÊNG cho nhà Meta để không lẫn với key
  // OpenAI/Gemini; ai_meta_api_key khớp regex khoá bí mật nên tự mã hoá khi lưu.
  // Model mặc định là Muse Wonder theo tài liệu dev.meta.ai (muse-wonder-1.0).
  ai_meta_api_key: "",
  ai_meta_model: "muse-wonder-1.0",
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
  usdt_rate: "", // tỉ giá riêng 1 USDT (VNĐ) — để trống = dùng usd_rate
  // Tỉ giá thị trường tự động (2026-11-08): nguồn CHÍNH Frankfurter v2, dự phòng
  // open.er-api.com — cả hai là tỉ giá THAM CHIẾU THEO NGÀY. Mỗi tiền tệ có bộ ba
  // fx_manual_<code> / fx_auto_<code> / fx_lock_<code> (rỗng = suy từ tỉ giá hiệu
  // lực hiện tại); khoá tay = auto không bao giờ ghi đè tỉ giá đang dùng.
  rates_auto_enabled: "0",
  rates_auto_updated_at: "", // ISO lần cập nhật tự động gần nhất
  rates_auto_source: "", // nguồn tỉ giá tự động đã dùng ở lần cập nhật gần nhất
  rates_auto_error: "", // lỗi cập nhật tự động gần nhất (rỗng = lần cuối thành công)
  fx_safety_margin_percent: "1", // % biên an toàn khi cộng tiền NẠP bằng tỉ giá auto (không khoá tay)
  // Log lần kiểm tra kết nối gần nhất của từng cổng nạp (JSON {at, ok, detail})
  gateway_test_sepay: "",
  gateway_test_boltutil: "",
  gateway_test_paypal: "",
  gateway_test_stripe: "",
  // BoltUtil thay nạp USDT thủ công (2026-11-07): cổng stablecoin không giữ tiền,
  // tiền về thẳng ví nhận của shop cấu hình trong dashboard BoltUtil.
  boltutil_enabled: "0",
  // Thanh toán trực tiếp khi mua giỏ hàng (2026-11-08): tick riêng từng cổng —
  // chỉ cổng đang BẬT + có tick mới hiện ở bước xác nhận của giỏ.
  direct_sepay_enabled: "0",
  direct_boltutil_enabled: "0",
  direct_stripe_enabled: "0",
  direct_paypal_enabled: "0",
  purchase_payment_expires_minutes: "30", // hạn chờ của 1 phiên thanh toán trực tiếp ở giỏ (phút)
  // Phân trang danh sách (rà soát hardcode 2026-11-08): cỡ trang của các danh
  // mục/lịch sử phía khách + trang sản phẩm phía admin — sửa ở Cấu hình → Chung/Bảo mật.
  catalog_page_size: "24", // số sản phẩm mỗi trang ở các danh mục khu riêng (Game Key / Gift Card / Top-Up / Manual)
  // Watermark ảnh tải lên (đợt 2026-11-08): đóng dấu mờ tên site lên ảnh
  // sản phẩm/banner tải qua pipeline /api/admin/upload. watermark_text để
  // trống = dùng site_name. opacity = % độ đậm của dấu (5..80).
  watermark_enabled: "1",
  watermark_text: "",
  watermark_opacity: "35",
  history_page_size: "15", // số đơn mỗi trang ở các trang lịch sử đơn của khách
  admin_product_page_size: "10", // số sản phẩm mỗi trang ở các trang quản trị sản phẩm
  admin_list_page_size: "20", // số dòng mỗi trang ở các danh sách vận hành trong quản trị (nạp tiền, bảo mật, đơn Telegram)
  password_reset_ttl_minutes: "60", // link đặt lại mật khẩu sống bao nhiêu phút
  email_verify_ttl_hours: "24", // link xác thực email sống bao nhiêu giờ
  flash_max_percent: "90", // trần % giảm của một đợt flash sale (áp ở getActiveFlashSale)
  boltutil_api_key: "", // X-Bolt-Key (mã hoá secret-box qua setSetting)
  boltutil_webhook_secret: "", // khoá ký HMAC webhook + gọi API (mã hoá secret-box)
  boltutil_api_url: "", // để trống = https://api.boltutil.com (chỉ đổi khi test mock)
  boltutil_default_network: "TRON",
  boltutil_networks: "TRON", // các mạng được phép chọn khi nạp (phẩy ngăn cách)
  boltutil_expires_minutes: "30",
  boltutil_payment_method: "MANUAL_TRANSFER", // MANUAL_TRANSFER = phí 0% vĩnh viễn, hợp thói quen chuyển tay của khách
  usdt_min: "5", // số USDT tối thiểu mỗi lần khai nạp
  provider_low_balance_default: "200000", // ngưỡng cảnh báo số dư nhà cung cấp khi nhà cung cấp chưa đặt riêng
  subscription_max_active: "10", // tối đa gói định kỳ đang chạy của mỗi khách
  auto_refill_window_days: "7", // auto-refill: chỉ xử lý đơn hoàn thành trong số ngày này
  auto_refill_settle_minutes: "30", // auto-refill: chờ sau khi đơn hoàn thành bao nhiêu phút
  cleanup_retention_days: "30", // dọn dẹp hệ thống: xoá nhật ký/thông báo cũ hơn số ngày này
  // Tích điểm (đợt bổ sung): điểm nhận mỗi 100.000đ chi tiêu đơn hoàn thành + giá trị 1 điểm khi đổi ra số dư + tối thiểu điểm mỗi lần đổi
  points_per_100k: "1",
  points_value_vnd: "100",
  points_min_redeem: "10",
  // SEO & đo lường: Google Analytics (GA4 measurement id) + mã xác minh Google Search Console
  ga_id: "",
  gsc_verification: "",
  // Quản lý ngôn ngữ (Admin → Ngôn ngữ): ngôn ngữ đang bật (JSON mảng mã), ngôn ngữ mặc định
  // cho khách mới, và bản dịch tuỳ chỉnh đè lên từ điển gốc (JSON {lang: {chuỗi Việt: bản dịch}})
  langs_enabled: JSON.stringify(["vi", "en"]),
  default_lang: "en",
  lang_overrides: "{}",
};

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = isSecretSettingKey(r.key) ? decryptSecret(r.value) : r.value;
  return out;
}

export async function setSetting(key: string, value: string) {
  const stored = isSecretSettingKey(key) ? encryptSecret(value) : value;
  await prisma.setting.upsert({ where: { key }, create: { key, value: stored }, update: { value: stored } });
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



/** Đọc 1 setting dạng số nguyên có kẹp khoảng — nguồn mặc định duy nhất là DEFAULT_SETTINGS. */
export function intSetting(s: Record<string, string>, key: string, min: number, max: number): number {
  const v = parseInt(s[key] || "");
  const d = parseInt(DEFAULT_SETTINGS[key] || "");
  const n = Number.isFinite(v) && v > 0 ? v : d;
  return Math.min(max, Math.max(min, Number.isFinite(n) && n > 0 ? n : min));
}

/** Cỡ trang các danh mục phía khách (Game Key / Gift Card / Top-Up / Manual Services). */
export async function catalogPageSize(): Promise<number> {
  return intSetting(await getSettings(), "catalog_page_size", 1, 100);
}

/** Cỡ trang các lịch sử đơn phía khách (cả 6 khu riêng + danh sách đơn Premium/SMM). */
export async function historyPageSize(): Promise<number> {
  return intSetting(await getSettings(), "history_page_size", 1, 100);
}

/** Cỡ trang các danh sách vận hành trong quản trị (nạp tiền / trung tâm bảo mật / đơn Telegram). */
export async function adminListPageSize(): Promise<number> {
  return intSetting(await getSettings(), "admin_list_page_size", 1, 200);
}

/** Cỡ trang các trang quản trị sản phẩm (Premium + 6 khu FZR). */
export async function adminProductPageSize(): Promise<number> {
  return intSetting(await getSettings(), "admin_product_page_size", 1, 100);
}

/** Tỉ giá 1 USDT (VNĐ) hiệu lực: ưu tiên usdt_rate riêng, trống thì dùng usd_rate.
 *  Mọi nơi quy đổi USDT phải đi qua hàm này — trước đây mỗi nơi một chuỗi dự phòng khác nhau. */
export function usdtRateOf(s: Record<string, string>): number {
  return parseInt(s.usdt_rate || "") || parseInt(s.usd_rate || "") || parseInt(DEFAULT_SETTINGS.usd_rate);
}
