import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { panelBroadcastAction } from "@/app/actions/panel";
import { dt, num } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Gửi thông báo tới toàn bộ khách của panel + xem các đợt đã gửi. */
export default async function PanelBroadcastPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const [memberCount, history] = await Promise.all([
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.apiLog.findMany({ where: { kind: "panel_broadcast", ref: `panel:${panel.id}` }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  return (
    <div>
      <PageHead title="Thông báo khách panel" desc={`Gửi thông báo tới toàn bộ ${num(memberCount)} khách đã đăng ký tại gian hàng của bạn.`} />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <form action={panelBroadcastAction} className="card space-y-4 p-6">
          <div className="font-bold text-slate-900">Soạn thông báo mới</div>
          <div><label className="lbl">Tiêu đề</label><input name="title" required maxLength={150} className="inp" placeholder="VD: Khuyến mãi cuối tuần tại gian hàng" /></div>
          <div><label className="lbl">Nội dung</label><textarea name="body" required rows={4} maxLength={500} className="inp" placeholder="Nội dung hiển thị trong mục Thông báo của khách..." /></div>
          <button className="btn-primary !py-2.5" disabled={memberCount === 0}>Gửi tới {num(memberCount)} khách</button>
          {memberCount === 0 && <p className="text-xs text-slate-400">Panel chưa có khách nào.</p>}
        </form>
        <div className="card p-6">
          <div className="mb-4 font-bold text-slate-900">Các đợt đã gửi</div>
          <div className="divide-y divide-slate-100">
            {history.map((h) => (
              <div key={h.id} className="py-2.5 text-sm">
                <div className="font-medium text-slate-700">{h.detail}</div>
                <div className="text-xs text-slate-400">{dt(h.createdAt)}</div>
              </div>
            ))}
            {history.length === 0 && <p className="py-3 text-sm text-slate-400">Chưa gửi đợt nào.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
