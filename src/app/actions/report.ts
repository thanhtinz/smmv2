"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSettings, setSetting } from "@/lib/settings";
import { sendDiscord, sendTelegramTo, alertEmailHtml, ALERT_EVENTS } from "@/lib/alerts";
import { sendMail } from "@/lib/mailer";
import { sendReport, ReportChannel } from "@/lib/report";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}
const str = (fd: FormData, k: string) => String(fd.get(k) || "").trim();
const PAGE = "/admin/bao-cao";

/** Lưu cấu hình báo tin đa kênh + báo cáo ngày của web mẹ. */
export async function saveMotherAlertsAction(formData: FormData) {
  await requireAdmin();
  const events = formData.getAll("ev").map(String).filter(Boolean);
  const channels = formData.getAll("rch").map(String).filter(Boolean);
  const data: Record<string, string> = {
    alert_email_enabled: str(formData, "alert_email_enabled") === "1" ? "1" : "0",
    alert_email_to: str(formData, "alert_email_to"),
    alert_discord_enabled: str(formData, "alert_discord_enabled") === "1" ? "1" : "0",
    alert_discord_webhook: str(formData, "alert_discord_webhook"),
    telegram_notify: str(formData, "telegram_notify") === "1" ? "1" : "0",
    telegram_bot_token: str(formData, "telegram_bot_token"),
    telegram_chat_id: str(formData, "telegram_chat_id"),
    alert_events: events.join(","),
    report_daily_enabled: str(formData, "report_daily_enabled") === "1" ? "1" : "0",
    report_time: str(formData, "report_time") || "21:00",
    report_channels: channels.join(",") || "telegram",
    report_email_to: str(formData, "report_email_to"),
  };
  // Đợt 111: email nhận riêng từng sự kiện (alert_email_to_<event>) + ngưỡng
  // sắp hết kho — lưu cùng form báo tin, không tạo trang cài đặt mới.
  for (const e of ALERT_EVENTS) data[`alert_email_to_${e.key}`] = str(formData, `alert_email_to_${e.key}`);
  const th = parseInt(str(formData, "alert_stock_low_threshold"));
  data.alert_stock_low_threshold = Number.isFinite(th) && th >= 0 ? String(th) : "5";
  for (const [k, v] of Object.entries(data)) await setSetting(k, v);
  back(PAGE, "msg", "Đã lưu cấu hình báo tin & báo cáo");
}

/** Gửi tin thử qua 1 kênh (dùng cấu hình ĐÃ LƯU). */
export async function testMotherChannelAction(formData: FormData) {
  await requireAdmin();
  const channel = str(formData, "channel");
  const s = await getSettings();
  const text = `Tin nhắn thử từ ${s.site_name || "BNT Shop"} — kênh báo tin của bạn đã hoạt động.`;
  try {
    if (channel === "telegram") {
      if (!s.telegram_bot_token || !s.telegram_chat_id) back(PAGE, "err", "Chưa có Bot Token / Chat ID — điền và Lưu trước khi gửi thử");
      await sendTelegramTo(s.telegram_bot_token, s.telegram_chat_id, text);
    } else if (channel === "discord") {
      if (!s.alert_discord_webhook) back(PAGE, "err", "Chưa có Discord Webhook URL — điền và Lưu trước khi gửi thử");
      await sendDiscord(s.alert_discord_webhook, text);
    } else if (channel === "email") {
      const to = (s.alert_email_to || s.report_email_to).split(",").map((x) => x.trim()).filter(Boolean);
      if (!to.length) back(PAGE, "err", "Chưa nhập email nhận — điền và Lưu trước khi gửi thử");
      await sendMail(to, `Tin nhắn thử — ${s.site_name || "BNT Shop"}`, alertEmailHtml("Tin nhắn thử", text));
    } else {
      back(PAGE, "err", "Kênh không hợp lệ");
    }
    back(PAGE, "msg", `Đã gửi tin thử qua ${channel} — kiểm tra nơi nhận nhé`);
  } catch (e: any) {
    if (String((e as any)?.digest || "").startsWith("NEXT_REDIRECT")) throw e; // back()/done() ném redirect — không được nuốt thành thông báo lỗi
    back(PAGE, "err", `Gửi thử thất bại: ${String(e?.message || e)}`);
  }
}

/* ---------- EMAIL TỰ ĐỘNG CHO KHÁCH (đợt 119) ---------- */

/** Lưu công tắc + mẫu thư email khách (cùng trang Báo cáo & Thông báo). */
export async function saveCustomerMailAction(formData: FormData) {
  await requireAdmin();
  const { CUSTOMER_MAIL_EVENTS } = await import("@/lib/customer-mail");
  await setSetting("customer_mail_enabled", str(formData, "customer_mail_enabled") === "1" ? "1" : "0");
  for (const e of CUSTOMER_MAIL_EVENTS) {
    await setSetting(`customer_mail_ev_${e.key}`, formData.get(`ev_${e.key}`) === "1" ? "1" : "0");
    for (const f of ["subject_vi", "body_vi", "subject_en", "body_en"]) {
      const v = formData.get(`mailtpl_${e.key}_${f}`);
      if (v !== null) await setSetting(`mailtpl_${e.key}_${f}`, String(v));
    }
  }
  back(PAGE, "msg", "Đã lưu cấu hình email tự động cho khách");
}

/** Gửi thư thử 1 sự kiện về email của chính admin đang đăng nhập. */
export async function testCustomerMailAction(formData: FormData) {
  const admin = await requireAdmin();
  const { isCustomerMailEvent, sendCustomerMailTest } = await import("@/lib/customer-mail");
  const { smtpConfigured } = await import("@/lib/mailer");
  const event = str(formData, "event");
  if (!isCustomerMailEvent(event)) back(PAGE, "err", "Sự kiện thư không hợp lệ");
  if (!(await smtpConfigured())) back(PAGE, "err", "Chưa cấu hình SMTP — vào Cấu hình → tab Email để điền trước");
  const r = await sendCustomerMailTest({ id: admin.id, email: admin.email, username: admin.username }, event);
  if (r === "SENT") back(PAGE, "msg", `Đã gửi thư thử sự kiện "${event}" về ${admin.email} — kiểm tra hộp thư nhé`);
  back(PAGE, "err", `Gửi thư thử thất bại (${r}) — xem Nhật ký gửi mail bên dưới để biết lý do`);
}

/** Tạo 1 đợt PHÁT THÔNG BÁO HỆ THỐNG qua email — cron gửi theo lô 50 khách/lượt. */
export async function createAnnouncementAction(formData: FormData) {
  const admin = await requireAdmin();
  const s = await getSettings();
  const { smtpConfigured } = await import("@/lib/mailer");
  const subjectVi = str(formData, "ann_subject_vi");
  const bodyVi = String(formData.get("ann_body_vi") || "").trim();
  if (!subjectVi || !bodyVi) back(PAGE, "err", "Thiếu tiêu đề hoặc nội dung thông báo (tiếng Việt)");
  if (s.customer_mail_enabled !== "1" || s.customer_mail_ev_announcement === "0") {
    back(PAGE, "err", "Hệ thống email khách đang tắt (hoặc sự kiện Thông báo hệ thống đang tắt) — bật công tắc và Lưu cấu hình trước khi phát");
  }
  if (!(await smtpConfigured())) back(PAGE, "err", "Chưa cấu hình SMTP — vào Cấu hình → tab Email để điền trước");
  const { createMailCampaign } = await import("@/lib/customer-mail");
  const c = await createMailCampaign({
    createdBy: admin.id,
    subjectVi,
    bodyVi,
    subjectEn: str(formData, "ann_subject_en"),
    bodyEn: String(formData.get("ann_body_en") || ""),
  });
  back(PAGE, "msg", `Đã tạo đợt phát thông báo #${c.id} cho ${c.totalCount} khách — hệ thống sẽ gửi dần theo từng lượt cron (50 khách/lượt)`);
}

/** Gửi báo cáo ngày ngay lập tức qua các kênh đã chọn cho báo cáo. */
export async function sendMotherReportNowAction() {
  await requireAdmin();
  const s = await getSettings();
  const channels = (s.report_channels || "telegram").split(",").map((x) => x.trim()).filter(Boolean) as ReportChannel[];
  if (!channels.length) back(PAGE, "err", "Chưa chọn kênh gửi báo cáo nào");
  const results = await sendReport({}, channels);
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  if (ok.length && !fail.length) back(PAGE, "msg", `Đã gửi báo cáo qua: ${ok.map((r) => r.channel).join(", ")}`);
  if (ok.length && fail.length) back(PAGE, "msg", `Đã gửi qua ${ok.map((r) => r.channel).join(", ")}; lỗi: ${fail.map((r) => `${r.channel} (${r.note})`).join("; ")}`);
  back(PAGE, "err", `Gửi báo cáo thất bại: ${fail.map((r) => `${r.channel} (${r.note})`).join("; ")}`);
}
