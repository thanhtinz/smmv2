import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { panelSaveAiAction, panelClearAiKeyAction, panelTestAiAction } from "@/app/actions/panel";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** AI riêng của panel: chủ panel tự thêm key của mình — livechat "Tư vấn"
 *  trên website sẽ tư vấn bằng AI này thay cho AI hệ thống. */
export default async function PanelAiPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const hasKey = !!(panel.aiApiKey || "").trim();
  return (
    <div>
      <PageHead title={L("AI tư vấn của panel")} desc={L("Tự thêm key AI của bạn — trợ lý tư vấn trong livechat trên website sẽ dùng key này.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px]">
        <form action={panelSaveAiAction} className="card space-y-4 p-6">
          <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
            <span>
              <span className="block text-sm font-bold text-slate-800">{L("Bật AI riêng cho website")}</span>
              <span className="text-xs text-slate-400">{L("Tắt thì livechat dùng AI hệ thống của web chính (nếu có).")}</span>
            </span>
            <input type="checkbox" name="aiEnabled" defaultChecked={panel.aiEnabled} className="h-5 w-5 shrink-0 accent-slate-900" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="lbl">{L("Nhà cung cấp AI")}</label>
              <select name="aiProvider" defaultValue={panel.aiProvider || "openai"} className="inp">
                <option value="openai">{L("OpenAI / tương thích OpenAI")}</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>
            <div><label className="lbl">Model</label><input name="aiModel" defaultValue={panel.aiModel || ""} placeholder="gpt-4o-mini / gemini-2.0-flash" className="inp" /></div>
          </div>
          <div><label className="lbl">{L("API Key của bạn")} {hasKey && <span className="font-semibold text-emerald-600">{L("— đã lưu key (để trống ô dưới nếu giữ nguyên)")}</span>}</label><input name="aiApiKey" type="password" autoComplete="off" placeholder={hasKey ? "••••••••••••••••" : L("Dán key AI của bạn vào đây")} className="inp" /></div>
          <div><label className="lbl">{L("Base URL (để trống = mặc định theo nhà cung cấp)")}</label><input name="aiBaseUrl" defaultValue={panel.aiBaseUrl || ""} placeholder="https://api.openai.com/v1" className="inp" /></div>
          <div className="flex flex-wrap gap-3 pt-1">
            <button className="btn-primary !py-2.5">{L("Lưu cấu hình")}</button>
          </div>
        </form>
        <div className="space-y-6">
          <form action={panelTestAiAction} className="card p-6">
            <div className="font-bold text-slate-900">{L("Kiểm tra kết nối")}</div>
            <p className="mt-1 text-sm text-slate-400">{L("Gửi một tin nhắn thử bằng key đã lưu để chắc chắn AI hoạt động trước khi khách dùng.")}</p>
            <button className="btn-ghost btn-sm mt-4 !px-4 !py-2" disabled={!hasKey}>{L("Kiểm tra kết nối AI")}</button>
            {!hasKey && <p className="mt-2 text-xs text-slate-400">{L("Chưa có key nào được lưu.")}</p>}
          </form>
          {hasKey && (
            <form action={panelClearAiKeyAction} className="card p-6">
              <div className="font-bold text-slate-900">{L("Xoá key AI")}</div>
              <p className="mt-1 text-sm text-slate-400">{L("Xoá hẳn key khỏi hệ thống và tắt AI riêng — livechat quay về AI hệ thống.")}</p>
              <button className="btn-ghost btn-sm mt-4 !px-4 !py-2 !text-rose-600">{L("Xoá key của panel")}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
