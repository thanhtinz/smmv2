import { cookies } from "next/headers";
import { prisma } from "./db";
import { getSettings, getSiteUrl, siteUrlFromSettings } from "./settings";
import { resolveLangConfig } from "./lang-config";
import { sendMail, smtpConfigured } from "./mailer";
import { siteBaseUrl } from "./email-verify";
import { wideLogoUrl } from "./brand";

/**
 * EMAIL TỰ ĐỘNG CHO KHÁCH (đợt 119, lệnh Tín 2026-11-13) — khác hẳn
 * lib/alerts.ts (báo tin cho ADMIN): hệ thống này gửi thư cho CHÍNH KHÁCH
 * theo sự kiện của họ (trạng thái đơn, nạp tiền, ticket, Pass, cảnh báo
 * đăng nhập, thông báo hệ thống).
 *
 * Nguyên tắc cứng:
 *  - Chỉ gửi khi công tắc tổng customer_mail_enabled = "1" (mặc định TẮT)
 *    VÀ công tắc riêng của sự kiện bật VÀ SMTP đã cấu hình.
 *  - Mọi lỗi (kể cả SMTP hỏng) đều bị nuốt + ghi MailLog — KHÔNG BAO GIỜ
 *    làm hỏng luồng nghiệp vụ gọi tới. Các điểm móc gọi bằng `void`.
 *  - Phân loại: mail GIAO DỊCH (đơn/nạp/ticket/Pass) + BẢO MẬT
 *    (login_alert) là THIẾT YẾU — khách không tắt được; chỉ THÔNG BÁO HỆ
 *    THỐNG (announcement) là không thiết yếu — khách tắt bằng tuỳ chọn
 *    "Nhận email thông báo" (User.emailNotify) thì bị chặn.
 *  - Mẫu thư lưu ở settings mailtpl_<event>_{subject,body}_{vi,en}, admin
 *    sửa tại Admin → Báo cáo & Thông báo. Biến {{ten_bien}} không có dữ
 *    liệu -> thay bằng chuỗi rỗng, không bao giờ lộ "{{...}}" trong thư.
 */

export type CustomerMailEvent =
  | "order_created" | "order_delivered" | "order_refunded"
  | "deposit_success" | "ticket_replied"
  | "pass_purchased" | "pass_auto_renew" | "pass_auto_renew_failed"
  | "login_alert" | "announcement";

export interface CustomerMailEventMeta {
  key: CustomerMailEvent;
  label: string;
  /** true = thiết yếu (giao dịch/bảo mật): khách KHÔNG tắt được. */
  essential: boolean;
  /** Danh sách biến riêng của sự kiện (chưa gồm biến chung site_name/username/site_url). */
  vars: string[];
  hint: string;
}

export const CUSTOMER_MAIL_EVENTS: CustomerMailEventMeta[] = [
  { key: "order_created", label: "Đơn Premium vừa tạo", essential: true, vars: ["order_code", "product_name", "variant_name", "quantity", "total", "order_url"], hint: "Gửi ngay khi khách tạo đơn Premium thành công (mua bằng ví, thanh toán trực tiếp hoặc quà Pass)." },
  { key: "order_delivered", label: "Đơn đã giao", essential: true, vars: ["order_code", "product_name", "variant_name", "delivery_content", "order_url"], hint: "Đơn chuyển sang Đã giao/Hoàn thành — kèm nội dung đã giao của chính đơn đó." },
  { key: "order_refunded", label: "Đơn huỷ / hoàn tiền", essential: true, vars: ["order_code", "product_name", "refund_amount", "balance", "order_url"], hint: "Đơn bị huỷ hoặc nhà cung cấp từ chối — tiền đã hoàn về ví." },
  { key: "deposit_success", label: "Nạp tiền thành công", essential: true, vars: ["deposit_code", "amount", "bonus", "balance", "deposit_url"], hint: "Mọi đường cộng tiền thật: SePay, PayPal/Stripe, BoltUtil, admin duyệt / cộng tay." },
  { key: "ticket_replied", label: "Ticket được trả lời", essential: true, vars: ["ticket_id", "ticket_subject", "ticket_url"], hint: "Nhân viên trả lời ticket của khách." },
  { key: "pass_purchased", label: "Mua / gia hạn / đổi gói Pass", essential: true, vars: ["pass_name", "months", "price", "expiry_date", "pass_url"], hint: "Khách mua mới, gia hạn hoặc đổi gói Pass thành công." },
  { key: "pass_auto_renew", label: "Pass tự gia hạn thành công", essential: true, vars: ["pass_name", "months", "price", "expiry_date", "pass_url"], hint: "Cron tự gia hạn trừ ví thành công." },
  { key: "pass_auto_renew_failed", label: "Pass tự gia hạn thất bại", essential: true, vars: ["pass_name", "months", "price", "expiry_date", "pass_url"], hint: "Tự gia hạn thất bại (thiếu số dư / kỳ ngừng bán)." },
  { key: "login_alert", label: "Cảnh báo đăng nhập thiết bị mới", essential: true, vars: ["time", "ip", "device", "password_url"], hint: "BẢO MẬT: đăng nhập thành công từ IP/thiết bị chưa từng thấy của chính khách. Khách không tắt được sự kiện này." },
  { key: "announcement", label: "Thông báo hệ thống (phát toàn bộ khách)", essential: false, vars: [], hint: "Mẫu này là nội dung ĐIỀN SẴN cho form soạn đợt phát bên dưới; nội dung thật của mỗi đợt lưu ở đợt phát. Khách tắt 'Nhận email thông báo' sẽ không nhận." },
];

export const CUSTOMER_MAIL_COMMON_VARS = ["site_name", "username", "site_url"];

const EVENT_KEYS = new Set(CUSTOMER_MAIL_EVENTS.map((e) => e.key));
export function isCustomerMailEvent(v: string): v is CustomerMailEvent {
  return EVENT_KEYS.has(v as CustomerMailEvent);
}

/** Dữ liệu mẫu cho nút "Gửi thư thử" trong admin — số liệu MINH HOẠ rõ ràng. */
export const CUSTOMER_MAIL_SAMPLE_VARS: Record<CustomerMailEvent, Record<string, string>> = {
  order_created: { order_code: "PRE100001", product_name: "Sản phẩm mẫu", variant_name: "Gói mẫu 1 tháng", quantity: "1", total: "99.000đ", order_url: "" },
  order_delivered: { order_code: "PRE100001", product_name: "Sản phẩm mẫu", variant_name: "Gói mẫu 1 tháng", delivery_content: "TAIKHOAN_MAU / MATKHAU_MAU", order_url: "" },
  order_refunded: { order_code: "PRE100001", product_name: "Sản phẩm mẫu", refund_amount: "99.000đ", balance: "500.000đ", order_url: "" },
  deposit_success: { deposit_code: "NAP100001", amount: "100.000đ", bonus: "0đ", balance: "500.000đ", deposit_url: "" },
  ticket_replied: { ticket_id: "1", ticket_subject: "Ticket mẫu", ticket_url: "" },
  pass_purchased: { pass_name: "Pass", months: "3", price: "129.000đ", expiry_date: "13/02/2027", pass_url: "" },
  pass_auto_renew: { pass_name: "Pass", months: "3", price: "129.000đ", expiry_date: "13/02/2027", pass_url: "" },
  pass_auto_renew_failed: { pass_name: "Pass", months: "3", price: "129.000đ", expiry_date: "13/11/2026", pass_url: "" },
  login_alert: { time: "13/11/2026 10:30", ip: "203.0.113.10", device: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", password_url: "" },
  announcement: {},
};

/**
 * Thay biến {{ten}} trong mẫu:
 *  - dòng CHỈ chứa đúng một biến mà biến đó trống/thiếu -> bỏ cả dòng
 *    (để thư không có đoạn trống, vd dòng {{delivery_content}} khi đơn
 *    hoàn thành mà chưa có nội dung giao);
 *  - biến thiếu ở vị trí khác -> chuỗi rỗng. Không bao giờ lộ "{{...}}".
 */
export function renderMailTemplate(tpl: string, vars: Record<string, string>): string {
  const val = (k: string) => (vars[k] == null ? "" : String(vars[k]));
  const lines = String(tpl || "").split("\n").filter((line) => {
    const m = line.trim().match(/^\{\{(\w+)\}\}$/);
    return !(m && val(m[1]).trim() === "");
  });
  return lines.join("\n").replace(/\{\{(\w+)\}\}/g, (_m, k: string) => val(k));
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Khung thư HTML theo brand: đầu thư gradient brand + logo ngang của web,
 *  thân thư theo đoạn văn của mẫu, chân thư tên web. Màu brand cố định của
 *  web (brand-700 #2a55b8 → brand-600 #3866cc → brand-500 #4680ff). */
export function customerMailShell(input: { siteName: string; logoAbsUrl: string; bodyText: string }): string {
  const paras = input.bodyText
    .split(/\n{2,}/)
    .map((block) => block.split("\n").map((l) => esc(l)).join("<br/>"))
    .filter((b) => b.trim() !== "")
    .map((b) => `<p style="margin:0 0 14px;color:#334155;font-size:14.5px;line-height:1.65">${b}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:24px 12px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:linear-gradient(90deg,#2a55b8,#3866cc,#4680ff);padding:18px 24px">
      <img src="${esc(input.logoAbsUrl)}" alt="${esc(input.siteName)}" style="height:38px;max-width:220px;object-fit:contain;background:#ffffff;border-radius:8px;padding:4px 8px;display:block" />
    </div>
    <div style="padding:22px 24px 8px">${paras}</div>
    <div style="padding:14px 24px;background:#f8fafc;color:#94a3b8;font-size:12px;line-height:1.5">${esc(input.siteName)} — email tự động từ hệ thống, vui lòng không trả lời trực tiếp thư này.</div>
  </div>
</div>`;
}

/** Bản text thuần đi kèm (multipart alternative). */
export function customerMailText(input: { siteName: string; bodyText: string }): string {
  return `${input.siteName}\n\n${input.bodyText}\n\n— ${input.siteName} (email tự động, không cần trả lời)`;
}

/** Ngôn ngữ thư của khách: cookie ngôn ngữ giao diện của chính khách trong
 *  request hiện tại (smmv2-lang — nơi web tự lưu lựa chọn của khách); ngoài
 *  request (cron) hoặc cookie không còn được bật -> ngôn ngữ mặc định của
 *  site theo Admin → Ngôn ngữ. Mẫu chỉ có VI/EN nên ánh xạ về 2 bản này. */
export async function mailLang(s?: Record<string, string>): Promise<"vi" | "en"> {
  const settings = s || (await getSettings());
  const cfg = resolveLangConfig(settings);
  let cookieLang: string | null = null;
  try {
    cookieLang = (await cookies()).get("smmv2-lang")?.value || null;
  } catch { /* ngoài request (cron/test) */ }
  const lang = cookieLang && cfg.enabled.includes(cookieLang) ? cookieLang : cfg.defaultLang;
  return lang === "en" ? "en" : "vi";
}

async function logMail(data: { userId: number | null; event: string; toEmail: string; subject: string; status: "SENT" | "FAILED" | "SKIPPED"; reason?: string; campaignId?: number }) {
  try {
    await prisma.mailLog.create({
      data: {
        userId: data.userId,
        event: data.event,
        toEmail: data.toEmail.slice(0, 191),
        subject: data.subject.slice(0, 255),
        status: data.status,
        reason: data.reason ? data.reason.slice(0, 255) : null,
        campaignId: data.campaignId ?? null,
      },
    });
  } catch { /* ghi log lỗi không được làm hỏng luồng chính */ }
}

export type CustomerMailResult = "SENT" | "FAILED" | "SKIPPED" | "OFF";

interface DeliverArgs {
  userId: number | null;
  toEmail: string;
  username: string;
  event: CustomerMailEvent;
  vars: Record<string, string | number>;
  campaignId?: number;
  /** Nội dung soạn riêng (đợt phát thông báo) thay cho mẫu trong settings. */
  templateOverride?: { subjectVi: string; bodyVi: string; subjectEn?: string | null; bodyEn?: string | null };
  /** Ghi đè lý do log (vd thư thử). */
  logReason?: string;
}

/** Lõi dựng + gửi 1 thư (đã qua kiểm tra cổng ở sendCustomerMail hoặc đợt phát). */
async function deliver(args: DeliverArgs, s: Record<string, string>): Promise<CustomerMailResult> {
  const lang = await mailLang(s);
  const tplSubject = args.templateOverride
    ? lang === "en" && args.templateOverride.subjectEn ? args.templateOverride.subjectEn : args.templateOverride.subjectVi
    : s[`mailtpl_${args.event}_subject_${lang}`] || "";
  const tplBody = args.templateOverride
    ? lang === "en" && args.templateOverride.bodyEn ? args.templateOverride.bodyEn : args.templateOverride.bodyVi
    : s[`mailtpl_${args.event}_body_${lang}`] || "";
  // Mọi liên kết tuyệt đối trong thư dựng từ Liên kết web đã cấu hình
  // (setting site_url thắng env — đợt 120); đường dẫn nội bộ giữ nguyên.
  const base = siteUrlFromSettings(s) || siteBaseUrl();
  const vars: Record<string, string> = {
    site_name: s.site_name || "BNT Shop",
    username: args.username,
    site_url: base,
    order_url: `${base}/dashboard/don-premium`,
    deposit_url: `${base}/dashboard/nap-tien`,
    pass_url: `${base}/pass`,
    password_url: `${base}/dashboard/ho-so?tab=security`,
  };
  for (const [k, v] of Object.entries(args.vars)) vars[k] = v == null ? "" : String(v);
  const subject = renderMailTemplate(tplSubject, vars).replace(/\s*\n\s*/g, " ").trim();
  const bodyText = renderMailTemplate(tplBody, vars);
  if (!subject || !bodyText.trim()) {
    await logMail({ userId: args.userId, event: args.event, toEmail: args.toEmail, subject, status: "SKIPPED", reason: "Mẫu thư đang trống", campaignId: args.campaignId });
    return "SKIPPED";
  }
  const logoRel = wideLogoUrl(s.logo_menu_url, s.logo_url);
  const logoAbsUrl = /^https?:\/\//i.test(logoRel) ? logoRel : `${base}${logoRel.startsWith("/") ? "" : "/"}${logoRel}`;
  const html = customerMailShell({ siteName: vars.site_name, logoAbsUrl, bodyText });
  const text = customerMailText({ siteName: vars.site_name, bodyText });
  try {
    await sendMail([args.toEmail], subject, html, undefined, text);
    await logMail({ userId: args.userId, event: args.event, toEmail: args.toEmail, subject, status: "SENT", reason: args.logReason, campaignId: args.campaignId });
    return "SENT";
  } catch (e: any) {
    await logMail({ userId: args.userId, event: args.event, toEmail: args.toEmail, subject, status: "FAILED", reason: String(e?.message || e), campaignId: args.campaignId });
    return "FAILED";
  }
}

/**
 * Gửi 1 email tự động cho khách theo sự kiện. KHÔNG BAO GIỜ ném lỗi.
 * Trả "OFF" (không ghi log) khi công tắc tổng đang tắt — tính năng chưa bật
 * thì im lặng hoàn toàn như trước đợt 119.
 */
export async function sendCustomerMail(
  userId: number,
  event: CustomerMailEvent,
  vars: Record<string, string | number> = {},
  opts: { force?: boolean; logReason?: string } = {}
): Promise<CustomerMailResult> {
  try {
    const s = await getSettings();
    if (!opts.force) {
      if (s.customer_mail_enabled !== "1") return "OFF";
      if (s[`customer_mail_ev_${event}`] === "0") {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }).catch(() => null);
        await logMail({ userId, event, toEmail: u?.email || "", subject: "", status: "SKIPPED", reason: "Sự kiện đã tắt trong cấu hình email khách" });
        return "SKIPPED";
      }
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, emailNotify: true },
    });
    if (!user || !user.email) return "OFF";
    // Tuỳ chọn của khách CHỈ chặn mail không thiết yếu (announcement).
    if (!opts.force && event === "announcement" && user.emailNotify === false) {
      await logMail({ userId, event, toEmail: user.email, subject: "", status: "SKIPPED", reason: "Khách đã tắt nhận email thông báo" });
      return "SKIPPED";
    }
    if (!(await smtpConfigured())) {
      await logMail({ userId, event, toEmail: user.email, subject: "", status: "SKIPPED", reason: "Chưa cấu hình SMTP" });
      return "SKIPPED";
    }
    return await deliver({ userId, toEmail: user.email, username: user.username, event, vars, logReason: opts.logReason }, s);
  } catch {
    return "FAILED";
  }
}

/** Gửi thư thử 1 sự kiện về email của CHÍNH admin đang đăng nhập (nút trong
 *  admin): dùng mẫu + biến mẫu thật, bỏ qua công tắc tổng/sự kiện để admin
 *  kiểm tra được cả khi chưa bật hệ thống; vẫn cần SMTP đã cấu hình. */
export async function sendCustomerMailTest(admin: { id: number; email: string; username: string }, event: CustomerMailEvent): Promise<CustomerMailResult> {
  const vars: Record<string, string> = { ...CUSTOMER_MAIL_SAMPLE_VARS[event] };
  const base = (await getSiteUrl()) || siteBaseUrl();
  if (!vars.order_url) vars.order_url = `${base}/dashboard/don-premium`;
  if (!vars.deposit_url) vars.deposit_url = `${base}/dashboard/nap-tien`;
  if (!vars.pass_url) vars.pass_url = `${base}/pass`;
  if (!vars.password_url) vars.password_url = `${base}/dashboard/ho-so?tab=security`;
  if (!vars.ticket_url) vars.ticket_url = `${base}/dashboard/ticket`;
  return sendCustomerMail(admin.id, event, vars, { force: true, logReason: "Thư thử từ admin" });
}

/* ================= THÔNG BÁO HỆ THỐNG (PHÁT THEO LÔ) ================= */

export const ANNOUNCEMENT_BATCH_SIZE = 50;

/** Tạo 1 đợt phát thông báo hệ thống: chụp tổng số khách + mốc id cao nhất
 *  tại thời điểm tạo — khách đăng ký sau mốc này KHÔNG nhận đợt này. */
export async function createMailCampaign(input: {
  createdBy: number;
  subjectVi: string;
  bodyVi: string;
  subjectEn?: string;
  bodyEn?: string;
}) {
  const agg = await prisma.user.aggregate({ _count: { id: true }, _max: { id: true } });
  return prisma.mailCampaign.create({
    data: {
      subjectVi: input.subjectVi.slice(0, 255),
      bodyVi: input.bodyVi,
      subjectEn: input.subjectEn?.trim() ? input.subjectEn.slice(0, 255) : null,
      bodyEn: input.bodyEn?.trim() ? input.bodyEn : null,
      totalCount: agg._count.id,
      maxUserId: agg._max.id || 0,
      createdBy: input.createdBy,
    },
  });
}

/**
 * Xử lý 1 LÔ (tối đa 50 khách) của đợt phát đang chạy cũ nhất — gọi từ cron
 * /api/cron/sync. Công tắc tổng/từng sự kiện tắt hoặc SMTP chưa cấu hình thì
 * DỪNG không đốt người nhận (đợt giữ nguyên SENDING, bật lại là chạy tiếp).
 */
export async function processMailCampaignBatch(): Promise<{ campaignId: number; processed: number; sent: number; failed: number; skipped: number; done: boolean } | { processed: 0; skipped: string }> {
  const campaign = await prisma.mailCampaign.findFirst({ where: { status: "SENDING" }, orderBy: { id: "asc" } });
  if (!campaign) return { processed: 0, skipped: "no_campaign" };
  const s = await getSettings();
  if (s.customer_mail_enabled !== "1" || s.customer_mail_ev_announcement === "0") return { processed: 0, skipped: "disabled" };
  if (!(await smtpConfigured())) return { processed: 0, skipped: "smtp_not_configured" };

  const users = await prisma.user.findMany({
    where: { id: { gt: campaign.lastUserId, lte: campaign.maxUserId } },
    orderBy: { id: "asc" },
    take: ANNOUNCEMENT_BATCH_SIZE,
    select: { id: true, email: true, username: true, status: true, emailNotify: true },
  });
  // GIỮ CHỖ NGUYÊN TỬ cho lô này TRƯỚC khi gửi: hai lượt cron chạy chồng
  // nhau (lượt trước gửi chậm chưa xong) thì chỉ một lượt giữ được con trỏ —
  // lượt còn lại thấy claim trượt và bỏ qua, không gửi trùng 50 khách.
  // Đổi lại: tiến trình chết giữa lô sau khi đã giữ chỗ thì phần khách của
  // lô đó không được gửi (không trùng, không sai tiền — chấp nhận được với
  // thư thông báo; tiến độ vẫn hoàn tất nhờ con trỏ đã nhích).
  const lastId = users.length ? users[users.length - 1].id : campaign.lastUserId;
  const claim = await prisma.mailCampaign.updateMany({
    where: { id: campaign.id, status: "SENDING", lastUserId: campaign.lastUserId },
    data: { lastUserId: lastId },
  });
  if (claim.count === 0) return { processed: 0, skipped: "busy" };
  let sent = 0, failed = 0, skipped = 0;
  for (const u of users) {
    if (u.status !== "ACTIVE") {
      skipped++;
      await logMail({ userId: u.id, event: "announcement", toEmail: u.email || "", subject: campaign.subjectVi, status: "SKIPPED", reason: "Tài khoản đang bị khoá", campaignId: campaign.id });
      continue;
    }
    if (u.emailNotify === false) {
      skipped++;
      await logMail({ userId: u.id, event: "announcement", toEmail: u.email || "", subject: campaign.subjectVi, status: "SKIPPED", reason: "Khách đã tắt nhận email thông báo", campaignId: campaign.id });
      continue;
    }
    const r = await deliver(
      {
        userId: u.id,
        toEmail: u.email,
        username: u.username,
        event: "announcement",
        vars: {},
        campaignId: campaign.id,
        templateOverride: { subjectVi: campaign.subjectVi, bodyVi: campaign.bodyVi, subjectEn: campaign.subjectEn, bodyEn: campaign.bodyEn },
      },
      s
    );
    if (r === "SENT") sent++;
    else if (r === "FAILED") failed++;
    else skipped++;
  }
  const remaining = await prisma.user.count({ where: { id: { gt: lastId, lte: campaign.maxUserId } } });
  const done = remaining === 0;
  await prisma.mailCampaign.update({
    where: { id: campaign.id },
    data: {
      sentCount: { increment: sent },
      failedCount: { increment: failed },
      skippedCount: { increment: skipped },
      ...(done ? { status: "DONE" } : {}),
    },
  });
  return { campaignId: campaign.id, processed: users.length, sent, failed, skipped, done };
}
