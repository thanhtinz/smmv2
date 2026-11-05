import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getStats } from "@/lib/stats";
import { ALERT_EVENTS } from "@/lib/alerts";
import { PageHead, Flash } from "@/components/ui";
import { ReportPreview } from "@/components/report-view";
import { saveMotherAlertsAction, testMotherChannelAction, sendMotherReportNowAction } from "@/app/actions/report";

export const dynamic = "force-dynamic";

const CHANNELS = [
  { key: "email", label: "Email", tile: "from-blue-500 to-indigo-600" },
  { key: "telegram", label: "Telegram", tile: "from-sky-500 to-cyan-600" },
  { key: "discord", label: "Discord", tile: "from-indigo-500 to-violet-600" },
];

/** Báo cáo & báo tin của web mẹ: thống kê thu nhập / bán chạy / top khách,
 *  cấu hình gửi qua Email + Telegram + Discord (bật tắt từng kênh, chọn sự kiện),
 *  báo cáo ngày tự động + gửi ngay. */
export default async function AdminReportPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const st = await getStats({});
  const enabledEvents = new Set((s.alert_events || "").split(",").map((x) => x.trim()).filter(Boolean));
  const allEvents = enabledEvents.size === 0;
  const reportChannels = new Set((s.report_channels || "telegram").split(",").map((x) => x.trim()).filter(Boolean));

  return (
    <div>
      <PageHead title="Báo cáo & Thông báo" desc="Thống kê thu nhập, mặt hàng bán chạy, top khách — và nơi cấu hình gửi báo cáo/báo tin qua Email, Telegram, Discord.">
        <form action={sendMotherReportNowAction}>
          <button className="btn-primary">Gửi báo cáo ngay</button>
        </form>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />

      <ReportPreview st={st} />

      <form action={saveMotherAlertsAction} className="card mt-8 space-y-6 p-6">
        <div>
          <div className="text-base font-bold text-slate-900">Kênh báo tin</div>
          <p className="mt-0.5 text-sm text-slate-400">Có sự kiện (đơn mới, nạp tiền, ticket...) hệ thống tự gửi tin qua các kênh đang bật. Chuông thông báo realtime trong Admin luôn hoạt động, không phụ thuộc phần này.</p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 font-black text-white">T</span>
              <span className="font-bold text-slate-900">Telegram</span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="telegram_notify" value="1" defaultChecked={s.telegram_notify === "1"} className="h-5 w-5 accent-emerald-600" /> Bật
              </label>
            </div>
            <div className="space-y-3">
              <div><label className="lbl">Bot Token</label><input className="inp" name="telegram_bot_token" defaultValue={s.telegram_bot_token} placeholder="123456:ABC-..." /></div>
              <div><label className="lbl">Chat ID nhận tin</label><input className="inp" name="telegram_chat_id" defaultValue={s.telegram_chat_id} placeholder="-1001234567890 hoặc 123456789" /></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-black text-white">D</span>
              <span className="font-bold text-slate-900">Discord</span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="alert_discord_enabled" value="1" defaultChecked={s.alert_discord_enabled === "1"} className="h-5 w-5 accent-emerald-600" /> Bật
              </label>
            </div>
            <div><label className="lbl">Webhook URL</label><input className="inp" name="alert_discord_webhook" defaultValue={s.alert_discord_webhook} placeholder="https://discord.com/api/webhooks/..." /></div>
            <p className="mt-2 text-xs text-slate-400">Trong Discord: Cài đặt kênh → Tích hợp → Webhooks → tạo mới rồi dán URL vào đây.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 font-black text-white">@</span>
              <span className="font-bold text-slate-900">Email</span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="alert_email_enabled" value="1" defaultChecked={s.alert_email_enabled === "1"} className="h-5 w-5 accent-emerald-600" /> Bật
              </label>
            </div>
            <div><label className="lbl">Email nhận tin (nhiều địa chỉ cách nhau dấu phẩy)</label><input className="inp" name="alert_email_to" defaultValue={s.alert_email_to} placeholder="admin@domain.vn" /></div>
            <p className="mt-2 text-xs text-slate-400">Gửi qua máy chủ SMTP đã cấu hình ở Cấu hình → tab Email.</p>
          </div>
        </div>

        <div>
          <div className="mb-2.5 font-bold text-slate-900">Sự kiện được báo tin</div>
          <div className="flex flex-wrap gap-2">
            {ALERT_EVENTS.map((e) => (
              <label key={e.key} className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
                <input type="checkbox" name="ev" value={e.key} defaultChecked={allEvents || enabledEvents.has(e.key)} className="h-4 w-4 accent-brand-600" />
                {e.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">Bỏ chọn hết = không báo sự kiện nào qua kênh ngoài (chuông realtime trong Admin vẫn chạy).</p>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">Báo cáo ngày tự động</span>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="report_daily_enabled" value="1" defaultChecked={s.report_daily_enabled === "1"} className="h-5 w-5 accent-emerald-600" /> Bật gửi tự động
            </label>
            <span className="flex items-center gap-2 text-sm text-slate-600">Giờ gửi
              <input type="time" name="report_time" defaultValue={s.report_time || "21:00"} className="inp !w-[130px]" />
            </span>
            {s.report_last_sent && <span className="text-xs text-slate-400">Đã gửi gần nhất: {s.report_last_sent}</span>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="lbl">Gửi báo cáo qua kênh</label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
                    <input type="checkbox" name="rch" value={c.key} defaultChecked={reportChannels.has(c.key)} className="h-4 w-4 accent-brand-600" />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
            <div><label className="lbl">Email nhận báo cáo (trống = dùng email báo tin)</label><input className="inp" name="report_email_to" defaultValue={s.report_email_to} placeholder="baocao@domain.vn" /></div>
          </div>
          <p className="mt-2 text-xs text-slate-400">Báo cáo gồm: thu nhập hôm nay / 7 ngày / tháng, mặt hàng bán chạy, top khách và việc đang chờ xử lý. Cần cron đồng bộ chạy đều để hệ thống gửi đúng giờ.</p>
        </div>

        <button className="btn-primary w-full !py-3">Lưu cấu hình</button>
      </form>

      <div className="card mt-6 p-6">
        <div className="mb-1 font-bold text-slate-900">Gửi tin thử</div>
        <p className="mb-4 text-sm text-slate-400">Dùng cấu hình đã lưu — kiểm tra từng kênh có nhận được tin không.</p>
        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((c) => (
            <form key={c.key} action={testMotherChannelAction}>
              <input type="hidden" name="channel" value={c.key} />
              <button className="btn-ghost">Thử {c.label}</button>
            </form>
          ))}
          <form action={sendMotherReportNowAction}>
            <button className="btn-dark">Gửi báo cáo ngay</button>
          </form>
        </div>
      </div>
    </div>
  );
}
