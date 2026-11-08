import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { panelSendMarketingEmail } from "@/app/actions/panel";
import { smtpConfigured } from "@/lib/mailer";
import { dt, num } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Email marketing của chủ panel — gửi qua SMTP chung của hệ thống,
 *  chỉ tới khách của panel này, theo nhóm đã chọn. */
export default async function PanelEmailPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const panelReady = !!(panel.smtpHost && panel.smtpUser && panel.smtpFrom);
  const [globalReady, totalMembers, history] = await Promise.all([
    smtpConfigured(),
    prisma.user.count({ where: { panelId: panel.id, email: { not: "" } } }),
    prisma.apiLog.findMany({ where: { kind: "panel_email", ref: `panel:${panel.id}` }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return (
    <div>
      <PageHead title={L("Email marketing")} desc={L("Gửi email quảng bá tới khách của website qua hệ thống thư chung.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      {!globalReady && !panelReady && <div className="card mb-6 border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">{L("Chưa gửi được email: hãy điền SMTP riêng của panel ở mục Cấu hình, hoặc nhờ Admin web chính cấu hình thư hệ thống (Cấu hình → Email).")}</div>}
      {panelReady && <div className="card mb-6 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{L("Đang dùng SMTP riêng của panel (")}{panel.smtpHost}{L(") để gửi.")}</div>}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <form action={panelSendMarketingEmail} className="card space-y-4 p-6">
          <div className="font-bold text-slate-900">{L("Soạn chiến dịch")}</div>
          <div>
            <label className="lbl">{L("Gửi tới nhóm")}</label>
            <select name="segment" className="inp">
              <option value="all">{L("Tất cả khách của panel (")}{num(totalMembers)} email)</option>
              <option value="deposited">{L("Khách đã từng nạp tiền")}</option>
              <option value="ordered">{L("Khách đã từng đặt đơn qua panel")}</option>
            </select>
          </div>
          <div><label className="lbl">{L("Tiêu đề email")}</label><input name="subject" required maxLength={200} className="inp" placeholder={L("VD: Ưu đãi riêng cho khách của shop tuần này")} /></div>
          <div><label className="lbl">{L("Nội dung")}</label><textarea name="body" required rows={8} className="inp" placeholder={L("Nội dung email (văn bản thuần, giữ nguyên xuống dòng)...")} /></div>
          <button className="btn-primary !py-2.5" disabled={!globalReady && !panelReady}>{L("Gửi chiến dịch")}</button>
        </form>
        <div className="card p-6">
          <div className="mb-4 font-bold text-slate-900">{L("Chiến dịch đã gửi")}</div>
          <div className="divide-y divide-slate-100">
            {history.map((h) => (
              <div key={h.id} className="py-2.5 text-sm">
                <div className="font-medium text-slate-700">{h.detail}</div>
                <div className="text-xs text-slate-400">{dt(h.createdAt)}</div>
              </div>
            ))}
            {history.length === 0 && <p className="py-3 text-sm text-slate-400">{L("Chưa gửi chiến dịch nào.")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
