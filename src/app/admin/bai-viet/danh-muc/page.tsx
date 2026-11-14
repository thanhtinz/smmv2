import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { savePostCategoryAction, deletePostCategoryAction } from "@/app/actions/admin-features";
import { num } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminPostCategories( { searchParams: searchParamsPromise }: { searchParams: Promise<{ edit?: string; msg?: string; err?: string }> }) {
  const searchParams = await searchParamsPromise;
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const cats = await prisma.postCategory.findMany({ orderBy: { id: "asc" }, include: { _count: { select: { posts: true } } } });
  const edit = searchParams.edit ? cats.find((c) => c.id === parseInt(searchParams.edit || "0")) : undefined;
  return (
    <div>
      <PageHead title={L("Danh mục bài viết")} desc={L("Nhóm bài viết theo chủ đề (tin tức, hướng dẫn, khuyến mãi...).")}>
        <Link href="/admin/bai-viet" className="btn-ghost">{L("← Tất cả bài viết")}</Link>
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_360px]">
        {cats.length === 0 ? <Empty text={L("Chưa có danh mục nào")} /> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead><tr><th className="th">{L("Tên danh mục")}</th><th className="th">Slug</th><th className="th">{L("Số bài viết")}</th><th className="th">{L("Trạng thái")}</th><th className="th"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {cats.map((c) => (
                  <tr key={c.id}>
                    <td className="td"><span className="font-medium">{c.name}</span>{c.description && <div className="text-xs text-slate-400">{c.description}</div>}</td>
                    <td className="td font-mono text-xs text-slate-500">{c.slug}</td>
                    <td className="td">{num(c._count.posts)}</td>
                    <td className="td">{c.active ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Hoạt động")}</Badge> : <Badge cls="bg-slate-200 text-slate-500">{L("Đã tắt")}</Badge>}</td>
                    <td className="td whitespace-nowrap">
                      <Link href={`/admin/bai-viet/danh-muc?edit=${c.id}`} className="btn-ghost btn-sm">{L("Sửa")}</Link>{" "}
                      <form action={deletePostCategoryAction} className="inline"><input type="hidden" name="id" value={c.id} /><button className="btn-ghost btn-sm !text-rose-600">{L("Xoá")}</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={savePostCategoryAction} className="card space-y-4 p-5">
          <div className="font-bold text-slate-900">{edit ? L("Sửa danh mục") : L("Thêm danh mục")}</div>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <div><label className="lbl">{L("Tên danh mục")}</label><input className="inp" name="name" required defaultValue={edit?.name || ""} /></div>
          <div><label className="lbl">{L("Slug (để trống = tự tạo)")}</label><input className="inp" name="slug" defaultValue={edit?.slug || ""} /></div>
          <div><label className="lbl">{L("Mô tả")}</label><input className="inp" name="description" defaultValue={edit?.description || ""} /></div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" name="active" defaultChecked={edit ? edit.active : true} className="h-4 w-4 accent-brand-600" /> {L("Đang bật")}</label>
          <button className="btn-primary w-full">{edit ? L("Lưu thay đổi") : L("Thêm danh mục")}</button>
        </form>
      </div>
    </div>
  );
}
