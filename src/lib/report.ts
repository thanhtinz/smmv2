import { prisma } from "./db";
import { decryptPanelSecrets } from "./panel-secrets";
import { getSettings, setSetting } from "./settings";
import { getStats, Scope, StatsBundle } from "./stats";
import { sendDiscord, sendTelegramTo } from "./alerts";
import { sendMail } from "./mailer";
import { vnd, num } from "./format";

/** Báo cáo ngày: thu nhập + mặt hàng bán chạy + top khách + việc chờ xử lý.
 *  Gửi qua Email / Telegram / Discord theo cấu hình của web mẹ hoặc từng panel.
 *  Chạy từ cron (maybeSendDailyReports) hoặc bấm "Gửi báo cáo ngay". */

export type ReportChannel = "email" | "telegram" | "discord";

function periodLine(label: string, p: StatsBundle["today"]) {
  return `${label}: doanh thu ${vnd(p.revenue)} · lãi ${vnd(p.profit)} · ${num(p.orders)} đơn · nạp ${vnd(p.deposits)} · ${num(p.newUsers)} khách mới`;
}

export function buildReportText(st: StatsBundle, dateLabel: string) {
  const lines: string[] = [];
  lines.push(`BÁO CÁO NGÀY ${dateLabel} — ${st.scopeName}`);
  lines.push("");
  lines.push("THU NHẬP");
  lines.push(periodLine("Hôm nay", st.today));
  lines.push(periodLine("7 ngày", st.last7));
  lines.push(periodLine("Tháng này", st.month));
  lines.push("");
  lines.push("MẶT HÀNG BÁN CHẠY (30 ngày)");
  if (st.bestSmm.length) {
    lines.push("Dịch vụ SMM:");
    st.bestSmm.slice(0, 5).forEach((b, i) => lines.push(`${i + 1}. ${b.name} — ${num(b.orders)} đơn · ${vnd(b.revenue)}`));
  }
  if (st.bestPremium.length) {
    lines.push("Premium:");
    st.bestPremium.slice(0, 5).forEach((b, i) => lines.push(`${i + 1}. ${b.name} — ${num(b.quantity)} gói · ${vnd(b.revenue)}`));
  }
  if (!st.bestSmm.length && !st.bestPremium.length) lines.push("Chưa có đơn nào trong 30 ngày.");
  lines.push("");
  lines.push("TOP KHÁCH CHI TIÊU");
  if (st.topUsers.length) st.topUsers.slice(0, 5).forEach((u, i) => lines.push(`${i + 1}. ${u.username} — ${vnd(u.spend)} · ${num(u.orders)} đơn`));
  else lines.push("Chưa có dữ liệu.");
  lines.push("");
  lines.push(`VIỆC CHỜ: ${num(st.pending.deposits)} yêu cầu nạp · ${num(st.pending.smmManual)} đơn SMM thủ công · ${num(st.pending.premium)} đơn Premium · ${num(st.pending.tickets)} ticket đang mở`);
  return lines.join("\n");
}

export function buildReportHtml(st: StatsBundle, dateLabel: string) {
  const row = (cells: string[], bold = false) =>
    `<tr>${cells.map((c) => `<td style="padding:8px 10px;border-bottom:1px solid #eef2f7;font-size:13px;color:#334155;${bold ? "font-weight:700;color:#0f172a" : ""}">${c}</td>`).join("")}</tr>`;
  const head = (t: string, color: string) =>
    `<div style="margin:20px 0 8px;font-size:13px;font-weight:800;letter-spacing:.04em;color:${color}">${t}</div>`;
  const per = (label: string, p: StatsBundle["today"]) =>
    row([label, vnd(p.revenue), vnd(p.profit), `${num(p.orders)} đơn`, vnd(p.deposits)]);
  return `<div style="font-family:Arial,sans-serif;background:#f1f5f9;padding:24px">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:linear-gradient(90deg,#2563eb,#7c3aed);color:#fff;padding:18px 24px">
      <div style="font-size:18px;font-weight:800">Báo cáo ngày ${dateLabel}</div>
      <div style="font-size:13px;opacity:.85">${st.scopeName}</div>
    </div>
    <div style="padding:6px 24px 22px">
      ${head("THU NHẬP", "#2563eb")}
      <table style="width:100%;border-collapse:collapse">
        ${row(["Kỳ", "Doanh thu", "Lợi nhuận", "Đơn", "Tiền nạp"], true)}
        ${per("Hôm nay", st.today)}${per("7 ngày", st.last7)}${per("Tháng này", st.month)}
      </table>
      ${head("MẶT HÀNG BÁN CHẠY — 30 NGÀY", "#7c3aed")}
      <table style="width:100%;border-collapse:collapse">
        ${st.bestSmm.slice(0, 5).map((b, i) => row([`${i + 1}. ${b.name}`, `${num(b.orders)} đơn`, vnd(b.revenue)])).join("")}
        ${st.bestPremium.slice(0, 5).map((b, i) => row([`${i + 1}. ${b.name}`, `${num(b.quantity)} gói`, vnd(b.revenue)])).join("")}
        ${!st.bestSmm.length && !st.bestPremium.length ? row(["Chưa có đơn nào trong 30 ngày", "", ""]) : ""}
      </table>
      ${head("TOP KHÁCH CHI TIÊU", "#d97706")}
      <table style="width:100%;border-collapse:collapse">
        ${st.topUsers.slice(0, 5).map((u, i) => row([`${i + 1}. ${u.username}`, `${num(u.orders)} đơn`, vnd(u.spend)])).join("") || row(["Chưa có dữ liệu", "", ""])}
      </table>
      <div style="margin-top:20px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;font-size:13px;color:#9a3412">
        Việc chờ xử lý: <b>${num(st.pending.deposits)}</b> yêu cầu nạp · <b>${num(st.pending.smmManual)}</b> đơn SMM thủ công · <b>${num(st.pending.premium)}</b> đơn Premium · <b>${num(st.pending.tickets)}</b> ticket đang mở
      </div>
    </div>
  </div></div>`;
}

/** Gửi báo cáo cho 1 phạm vi qua các kênh chỉ định. Trả về kết quả từng kênh để hiện lên giao diện. */
export async function sendReport(scope: Scope, channels: ReportChannel[]): Promise<{ channel: string; ok: boolean; note: string }[]> {
  const st = await getStats(scope);
  const dateLabel = new Date().toLocaleDateString("vi-VN");
  const text = buildReportText(st, dateLabel);
  const title = `Báo cáo ngày ${dateLabel} — ${st.scopeName}`;
  const out: { channel: string; ok: boolean; note: string }[] = [];

  if (!scope.panelId) {
    const s = await getSettings();
    for (const ch of channels) {
      try {
        if (ch === "telegram") {
          if (s.telegram_notify !== "1" || !s.telegram_bot_token || !s.telegram_chat_id) throw new Error("Chưa bật Telegram hoặc thiếu Bot Token / Chat ID");
          await sendTelegramTo(s.telegram_bot_token, s.telegram_chat_id, text);
        } else if (ch === "discord") {
          if (s.alert_discord_enabled !== "1" || !s.alert_discord_webhook) throw new Error("Chưa bật Discord hoặc thiếu Webhook URL");
          await sendDiscord(s.alert_discord_webhook, `**${title}**\n${text}`);
        } else {
          const toRaw = s.report_email_to || s.alert_email_to;
          const to = toRaw.split(",").map((x) => x.trim()).filter(Boolean);
          if (!to.length) throw new Error("Chưa nhập email nhận báo cáo");
          await sendMail(to, title, buildReportHtml(st, dateLabel));
        }
        out.push({ channel: ch, ok: true, note: "Đã gửi" });
      } catch (e: any) {
        out.push({ channel: ch, ok: false, note: String(e?.message || e) });
      }
    }
  } else {
    const panel = decryptPanelSecrets(await prisma.childPanel.findUnique({ where: { id: scope.panelId } }));
    if (!panel) return [{ channel: "panel", ok: false, note: "Không tìm thấy panel" }];
    for (const ch of channels) {
      try {
        if (ch === "telegram") {
          if (!panel.telegramBotToken || !panel.telegramChatId) throw new Error("Panel chưa cấu hình Telegram");
          await sendTelegramTo(panel.telegramBotToken, panel.telegramChatId, text);
        } else if (ch === "discord") {
          if (!panel.discordWebhook) throw new Error("Panel chưa cấu hình Discord Webhook");
          await sendDiscord(panel.discordWebhook, `**${title}**\n${text}`);
        } else {
          if (!panel.alertEmail) throw new Error("Panel chưa nhập email nhận báo cáo");
          const override = panel.smtpHost && panel.smtpUser && panel.smtpFrom
            ? { host: panel.smtpHost, port: panel.smtpPort, user: panel.smtpUser, pass: panel.smtpPass, from: panel.smtpFrom, secure: panel.smtpSecure }
            : null;
          await sendMail([panel.alertEmail], title, buildReportHtml(st, dateLabel), override);
        }
        out.push({ channel: ch, ok: true, note: "Đã gửi" });
      } catch (e: any) {
        out.push({ channel: ch, ok: false, note: String(e?.message || e) });
      }
    }
  }
  return out;
}

function vnNow() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}` };
}

/** Cron gọi: đến giờ cấu hình và hôm nay chưa gửi thì gửi báo cáo ngày (web mẹ + từng panel). */
export async function maybeSendDailyReports() {
  const res: any = { mother: null, panels: [] as any[] };
  const { date, hm } = vnNow();
  try {
    const s = await getSettings();
    if (s.report_daily_enabled === "1" && s.report_last_sent !== date && hm >= (s.report_time || "21:00")) {
      const channels = (s.report_channels || "telegram").split(",").map((x) => x.trim()).filter(Boolean) as ReportChannel[];
      res.mother = await sendReport({}, channels);
      if (res.mother.some((r: any) => r.ok)) await setSetting("report_last_sent", date);
    }
  } catch (e: any) { res.mother = String(e?.message || e); }
  try {
    const panels = (await prisma.childPanel.findMany({ where: { reportDaily: true } })).map((p) => decryptPanelSecrets(p)!);
    for (const p of panels) {
      if (p.reportLastSent === date) continue;
      if (hm < (p.reportTime || "21:00")) continue;
      const channels = (p.reportChannels || "telegram").split(",").map((x) => x.trim()).filter(Boolean) as ReportChannel[];
      if (!channels.length) continue;
      const r = await sendReport({ panelId: p.id }, channels);
      res.panels.push({ panel: p.name, result: r });
      if (r.some((x) => x.ok)) await prisma.childPanel.update({ where: { id: p.id }, data: { reportLastSent: date } });
    }
  } catch {}
  return res;
}
