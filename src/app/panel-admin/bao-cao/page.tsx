import { requirePanelOwnerPage } from "@/lib/panel-access";
import { getStats } from "@/lib/stats";
import { ALERT_EVENTS } from "@/lib/alerts";
import { PageHead, Flash } from "@/components/ui";
import { ExportCsvCard } from "@/components/export-csv";
import { ReportPreview } from "@/components/report-view";
import { panelSaveAlertsAction, panelTestChannelAction, panelSendReportNowAction } from "@/app/actions/panel";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const CHANNELS = [
  { key: "email", label: "Email" },
  { key: "telegram", label: "Telegram" },
  { key: "discord", label: "Discord" },
];

const mask = (v: string | null | undefined) => (v ? "••••••••••••" : "");

/** Báo cáo & báo tin của panel con: cùng chuẩn web mẹ nhưng chỉ tính dữ liệu
 *  của website mình; kênh gửi là cấu hình riêng của chủ panel. */
export default async function PanelReportPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const st = await getStats({ panelId: panel.id });
  const enabledEvents = new Set((panel.alertEvents || "").split(",").map((x) => x.trim()).filter(Boolean));
  const allEvents = enabledEvents.size === 0;
  const reportChannels = new Set((panel.reportChannels || "telegram").split(",").map((x) => x.trim()).filter(Boolean));

  return (
    <div>
      <PageHead title={L("Báo cáo & Thông báo")} desc={L("Thu nhập, mặt hàng bán chạy và top khách của website bạn — kèm cấu hình gửi báo cáo/báo tin qua Email, Telegram, Discord.")}>
        <form action={panelSendReportNowAction}>
          <button className="btn-primary">{L("Gửi báo cáo ngay")}</button>
        </form>
      </PageHead>
      <ExportCsvCard base="/api/panel-admin/export" />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      <ReportPreview st={st} profitLabel={L("Hoa hồng")} />

      <form action={panelSaveAlertsAction} className="card mt-8 space-y-6 p-6">
        <div>
          <div className="text-base font-bold text-slate-900">{L("Kênh báo tin của panel")}</div>
          <p className="mt-0.5 text-sm text-slate-400">{L("Có đơn mới, yêu cầu nạp hay ticket từ khách của panel, hệ thống tự gửi tin qua các kênh đang bật. Chuông thông báo realtime trong Panel Admin luôn hoạt động.")}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 font-black text-white">T</span>
              <span className="font-bold text-slate-900">Telegram</span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="alertTelegram" defaultChecked={panel.alertTelegram} className="h-5 w-5 accent-emerald-600" /> {L("Bật")}
              </label>
            </div>
            <div className="space-y-3">
              <div><label className="lbl">Bot Token {panel.telegramBotToken && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label><input className="inp" name="telegramBotToken" placeholder={mask(panel.telegramBotToken) || "123456:ABC-..."} /></div>
              <div><label className="lbl">{L("Chat ID nhận tin")}</label><input className="inp" name="telegramChatId" defaultValue={panel.telegramChatId || ""} /></div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 font-black text-white">D</span>
              <span className="font-bold text-slate-900">Discord</span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="alertDiscord" defaultChecked={panel.alertDiscord} className="h-5 w-5 accent-emerald-600" /> {L("Bật")}
              </label>
            </div>
            <div><label className="lbl">Webhook URL</label><input className="inp" name="discordWebhook" defaultValue={panel.discordWebhook || ""} placeholder="https://discord.com/api/webhooks/..." /></div>
            <p className="mt-2 text-xs text-slate-400">{L("Trong Discord: Cài đặt kênh → Tích hợp → Webhooks → tạo mới rồi dán URL vào đây.")}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 font-black text-white">@</span>
              <span className="font-bold text-slate-900">Email</span>
              <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="alertEmailOn" defaultChecked={panel.alertEmailOn} className="h-5 w-5 accent-emerald-600" /> {L("Bật")}
              </label>
            </div>
            <div><label className="lbl">{L("Email nhận tin của bạn")}</label><input className="inp" name="alertEmail" defaultValue={panel.alertEmail || ""} placeholder="cuaban@domain.vn" /></div>
            <p className="mt-2 text-xs text-slate-400">{L("Gửi qua SMTP riêng của panel nếu đã cài ở mục Cấu hình, không thì dùng thư của web chính.")}</p>
          </div>
        </div>

        <div>
          <div className="mb-2.5 font-bold text-slate-900">{L("Sự kiện được báo tin")}</div>
          <div className="flex flex-wrap gap-2">
            {ALERT_EVENTS.filter((e) => e.key !== "low_balance").map((e) => (
              <label key={e.key} className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
                <input type="checkbox" name="ev" value={e.key} defaultChecked={allEvents || enabledEvents.has(e.key)} className="h-4 w-4 accent-brand-600" />
                {L(e.label)}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">{L("Báo cáo ngày tự động")}</span>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="reportDaily" defaultChecked={panel.reportDaily} className="h-5 w-5 accent-emerald-600" /> {L("Bật gửi tự động")}
            </label>
            <span className="flex items-center gap-2 text-sm text-slate-600">{L("Giờ gửi")}
              <input type="time" name="reportTime" defaultValue={panel.reportTime || "21:00"} className="inp !w-[130px]" />
            </span>
            {panel.reportLastSent && <span className="text-xs text-slate-400">{L("Đã gửi gần nhất: ")}{panel.reportLastSent}</span>}
          </div>
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
          <p className="mt-2 text-xs text-slate-400">{L("Báo cáo gồm thu nhập (hoa hồng) hôm nay / 7 ngày / tháng, mặt hàng bán chạy qua panel, top khách và việc đang chờ.")}</p>
        </div>

        <button className="btn-primary w-full !py-3">{L("Lưu cấu hình")}</button>
      </form>

      <div className="card mt-6 p-6">
        <div className="mb-1 font-bold text-slate-900">{L("Gửi tin thử")}</div>
        <p className="mb-4 text-sm text-slate-400">{L("Dùng cấu hình đã lưu — kiểm tra từng kênh có nhận được tin không.")}</p>
        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((c) => (
            <form key={c.key} action={panelTestChannelAction}>
              <input type="hidden" name="channel" value={c.key} />
              <button className="btn-ghost">{L("Thử")} {c.label}</button>
            </form>
          ))}
          <form action={panelSendReportNowAction}>
            <button className="btn-dark">{L("Gửi báo cáo ngay")}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
