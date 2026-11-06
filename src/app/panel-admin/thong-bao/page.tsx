import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { panelBroadcastAction, panelSaveAnnouncementAction } from "@/app/actions/panel";
import { dt, num } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Gửi thông báo tới toàn bộ khách của panel + xem các đợt đã gửi. */
export default async function PanelBroadcastPage({ searchParams }: { searchParams: { msg?: string; err?: string; edit?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const anns = await prisma.announcement.findMany({ where: { panelId: panel.id }, orderBy: { id: "desc" } });
  const editId = searchParams.edit ? parseInt(searchParams.edit) : 0;
  const editAnn = editId ? anns.find((a) => a.id === editId) : undefined;
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

      <div className="mt-8 border-t border-slate-200 pt-6">
        <div className="font-bold text-slate-900">Thông báo trên gian hàng</div>
        <p className="mb-4 mt-1 text-sm text-slate-500">Hiện theo dòng thời gian ở trang chủ gian hàng, trang Thông báo và trang Tổng quan của khách panel.</p>
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          <div className="space-y-3 xl:col-span-2">
            {anns.map((a) => (
              <div key={a.id} className="card flex items-start gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900">{a.title} <span className="ml-2 text-xs font-normal text-slate-400">{dt(a.createdAt)}</span></div>
                  <p className="mt-1 text-sm text-slate-500">{a.body}</p>
                </div>
                <Badge cls={a.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>{a.active ? "Đang hiện" : "Đã ẩn"}</Badge>
                <a href={`/panel-admin/thong-bao?edit=${a.id}`} className="btn-ghost btn-sm">Sửa</a>
              </div>
            ))}
            {anns.length === 0 && <div className="card p-8 text-center text-sm text-slate-400">Panel chưa đăng thông báo nào — khách đang thấy thông báo của web mẹ.</div>}
          </div>
          <form action={panelSaveAnnouncementAction} className="card space-y-4 p-6">
            <div className="font-bold text-slate-900">{editAnn ? "Sửa thông báo" : "Đăng thông báo mới"}</div>
            <input type="hidden" name="id" value={editAnn?.id || 0} />
            <div><label className="lbl">Tiêu đề</label><input className="inp" name="title" required defaultValue={editAnn?.title || ""} /></div>
            <div><label className="lbl">Nội dung</label><textarea className="inp" name="body" rows={4} required defaultValue={editAnn?.body || ""} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editAnn ? editAnn.active : true} className="h-4 w-4" /> Đang hiện</label>
            <button className="btn-primary w-full">{editAnn ? "Lưu" : "Đăng thông báo"}</button>
            {editAnn && <>
              <button className="btn-ghost w-full !text-rose-600" name="delete" value="1">Xoá thông báo này</button>
              <a href="/panel-admin/thong-bao" className="btn-ghost w-full">Huỷ sửa</a>
            </>}
          </form>
        </div>
      </div>
    </div>
  );
}
