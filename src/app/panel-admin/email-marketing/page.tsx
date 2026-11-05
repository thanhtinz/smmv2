import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { panelSendMarketingEmail } from "@/app/actions/panel";
import { smtpConfigured } from "@/lib/mailer";
import { dt, num } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Email marketing của chủ panel — gửi qua SMTP chung của hệ thống,
 *  chỉ tới khách của panel này, theo nhóm đã chọn. */
export default async function PanelEmailPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const panel = (await prisma.childPanel.findUnique({ where: { ownerId: user.id } }))!;
  const panelReady = !!(panel.smtpHost && panel.smtpUser && panel.smtpFrom);
  const [globalReady, totalMembers, history] = await Promise.all([
    smtpConfigured(),
    prisma.user.count({ where: { panelId: panel.id, email: { not: "" } } }),
    prisma.apiLog.findMany({ where: { kind: "panel_email", ref: `panel:${panel.id}` }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return (
    <div>
      <PageHead title="Email marketing" desc="Gửi email quảng bá tới khách của gian hàng qua hệ thống thư chung." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      {!globalReady && !panelReady && <div className="card mb-6 border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">Chưa gửi được email: hãy điền SMTP riêng của panel ở mục Cấu hình, hoặc nhờ Admin web chính cấu hình thư hệ thống (Cấu hình → Email).</div>}
      {panelReady && <div className="card mb-6 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">Đang dùng SMTP riêng của panel ({panel.smtpHost}) để gửi.</div>}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <form action={panelSendMarketingEmail} className="card space-y-4 p-6">
          <div className="font-bold text-slate-900">Soạn chiến dịch</div>
          <div>
            <label className="lbl">Gửi tới nhóm</label>
            <select name="segment" className="inp">
              <option value="all">Tất cả khách của panel ({num(totalMembers)} email)</option>
              <option value="deposited">Khách đã từng nạp tiền</option>
              <option value="ordered">Khách đã từng đặt đơn qua panel</option>
            </select>
          </div>
          <div><label className="lbl">Tiêu đề email</label><input name="subject" required maxLength={200} className="inp" placeholder="VD: Ưu đãi riêng cho khách của shop tuần này" /></div>
          <div><label className="lbl">Nội dung</label><textarea name="body" required rows={8} className="inp" placeholder="Nội dung email (văn bản thuần, giữ nguyên xuống dòng)..." /></div>
          <button className="btn-primary !py-2.5" disabled={!globalReady && !panelReady}>Gửi chiến dịch</button>
        </form>
        <div className="card p-6">
          <div className="mb-4 font-bold text-slate-900">Chiến dịch đã gửi</div>
          <div className="divide-y divide-slate-100">
            {history.map((h) => (
              <div key={h.id} className="py-2.5 text-sm">
                <div className="font-medium text-slate-700">{h.detail}</div>
                <div className="text-xs text-slate-400">{dt(h.createdAt)}</div>
              </div>
            ))}
            {history.length === 0 && <p className="py-3 text-sm text-slate-400">Chưa gửi chiến dịch nào.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
