import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getStats } from "@/lib/stats";
import { ALERT_EVENTS } from "@/lib/alerts";
import { CUSTOMER_MAIL_EVENTS, CUSTOMER_MAIL_COMMON_VARS } from "@/lib/customer-mail";
import { PageHead, Flash } from "@/components/ui";
import { ExportCsvCard } from "@/components/export-csv";
import { ReportPreview } from "@/components/report-view";
import { saveMotherAlertsAction, testMotherChannelAction, sendMotherReportNowAction, saveCustomerMailAction, testCustomerMailAction, createAnnouncementAction } from "@/app/actions/report";
import { getServerI18n } from "@/lib/lang-server";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

const CHANNELS = [
  { key: "email", label: "Email", tile: "from-blue-500 to-indigo-600" },
  { key: "telegram", label: "Telegram", tile: "from-sky-500 to-cyan-600" },
  { key: "discord", label: "Discord", tile: "from-indigo-500 to-violet-600" },
];

/** Báo cáo & báo tin của web mẹ: thống kê thu nhập / bán chạy / top khách,
 *  cấu hình gửi qua Email + Telegram + Discord (bật tắt từng kênh, chọn sự kiện),
 *  báo cáo ngày tự động + gửi ngay. */
export default async function AdminReportPage({ searchParams }: { searchParams: { msg?: string; err?: string; mlog?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const s = await getSettings();
  const st = await getStats({});
  // Đợt 119: đợt phát thông báo hệ thống + nhật ký email khách (lọc theo sự kiện qua ?mlog=)
  const mailCampaigns = await prisma.mailCampaign.findMany({ orderBy: { id: "desc" }, take: 10 });
  const mlogEvent = CUSTOMER_MAIL_EVENTS.some((e) => e.key === searchParams.mlog) ? searchParams.mlog : "";
  const mailLogs = await prisma.mailLog.findMany({
    where: mlogEvent ? { event: mlogEvent } : {},
    orderBy: { id: "desc" },
    take: 30,
  });
  const enabledEvents = new Set((s.alert_events || "").split(",").map((x) => x.trim()).filter(Boolean));
  const allEvents = enabledEvents.size === 0;
  const reportChannels = new Set((s.report_channels || "telegram").split(",").map((x) => x.trim()).filter(Boolean));

  return (
    <div>
      <PageHead title={L("Báo cáo & Thông báo")} desc={L("Thống kê thu nhập, mặt hàng bán chạy, top khách — và nơi cấu hình gửi báo cáo/báo tin qua Email, Telegram, Discord.")}>
        <form action={sendMotherReportNowAction}>
          <button className="btn-primary">{L("Gửi báo cáo ngay")}</button>
        </form>
      </PageHead>
      <ExportCsvCard base="/api/admin/export" />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      <ReportPreview st={st} />

      <form action={saveMotherAlertsAction} className="card mt-8 space-y-6 p-6">
        <div>
          <div className="text-base font-bold text-slate-900">{L("Kênh báo tin")}</div>
          <p className="mt-0.5 text-sm text-slate-400">{L("Có sự kiện (đơn mới, nạp tiền, ticket...) hệ thống tự gửi tin qua các kênh đang bật. Chuông thông báo realtime trong Admin luôn hoạt động, không phụ thuộc phần này.")}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 font-black text-white">T</span>
              <span className="font-bold text-slate-900">Telegram</span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="telegram_notify" value="1" defaultChecked={s.telegram_notify === "1"} className="h-5 w-5 accent-emerald-600" /> {L("Bật")}
              </label>
            </div>
            <div className="space-y-3">
              <div><label className="lbl">Bot Token</label><input className="inp" name="telegram_bot_token" defaultValue={s.telegram_bot_token} placeholder="123456:ABC-..." /></div>
              <div><label className="lbl">{L("Chat ID nhận tin")}</label><input className="inp" name="telegram_chat_id" defaultValue={s.telegram_chat_id} placeholder="-1001234567890 hoặc 123456789" /></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-black text-white">D</span>
              <span className="font-bold text-slate-900">Discord</span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="alert_discord_enabled" value="1" defaultChecked={s.alert_discord_enabled === "1"} className="h-5 w-5 accent-emerald-600" /> {L("Bật")}
              </label>
            </div>
            <div><label className="lbl">Webhook URL</label><input className="inp" name="alert_discord_webhook" defaultValue={s.alert_discord_webhook} placeholder="https://discord.com/api/webhooks/..." /></div>
            <p className="mt-2 text-xs text-slate-400">{L("Trong Discord: Cài đặt kênh → Tích hợp → Webhooks → tạo mới rồi dán URL vào đây.")}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 font-black text-white">@</span>
              <span className="font-bold text-slate-900">Email</span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="alert_email_enabled" value="1" defaultChecked={s.alert_email_enabled === "1"} className="h-5 w-5 accent-emerald-600" /> {L("Bật")}
              </label>
            </div>
            <div><label className="lbl">{L("Email nhận tin (nhiều địa chỉ cách nhau dấu phẩy)")}</label><input className="inp" name="alert_email_to" defaultValue={s.alert_email_to} placeholder="admin@domain.vn" /></div>
            <p className="mt-2 text-xs text-slate-400">{L("Gửi qua máy chủ SMTP đã cấu hình ở Cấu hình → tab Email.")}</p>
          </div>
        </div>

        <div>
          <div className="mb-2.5 font-bold text-slate-900">{L("Sự kiện được báo tin")}</div>
          <div className="flex flex-wrap gap-2">
            {ALERT_EVENTS.map((e) => (
              <label key={e.key} className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
                <input type="checkbox" name="ev" value={e.key} defaultChecked={allEvents || enabledEvents.has(e.key)} className="h-4 w-4 accent-brand-600" />
                {L(e.label)}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">{L("Bỏ chọn hết = không báo sự kiện nào qua kênh ngoài (chuông realtime trong Admin vẫn chạy).")}</p>
        </div>

        <div>
          <div className="mb-1 font-bold text-slate-900">{L("Email nhận riêng theo sự kiện")}</div>
          <p className="mb-3 text-sm text-slate-400">{L("Mỗi sự kiện có thể nhận email riêng — để trống ô nào thì sự kiện đó dùng danh sách email chung ở trên.")}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ALERT_EVENTS.map((e) => (
              <div key={e.key}>
                <label className="lbl">{L(e.label)}</label>
                <input
                  className="inp"
                  name={`alert_email_to_${e.key}`}
                  defaultValue={s[`alert_email_to_${e.key}`] || ""}
                  placeholder={e.key === "ticket" ? L("Email hỗ trợ nhận ticket") : e.key.startsWith("deposit") || e.key === "premium_order" ? L("Email quản trị nhận đơn / nạp tiền") : L("Trống = dùng danh sách chung")}
                />
              </div>
            ))}
          </div>
          <div className="mt-5">
            <label className="lbl">{L("Ngưỡng cảnh báo sắp hết kho")}</label>
            <input type="number" min={0} step={1} name="alert_stock_low_threshold" defaultValue={s.alert_stock_low_threshold || "5"} className="inp !w-[130px]" />
            <p className="mt-2 text-xs text-slate-400">{L("Khi tồn của một gói rơi xuống bằng hoặc dưới số này, hệ thống báo sắp hết kho một lần. Đặt 0 = chỉ báo khi hết kho hẳn.")}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">{L("Báo cáo ngày tự động")}</span>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="report_daily_enabled" value="1" defaultChecked={s.report_daily_enabled === "1"} className="h-5 w-5 accent-emerald-600" /> {L("Bật gửi tự động")}
            </label>
            <span className="flex items-center gap-2 text-sm text-slate-600">{L("Giờ gửi")}
              <input type="time" name="report_time" defaultValue={s.report_time || "21:00"} className="inp !w-[130px]" />
            </span>
            {s.report_last_sent && <span className="text-xs text-slate-400">{L("Đã gửi gần nhất: ")}{s.report_last_sent}</span>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="lbl">{L("Gửi báo cáo qua kênh")}</label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
                    <input type="checkbox" name="rch" value={c.key} defaultChecked={reportChannels.has(c.key)} className="h-4 w-4 accent-brand-600" />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
            <div><label className="lbl">{L("Email nhận báo cáo (trống = dùng email báo tin)")}</label><input className="inp" name="report_email_to" defaultValue={s.report_email_to} placeholder="baocao@domain.vn" /></div>
          </div>
          <p className="mt-2 text-xs text-slate-400">{L("Báo cáo gồm: thu nhập hôm nay / 7 ngày / tháng, mặt hàng bán chạy, top khách và việc đang chờ xử lý. Cần cron đồng bộ chạy đều để hệ thống gửi đúng giờ.")}</p>
        </div>

        <button className="btn-primary w-full !py-3">{L("Lưu cấu hình")}</button>
      </form>

      <div className="card mt-6 p-6">
        <div className="mb-1 font-bold text-slate-900">{L("Gửi tin thử")}</div>
        <p className="mb-4 text-sm text-slate-400">{L("Dùng cấu hình đã lưu — kiểm tra từng kênh có nhận được tin không.")}</p>
        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((c) => (
            <form key={c.key} action={testMotherChannelAction}>
              <input type="hidden" name="channel" value={c.key} />
              <button className="btn-ghost">{L("Thử ")}{c.label}</button>
            </form>
          ))}
          <form action={sendMotherReportNowAction}>
            <button className="btn-dark">{L("Gửi báo cáo ngay")}</button>
          </form>
        </div>
      </div>

      {/* ===== ĐỢT 119: EMAIL TỰ ĐỘNG CHO KHÁCH ===== */}
      <form action={saveCustomerMailAction} className="card mt-8 space-y-6 p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold text-slate-900">{L("Email tự động cho khách")}</div>
            <p className="mt-0.5 text-sm text-slate-400">{L("Hệ thống tự gửi email cho chính khách theo sự kiện của họ (trạng thái đơn, nạp tiền, ticket, Pass, cảnh báo đăng nhập...). Gửi qua SMTP đã cấu hình ở Cấu hình → tab Email. Mọi thư đều được ghi vào nhật ký bên dưới; lỗi gửi không ảnh hưởng tới đơn hàng hay tiền của khách.")}</p>
          </div>
          <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" name="customer_mail_enabled" value="1" defaultChecked={s.customer_mail_enabled === "1"} className="h-5 w-5 accent-emerald-600" /> {L("Bật hệ thống email khách")}
          </label>
        </div>

        <div>
          <div className="mb-2.5 font-bold text-slate-900">{L("Sự kiện gửi email")}</div>
          <div className="flex flex-wrap gap-2">
            {CUSTOMER_MAIL_EVENTS.map((e) => (
              <label key={e.key} className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
                <input type="checkbox" name={`ev_${e.key}`} value="1" defaultChecked={s[`customer_mail_ev_${e.key}`] !== "0"} className="h-4 w-4 accent-brand-600" />
                {L(e.label)}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${e.essential ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{e.essential ? L("Thiết yếu") : L("Khách tắt được")}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">{L("Thiết yếu = mail giao dịch (đơn / nạp / ticket / Pass) và cảnh báo bảo mật: khách không tắt được. Chỉ thông báo hệ thống là không thiết yếu — khách tắt 'Nhận email thông báo' trong trang Thông báo của họ thì không nhận.")}</p>
        </div>

        <div>
          <div className="mb-2.5 font-bold text-slate-900">{L("Mẫu thư theo sự kiện")}</div>
          <p className="mb-3 text-sm text-slate-400">{L("Mỗi sự kiện có mẫu tiếng Việt và tiếng Anh — khách nhận theo ngôn ngữ giao diện của họ. Biến chung cho mọi mẫu: ")}{CUSTOMER_MAIL_COMMON_VARS.map((v) => `{{${v}}}`).join(" · ")}{L(". Biến không có dữ liệu sẽ tự thay bằng trống; dòng chỉ chứa đúng một biến trống sẽ bị bỏ khỏi thư.")}</p>
          <div className="space-y-3">
            {CUSTOMER_MAIL_EVENTS.map((e) => (
              <details key={e.key} className="rounded-2xl border border-slate-200">
                <summary className="cursor-pointer px-5 py-3.5 font-semibold text-slate-800">{L(e.label)} <span className="ml-1 font-mono text-xs font-normal text-slate-400">{e.key}</span></summary>
                <div className="space-y-4 border-t border-slate-100 px-5 py-4">
                  <p className="text-sm text-slate-500">{L(e.hint)}</p>
                  {e.vars.length > 0 && (
                    <p className="text-xs text-slate-400">{L("Biến của mẫu này: ")}{e.vars.map((v) => `{{${v}}}`).join(" · ")}</p>
                  )}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <div><label className="lbl">{L("Tiêu đề (VI)")}</label><input className="inp" name={`mailtpl_${e.key}_subject_vi`} defaultValue={s[`mailtpl_${e.key}_subject_vi`] || ""} /></div>
                      <div><label className="lbl">{L("Nội dung (VI)")}</label><textarea className="inp" rows={9} name={`mailtpl_${e.key}_body_vi`} defaultValue={s[`mailtpl_${e.key}_body_vi`] || ""} /></div>
                    </div>
                    <div className="space-y-3">
                      <div><label className="lbl">{L("Tiêu đề (EN)")}</label><input className="inp" name={`mailtpl_${e.key}_subject_en`} defaultValue={s[`mailtpl_${e.key}_subject_en`] || ""} /></div>
                      <div><label className="lbl">{L("Nội dung (EN)")}</label><textarea className="inp" rows={9} name={`mailtpl_${e.key}_body_en`} defaultValue={s[`mailtpl_${e.key}_body_en`] || ""} /></div>
                    </div>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>

        <button className="btn-primary w-full !py-3">{L("Lưu cấu hình email khách")}</button>
      </form>

      <div className="card mt-6 p-6">
        <div className="mb-1 font-bold text-slate-900">{L("Gửi thư thử cho chính bạn")}</div>
        <p className="mb-4 text-sm text-slate-400">{L("Chọn sự kiện — hệ thống gửi 1 thư theo mẫu đã lưu (với dữ liệu mẫu) về email của tài khoản admin đang đăng nhập, kể cả khi công tắc tổng đang tắt.")}</p>
        <form action={testCustomerMailAction} className="flex flex-wrap items-center gap-3">
          <select name="event" className="inp !w-[320px]" defaultValue="order_delivered">
            {CUSTOMER_MAIL_EVENTS.map((e) => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>
          <button className="btn-ghost">{L("Gửi thư thử")}</button>
        </form>
      </div>

      <div className="card mt-6 space-y-5 p-6">
        <div>
          <div className="text-base font-bold text-slate-900">{L("Phát thông báo hệ thống qua email")}</div>
          <p className="mt-0.5 text-sm text-slate-400">{L("Soạn một lần — hệ thống gửi dần theo từng lượt cron (50 khách/lượt) cho khách đang hoạt động và còn nhận email thông báo. Khách nhận theo ngôn ngữ của họ; để trống bản EN thì khách dùng tiếng Anh nhận bản VI. Nội dung hỗ trợ biến {{username}} và {{site_name}}.")}</p>
        </div>
        <form action={createAnnouncementAction} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div><label className="lbl">{L("Tiêu đề thông báo (VI)")}</label><input className="inp" name="ann_subject_vi" defaultValue={s.mailtpl_announcement_subject_vi || ""} /></div>
              <div><label className="lbl">{L("Nội dung thông báo (VI)")}</label><textarea className="inp" rows={7} name="ann_body_vi" defaultValue={s.mailtpl_announcement_body_vi || ""} /></div>
            </div>
            <div className="space-y-3">
              <div><label className="lbl">{L("Tiêu đề thông báo (EN — tuỳ chọn)")}</label><input className="inp" name="ann_subject_en" defaultValue={s.mailtpl_announcement_subject_en || ""} /></div>
              <div><label className="lbl">{L("Nội dung thông báo (EN — tuỳ chọn)")}</label><textarea className="inp" rows={7} name="ann_body_en" defaultValue={s.mailtpl_announcement_body_en || ""} /></div>
            </div>
          </div>
          <button className="btn-primary">{L("Tạo đợt phát thông báo")}</button>
        </form>
        {mailCampaigns.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-3">{L("Đợt")}</th>
                  <th className="py-2 pr-3">{L("Tiêu đề")}</th>
                  <th className="py-2 pr-3">{L("Tiến độ")}</th>
                  <th className="py-2 pr-3">{L("Trạng thái")}</th>
                  <th className="py-2">{L("Tạo lúc")}</th>
                </tr>
              </thead>
              <tbody>
                {mailCampaigns.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">#{c.id}</td>
                    <td className="max-w-[260px] truncate py-2 pr-3 font-medium text-slate-800">{c.subjectVi}</td>
                    <td className="py-2 pr-3 text-slate-600">{L("Đã gửi ")}{c.sentCount}{" / "}{c.totalCount}{c.failedCount > 0 ? ` · ${L("lỗi ")}${c.failedCount}` : ""}{c.skippedCount > 0 ? ` · ${L("bỏ qua ")}${c.skippedCount}` : ""}</td>
                    <td className="py-2 pr-3">{c.status === "DONE" ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{L("Hoàn tất")}</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{L("Đang gửi")}</span>}</td>
                    <td className="py-2 text-slate-500">{dt(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mt-6 p-6">
        <div className="mb-1 font-bold text-slate-900">{L("Nhật ký email khách gần nhất")}</div>
        <p className="mb-4 text-sm text-slate-400">{L("Mỗi thư hệ thống xử lý đều ghi 1 dòng: đã gửi, lỗi, hoặc bị bỏ qua kèm lý do (sự kiện tắt, khách tắt nhận thông báo, chưa cấu hình SMTP...).")}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href="/admin/bao-cao" className={`rounded-full border px-3 py-1.5 text-xs font-medium ${!mlogEvent ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}>{L("Tất cả")}</Link>
          {CUSTOMER_MAIL_EVENTS.map((e) => (
            <Link key={e.key} href={`/admin/bao-cao?mlog=${e.key}`} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${mlogEvent === e.key ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600"}`}>{e.key}</Link>
          ))}
        </div>
        {mailLogs.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">{L("Chưa có thư nào được xử lý.")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="py-2 pr-3">{L("Thời gian")}</th>
                  <th className="py-2 pr-3">{L("Sự kiện")}</th>
                  <th className="py-2 pr-3">{L("Người nhận")}</th>
                  <th className="py-2 pr-3">{L("Tiêu đề")}</th>
                  <th className="py-2 pr-3">{L("Kết quả")}</th>
                  <th className="py-2">{L("Lý do / lỗi")}</th>
                </tr>
              </thead>
              <tbody>
                {mailLogs.map((lg) => (
                  <tr key={lg.id} className="border-b border-slate-100 align-top">
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-500">{dt(lg.createdAt)}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-600">{lg.event}</td>
                    <td className="py-2 pr-3 text-slate-700">{lg.toEmail}</td>
                    <td className="max-w-[240px] truncate py-2 pr-3 text-slate-700">{lg.subject || "—"}</td>
                    <td className="py-2 pr-3">{lg.status === "SENT" ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">SENT</span> : lg.status === "FAILED" ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">FAILED</span> : <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">SKIPPED</span>}</td>
                    <td className="max-w-[220px] truncate py-2 text-xs text-slate-500">{lg.reason || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
