import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge } from "@/components/ui";
import { adminSavePremiumCategory, adminSaveProduct, adminDeleteProduct } from "@/app/actions/admin";
import { PremiumFieldsEditor } from "@/components/client";
import { vnd, parsePremiumFields } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminPremium({ searchParams }: { searchParams: { msg?: string; err?: string; edit?: string } }) {
  await requireAdminPage();
  const categories = await prisma.premiumCategory.findMany({ orderBy: { sort: "asc" }, include: { _count: { select: { products: true } } } });
  const products = await prisma.premiumProduct.findMany({
    orderBy: [{ categoryId: "asc" }, { sort: "asc" }],
    include: { category: true, variants: { orderBy: { price: "asc" } } },
  });
  const stock = await prisma.premiumStock.groupBy({ by: ["variantId"], where: { status: "AVAILABLE" }, _count: true });
  const stockMap = new Map(stock.map((x) => [x.variantId, x._count]));
  const edit = searchParams.edit ? products.find((p) => p.id === parseInt(searchParams.edit!)) : undefined;
  const providers = await prisma.provider.findMany({ where: { kind: { in: ["PREMIUM", "BOTH"] } }, orderBy: { id: "asc" } });

  return (
    <div>
      <PageHead title="Sản phẩm Premium" desc="AUTO_STOCK: bán từ kho, giao ngay. MANUAL: admin giao tay / nâng cấp chính chủ theo thông tin khách gửi." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 card overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Sản phẩm</th><th className="th">Hình thức</th><th className="th">Gói / Giá từ</th><th className="th">Kho</th><th className="th">Trạng thái</th><th className="th"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => {
                const stockTotal = p.variants.reduce((s, v) => s + (stockMap.get(v.id) || 0), 0);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-black" style={{ background: p.color }}>{p.name.charAt(0)}</span>
                        <div><div className="font-medium">{p.name}</div><div className="text-xs text-slate-400">{p.category.name} · /premium/{p.slug}</div></div>
                      </div>
                    </td>
                    <td className="td"><Badge cls={p.fulfillment === "AUTO_STOCK" ? "bg-emerald-100 text-emerald-800" : p.fulfillment === "API" ? "bg-indigo-100 text-indigo-800" : "bg-amber-100 text-amber-800"}>{p.fulfillment === "AUTO_STOCK" ? "Kho tự động" : p.fulfillment === "API" ? "Đấu API" : "Thủ công"}</Badge></td>
                    <td className="td">{p.variants.length} gói{p.variants[0] && <> · từ <b>{vnd(p.variants[0].price)}</b></>}</td>
                    <td className="td">{p.fulfillment === "AUTO_STOCK" ? stockTotal : "—"}</td>
                    <td className="td"><Badge cls={p.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>{p.active ? "Đang bán" : "Đã tắt"}</Badge></td>
                    <td className="td text-right whitespace-nowrap">
                      <Link href={`/admin/premium/${p.id}`} className="btn-primary btn-sm">Gói + sửa</Link>{" "}
                      <a href={`/admin/premium?edit=${p.id}`} className="btn-ghost btn-sm">Thông tin</a>{" "}
                      <form action={adminDeleteProduct} className="inline"><input type="hidden" name="id" value={p.id} /><button className="btn-ghost btn-sm !text-rose-600">Xoá</button></form>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && <tr><td colSpan={6} className="td text-center text-slate-400 py-8">Chưa có sản phẩm premium nào</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="space-y-6">
          <form action={adminSaveProduct} className="card p-6 space-y-4">
            <div className="font-bold text-slate-900">{edit ? `Sửa: ${edit.name}` : "Thêm sản phẩm"}</div>
            <input type="hidden" name="id" value={edit?.id || 0} />
            <div>
              <label className="lbl">Danh mục</label>
              <select className="inp" name="categoryId" defaultValue={edit?.categoryId || ""} required>
                <option value="" disabled>— Chọn —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="lbl">Tên sản phẩm</label><input className="inp" name="name" required defaultValue={edit?.name || ""} /></div>
            <div><label className="lbl">Slug (đường dẫn)</label><input className="inp font-mono" name="slug" required defaultValue={edit?.slug || ""} placeholder="youtube-premium" /></div>
            <div><label className="lbl">Dòng giới thiệu ngắn</label><input className="inp" name="tagline" defaultValue={edit?.tagline || ""} /></div>
            <div><label className="lbl">Mô tả chi tiết</label><textarea className="inp" name="description" rows={4} defaultValue={edit?.description || ""} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="lbl">Màu nhận diện</label><input className="inp !p-1.5 h-[42px]" name="color" type="color" defaultValue={edit?.color || "#3178fc"} /></div>
              <div>
                <label className="lbl">Hình thức giao</label>
                <select className="inp" name="fulfillment" defaultValue={edit?.fulfillment || "MANUAL"}>
                  <option value="AUTO_STOCK">Kho tự động (giao ngay)</option>
                  <option value="MANUAL">Thủ công / nâng cấp chính chủ</option>
                  <option value="API">Đấu API nhà cung cấp (kiểu ThaTim)</option>
                </select>
              </div>
              <div><label className="lbl">Thứ tự</label><input className="inp" name="sort" type="number" defaultValue={edit?.sort ?? 0} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Nhà cung cấp (khi đấu API)</label>
                <select className="inp" name="providerId" defaultValue={edit?.providerId || ""}>
                  <option value="">— Chưa chọn —</option>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div><label className="lbl">ID sản phẩm phía nhà cung cấp</label><input className="inp" name="providerProductId" defaultValue={edit?.providerProductId || ""} placeholder="Tự có khi đồng bộ từ provider" /></div>
              <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" name="active" defaultChecked={edit ? edit.active : true} className="w-4 h-4" /> Đang bán</label>
            </div>
            <div>
              <label className="lbl">Trường tuỳ chỉnh khách điền khi mua</label>
              <PremiumFieldsEditor initial={parsePremiumFields(edit?.customFields)} />
            </div>
            <div><label className="lbl">Hướng dẫn nhập thông tin (hiện trên trang chi tiết)</label><input className="inp" name="buyNote" maxLength={500} defaultValue={edit?.buyNote || ""} placeholder="Vd: Vui lòng nhập Gmail cần nâng cấp (không cần mật khẩu)" /></div>
            <button className="btn-primary w-full">{edit ? "Lưu sản phẩm" : "Thêm sản phẩm"}</button>
            {edit && <a href="/admin/premium" className="btn-ghost w-full">Huỷ sửa</a>}
          </form>
          <form action={adminSavePremiumCategory} className="card p-6 space-y-3">
            <div className="font-bold text-slate-900">Danh mục Premium</div>
            <div className="text-sm text-slate-500 space-y-1">
              {categories.map((c) => <div key={c.id} className="flex justify-between"><span>{c.name}</span><span className="text-slate-400">{c._count.products} sản phẩm</span></div>)}
            </div>
            <input type="hidden" name="id" value={0} />
            <div><label className="lbl">Tên danh mục mới</label><input className="inp" name="name" required /></div>
            <div><label className="lbl">Slug</label><input className="inp font-mono" name="slug" required placeholder="giai-tri" /></div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div><label className="lbl">Thứ tự</label><input className="inp" name="sort" type="number" defaultValue={0} /></div>
              <label className="flex items-center gap-2 text-sm pb-2.5"><input type="checkbox" name="active" defaultChecked className="w-4 h-4" /> Đang bật</label>
            </div>
            <button className="btn-dark w-full">Thêm danh mục</button>
          </form>
        </div>
      </div>
    </div>
  );
}
