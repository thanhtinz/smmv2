import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge } from "@/components/ui";
import { adminSaveCategory, adminDeleteCategory, adminDeleteService } from "@/app/actions/admin";
import { vnd, PLATFORMS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminServices({ searchParams }: { searchParams: { msg?: string; err?: string; cat?: string; q?: string } }) {
  const [categories, providers] = await Promise.all([
    prisma.smmCategory.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }], include: { _count: { select: { services: true } } } }),
    prisma.provider.findMany({ orderBy: { id: "asc" } }),
  ]);
  const where: any = {};
  if (searchParams.cat) where.categoryId = parseInt(searchParams.cat);
  if (searchParams.q) where.name = { contains: searchParams.q };
  const services = await prisma.smmService.findMany({ where, orderBy: [{ categoryId: "asc" }, { sort: "asc" }, { id: "asc" }], take: 300, include: { category: true, provider: true } });
  const editCat = searchParams.cat && !searchParams.q ? categories.find((c) => c.id === parseInt(searchParams.cat!)) : undefined;

  return (
    <div>
      <PageHead title="Dịch vụ SMM" desc="Dịch vụ API tự đồng bộ từ nhà cung cấp; dịch vụ thủ công do bạn tự tạo và xử lý trong hàng đợi đơn.">
        <Link href="/admin/dich-vu/moi" className="btn-primary">+ Thêm dịch vụ</Link>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="space-y-6">
          <div className="card p-5">
            <div className="font-bold text-slate-900 mb-3">Danh mục ({categories.length})</div>
            <div className="space-y-1.5 max-h-[420px] overflow-auto pr-1">
              <Link href="/admin/dich-vu" className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50 font-medium">Tất cả dịch vụ</Link>
              {categories.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-slate-50">
                  <Link href={`/admin/dich-vu?cat=${c.id}`} className="flex-1 text-sm min-w-0">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    <span className="text-xs text-slate-400 block">{PLATFORMS[c.platform]} · {c._count.services} dịch vụ{c.active ? "" : " · đang tắt"}</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
          <form action={adminSaveCategory} className="card p-5 space-y-3">
            <div className="font-bold text-slate-900">{editCat ? `Sửa danh mục #${editCat.id}` : "Thêm danh mục"}</div>
            <input type="hidden" name="id" value={editCat?.id || 0} />
            <div>
              <label className="lbl">Nền tảng</label>
              <select className="inp" name="platform" defaultValue={editCat?.platform || "facebook"}>
                {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className="lbl">Tên danh mục</label><input className="inp" name="name" required defaultValue={editCat?.name || ""} placeholder="Vd: Facebook Followers" /></div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div><label className="lbl">Thứ tự</label><input className="inp" name="sort" type="number" defaultValue={editCat?.sort ?? 0} /></div>
              <label className="flex items-center gap-2 text-sm pb-2.5"><input type="checkbox" name="active" defaultChecked={editCat ? editCat.active : true} className="w-4 h-4" /> Đang bật</label>
            </div>
            <button className="btn-primary w-full">{editCat ? "Lưu danh mục" : "Thêm danh mục"}</button>
            {editCat && (
              <button formAction={adminDeleteCategory} className="btn-ghost w-full !text-rose-600" name="id" value={editCat.id}>Xoá danh mục này</button>
            )}
          </form>
        </div>

        <div className="xl:col-span-2">
          <form className="flex gap-2 mb-4">
            <input className="inp" name="q" placeholder="Tìm tên dịch vụ..." defaultValue={searchParams.q || ""} />
            {searchParams.cat && <input type="hidden" name="cat" value={searchParams.cat} />}
            <button className="btn-dark">Tìm</button>
          </form>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50 border-b border-slate-200"><tr>
                <th className="th">ID</th><th className="th">Dịch vụ</th><th className="th">Giá bán / Vốn</th><th className="th">Nguồn</th><th className="th">Trạng thái</th><th className="th"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {services.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="td font-mono text-xs text-slate-400">{s.id}</td>
                    <td className="td"><div className="font-medium max-w-[300px] truncate">{s.name}</div><div className="text-xs text-slate-400">{s.category.name} · {s.min}–{s.max.toLocaleString("vi-VN")}</div></td>
                    <td className="td"><div className="font-semibold">{vnd(s.rate)}</div><div className="text-xs text-slate-400">vốn {vnd(s.costRate)}</div></td>
                    <td className="td">{s.fulfillment === "API" ? <Badge cls="bg-indigo-100 text-indigo-800">API · {s.provider?.name || "?"} #{s.providerServiceId}</Badge> : <Badge cls="bg-amber-100 text-amber-800">Thủ công</Badge>}</td>
                    <td className="td"><Badge cls={s.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>{s.active ? "Đang bán" : "Đã tắt"}</Badge></td>
                    <td className="td text-right whitespace-nowrap">
                      <Link href={`/admin/dich-vu/${s.id}`} className="btn-ghost btn-sm">Sửa</Link>{" "}
                      <form action={adminDeleteService} className="inline"><input type="hidden" name="id" value={s.id} /><button className="btn-ghost btn-sm !text-rose-600">Xoá</button></form>
                    </td>
                  </tr>
                ))}
                {services.length === 0 && <tr><td colSpan={6} className="td text-center text-slate-400 py-8">Chưa có dịch vụ — thêm tay hoặc đồng bộ từ nhà cung cấp API</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">Hiển thị tối đa 300 dịch vụ. Dịch vụ của provider: {providers.length} nhà cung cấp đã cấu hình.</p>
        </div>
      </div>
    </div>
  );
}
