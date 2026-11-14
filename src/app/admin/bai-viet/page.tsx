import { ImageUpload } from "@/components/image-upload";
import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { savePostAction, deletePostAction } from "@/app/actions/admin-features";
import { dt, num } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminPosts( { searchParams: searchParamsPromise }: { searchParams: Promise<{ edit?: string; q?: string; msg?: string; err?: string }> }) {
  const searchParams = await searchParamsPromise;
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const where: any = searchParams.q ? { title: { contains: searchParams.q } } : {};
  const [posts, cats] = await Promise.all([
    prisma.post.findMany({ where, orderBy: { id: "desc" }, take: 100, include: { category: true } }),
    prisma.postCategory.findMany({ orderBy: { id: "asc" } }),
  ]);
  const edit = searchParams.edit ? posts.find((p) => p.id === parseInt(searchParams.edit || "0")) : undefined;
  return (
    <div>
      <PageHead title={L("Bài viết")}>
        <Link href="/admin/bai-viet/danh-muc" className="btn-ghost">{L("Danh mục bài viết")}</Link>
        {edit && <Link href="/admin/bai-viet" className="btn-primary">{L("+ Viết bài mới")}</Link>}
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div>
        <div>
          <form className="mb-4 flex gap-2">
            <input className="inp !w-80" name="q" placeholder={L("Tìm tiêu đề bài viết...")} defaultValue={searchParams.q || ""} />
            <button className="btn-primary">{L("Tìm kiếm")}</button>
          </form>
          {posts.length === 0 ? <Empty text={L("Chưa có bài viết nào")} /> : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead><tr><th className="th">{L("Tiêu đề")}</th><th className="th">{L("Danh mục")}</th><th className="th">{L("Trạng thái")}</th><th className="th">{L("Lượt xem")}</th><th className="th">{L("Ngày tạo")}</th><th className="th"></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {posts.map((p) => (
                    <tr key={p.id}>
                      <td className="td">
                        <div className="max-w-[320px] truncate font-medium">{p.title}{p.pinned ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{L("Đã ghim")}</span> : null}</div>
                        <div className="max-w-[320px] truncate text-xs text-slate-400">{p.excerpt || p.slug}</div>
                      </td>
                      <td className="td text-slate-500">{p.category?.name || "—"}</td>
                      <td className="td">{p.published ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Đã xuất bản")}</Badge> : <Badge cls="bg-slate-200 text-slate-500">{L("Bản nháp")}</Badge>}</td>
                      <td className="td">{num(p.views)}</td>
                      <td className="td whitespace-nowrap text-slate-500">{dt(p.createdAt)}</td>
                      <td className="td whitespace-nowrap">
                        <Link href={`/admin/bai-viet?edit=${p.id}`} className="btn-ghost btn-sm">{L("Sửa")}</Link>{" "}
                        <form action={deletePostAction} className="inline"><input type="hidden" name="id" value={p.id} /><button className="btn-ghost btn-sm !text-rose-600">{L("Xoá")}</button></form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <form action={savePostAction} className="card mt-6 space-y-4 p-5">
          <div className="font-bold text-slate-900">{edit ? L("Sửa bài viết") : L("Viết bài mới")}</div>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><label className="lbl">{L("Tiêu đề")}</label><input className="inp" name="title" required defaultValue={edit?.title || ""} /></div>
            <div><label className="lbl">{L("Slug (để trống = tự tạo)")}</label><input className="inp" name="slug" defaultValue={edit?.slug || ""} placeholder="vd: huong-dan-nap-tien" /></div>
            <div><label className="lbl">{L("Danh mục")}</label>
              <select className="inp" name="categoryId" defaultValue={edit?.categoryId || ""}>
                <option value="">{L("— Không chọn —")}</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="lbl">{L("Ảnh bìa")}</label><ImageUpload name="coverUrl" defaultValue={edit?.coverUrl || ""} stamp /></div>
          </div>
          <div><label className="lbl">{L("Tóm tắt")}</label><textarea className="inp" name="excerpt" rows={2} defaultValue={edit?.excerpt || ""} /></div>
          <div><label className="lbl">{L("Nội dung")}</label><textarea className="inp" name="content" rows={12} required defaultValue={edit?.content || ""} placeholder={L("Mỗi dòng là một đoạn văn.\nDòng bắt đầu bằng ## là tiêu đề mục.")} /></div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" name="published" defaultChecked={edit ? edit.published : true} className="h-4 w-4 accent-brand-600" /> {L("Xuất bản ngay")}</label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" name="pinned" defaultChecked={edit?.pinned} className="h-4 w-4 accent-brand-600" /> {L("Ghim lên đầu trang Bài viết")}</label>
            <button className="btn-primary ml-auto">{edit ? L("Lưu thay đổi") : L("Đăng bài")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
