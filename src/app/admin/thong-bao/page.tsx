import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge } from "@/components/ui";
import { adminSaveAnnouncement } from "@/app/actions/admin";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncements({ searchParams }: { searchParams: { msg?: string; err?: string; edit?: string } }) {
  const list = await prisma.announcement.findMany({ orderBy: { id: "desc" } });
  const edit = searchParams.edit ? list.find((a) => a.id === parseInt(searchParams.edit!)) : undefined;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <div className="xl:col-span-2">
        <PageHead title="Thông báo" desc="Thông báo đang bật sẽ hiện ở trang Tổng quan của khách." />
        <Flash msg={searchParams.msg} err={searchParams.err} />
        <div className="space-y-3">
          {list.map((a) => (
            <div key={a.id} className="card p-5 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900">{a.title} <span className="text-xs text-slate-400 font-normal ml-2">{dt(a.createdAt)}</span></div>
                <p className="text-sm text-slate-500 mt-1">{a.body}</p>
              </div>
              <Badge cls={a.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>{a.active ? "Đang hiện" : "Đã ẩn"}</Badge>
              <a href={`/admin/thong-bao?edit=${a.id}`} className="btn-ghost btn-sm">Sửa</a>
            </div>
          ))}
          {list.length === 0 && <div className="card p-8 text-center text-sm text-slate-400">Chưa có thông báo nào</div>}
        </div>
      </div>
      <form action={adminSaveAnnouncement} className="card p-6 space-y-4 xl:sticky xl:top-24">
        <div className="font-bold text-slate-900">{edit ? "Sửa thông báo" : "Thêm thông báo"}</div>
        <input type="hidden" name="id" value={edit?.id || 0} />
        <div><label className="lbl">Tiêu đề</label><input className="inp" name="title" required defaultValue={edit?.title || ""} /></div>
        <div><label className="lbl">Nội dung</label><textarea className="inp" name="body" rows={4} required defaultValue={edit?.body || ""} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={edit ? edit.active : true} className="w-4 h-4" /> Đang hiện</label>
        <button className="btn-primary w-full">{edit ? "Lưu" : "Đăng thông báo"}</button>
        {edit && <>
          <button className="btn-ghost w-full !text-rose-600" name="delete" value="1">Xoá thông báo này</button>
          <a href="/admin/thong-bao" className="btn-ghost w-full">Huỷ sửa</a>
        </>}
      </form>
    </div>
  );
}
