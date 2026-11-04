import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink, Flash } from "@/components/ui";
import { adminSaveVariant, adminDeleteVariant } from "@/app/actions/admin";
import { vnd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminProductDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string; v?: string } }) {
  const product = await prisma.premiumProduct.findUnique({
    where: { id: parseInt(params.id) },
    include: { category: true, variants: { orderBy: [{ sort: "asc" }, { price: "asc" }] } },
  });
  if (!product) notFound();
  const stock = await prisma.premiumStock.groupBy({ by: ["variantId"], where: { status: "AVAILABLE" }, _count: true });
  const stockMap = new Map(stock.map((x) => [x.variantId, x._count]));
  const editV = searchParams.v ? product.variants.find((v) => v.id === parseInt(searchParams.v!)) : undefined;
  return (
    <div>
      <BackLink href="/admin/premium">Danh sách sản phẩm Premium</BackLink>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="flex items-center gap-4 mb-6">
        <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl" style={{ background: product.color }}>{product.name.charAt(0)}</span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{product.name}</h1>
          <p className="text-sm text-slate-500">{product.category.name} · {product.fulfillment === "AUTO_STOCK" ? "Kho tự động" : "Thủ công"} · <Link href={`/premium/${product.slug}`} className="text-brand-600">Xem trang bán</Link></p>
        </div>
      </div>
      <div className="grid xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 card overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Gói</th><th className="th">Giá bán</th><th className="th">Vốn</th><th className="th">Lãi</th><th className="th">Bảo hành</th><th className="th">Kho</th><th className="th">Trạng thái</th><th className="th"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {product.variants.map((v) => (
                <tr key={v.id}>
                  <td className="td font-medium">{v.name}</td>
                  <td className="td font-semibold">{vnd(v.price)}</td>
                  <td className="td text-slate-500">{vnd(v.cost)}</td>
                  <td className="td text-emerald-700 font-medium">{vnd(v.price - v.cost)}</td>
                  <td className="td">{v.warrantyDays ? `${v.warrantyDays} ngày` : "—"}</td>
                  <td className="td">{product.fulfillment === "AUTO_STOCK" ? stockMap.get(v.id) || 0 : "—"}</td>
                  <td className="td">{v.active ? "Đang bán" : "Đã tắt"}</td>
                  <td className="td text-right whitespace-nowrap">
                    <a href={`/admin/premium/${product.id}?v=${v.id}`} className="btn-ghost btn-sm">Sửa</a>{" "}
                    <form action={adminDeleteVariant} className="inline"><input type="hidden" name="id" value={v.id} /><input type="hidden" name="productId" value={product.id} /><button className="btn-ghost btn-sm !text-rose-600">Xoá</button></form>
                  </td>
                </tr>
              ))}
              {product.variants.length === 0 && <tr><td colSpan={8} className="td text-center text-slate-400 py-8">Chưa có gói bán nào</td></tr>}
            </tbody>
          </table>
        </div>
        <form action={adminSaveVariant} className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">{editV ? `Sửa gói: ${editV.name}` : "Thêm gói bán"}</div>
          <input type="hidden" name="id" value={editV?.id || 0} />
          <input type="hidden" name="productId" value={product.id} />
          <div><label className="lbl">Tên gói</label><input className="inp" name="name" required defaultValue={editV?.name || ""} placeholder="Vd: 1 năm, 6 tháng, 1 tháng" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Giá bán (VND)</label><input className="inp" name="price" type="number" required defaultValue={editV?.price ?? ""} /></div>
            <div><label className="lbl">Giá vốn (VND)</label><input className="inp" name="cost" type="number" defaultValue={editV?.cost ?? 0} /></div>
            <div><label className="lbl">Bảo hành (ngày)</label><input className="inp" name="warrantyDays" type="number" defaultValue={editV?.warrantyDays ?? 0} /></div>
            <div><label className="lbl">Thứ tự</label><input className="inp" name="sort" type="number" defaultValue={editV?.sort ?? 0} /></div>
            <div><label className="lbl">Chu kỳ phía nhà cung cấp (tháng) — khi đấu API</label><input className="inp" name="providerCycle" type="number" defaultValue={editV?.providerCycle ?? ""} placeholder="1, 3, 6, 12..." /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={editV ? editV.active : true} className="w-4 h-4" /> Đang bán</label>
          <button className="btn-primary w-full">{editV ? "Lưu gói" : "Thêm gói"}</button>
          {editV && <a href={`/admin/premium/${product.id}`} className="btn-ghost w-full">Huỷ sửa</a>}
          {product.fulfillment === "AUTO_STOCK" && <p className="text-xs text-slate-400">Sau khi tạo gói, sang mục Kho Premium để nhập tài khoản/mã vào kho — khách mua là được giao ngay.</p>}
        </form>
      </div>
    </div>
  );
}
