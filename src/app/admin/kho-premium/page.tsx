import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, Badge } from "@/components/ui";
import { adminImportStock, adminDeleteStock } from "@/app/actions/admin";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminStock( { searchParams: searchParamsPromise }: { searchParams: Promise<{ msg?: string; err?: string; variant?: string; status?: string }> }) {
  const searchParams = await searchParamsPromise;
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const variants = await prisma.premiumVariant.findMany({
    where: { product: { fulfillment: "AUTO_STOCK", panelId: null } },
    include: { product: true },
    orderBy: [{ productId: "asc" }, { price: "asc" }],
  });
  const counts = await prisma.premiumStock.groupBy({ by: ["variantId", "status"], _count: true });
  const avail = new Map<number, number>(), sold = new Map<number, number>();
  for (const c of counts) (c.status === "AVAILABLE" ? avail : sold).set(c.variantId, c._count);

  const where: any = {};
  if (searchParams.variant) where.variantId = parseInt(searchParams.variant);
  if (searchParams.status) where.status = searchParams.status;
  const stocks = await prisma.premiumStock.findMany({ where, orderBy: { id: "desc" }, take: 100, include: { variant: { include: { product: true } } } });

  return (
    <div>
      <PageHead title={L("Kho Premium")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 space-y-6">
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="th">{L("Gói (sản phẩm kho tự động)")}</th><th className="th">{L("Còn trong kho")}</th><th className="th">{L("Đã bán")}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {variants.map((v) => (
                  <tr key={v.id}>
                    <td className="td font-medium">{v.product.name} — {v.name}</td>
                    <td className="td"><b className={(avail.get(v.id) || 0) === 0 ? "text-rose-600" : "text-emerald-700"}>{avail.get(v.id) || 0}</b>{(avail.get(v.id) || 0) === 0 && <span className="text-rose-500 text-xs ml-2">{L("Hết kho — đơn mới sẽ chờ giao tay")}</span>}</td>
                    <td className="td text-slate-500">{sold.get(v.id) || 0}</td>
                  </tr>
                ))}
                {variants.length === 0 && <tr><td colSpan={3} className="td text-center text-slate-400 py-6">{L("Chưa có sản phẩm nào dùng kho tự động")}</td></tr>}
              </tbody>
            </table>
          </div>
          <form className="flex flex-wrap gap-2">
            <select className="inp !w-72" name="variant" defaultValue={searchParams.variant || ""}>
              <option value="">{L("Tất cả gói")}</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.product.name} — {v.name}</option>)}
            </select>
            <select className="inp !w-44" name="status" defaultValue={searchParams.status || ""}>
              <option value="">{L("Tất cả")}</option><option value="AVAILABLE">{L("Còn trong kho")}</option><option value="SOLD">{L("Đã bán")}</option>
            </select>
            <button className="btn-primary">{L("Lọc")}</button>
          </form>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="th">ID</th><th className="th">{L("Gói")}</th><th className="th">{L("Nội dung giao")}</th><th className="th">{L("Trạng thái")}</th><th className="th">{L("Nhập lúc")}</th><th className="th"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {stocks.map((st) => (
                  <tr key={st.id}>
                    <td className="td font-mono text-xs text-slate-400">{st.id}</td>
                    <td className="td font-medium whitespace-nowrap">{st.variant.product.name} — {st.variant.name}</td>
                    <td className="td"><span className="block max-w-[300px] truncate font-mono text-xs">{st.payload}</span></td>
                    <td className="td"><Badge cls={st.status === "AVAILABLE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>{st.status === "AVAILABLE" ? L("Còn kho") : <>{L("Đã bán")}{st.orderId ? <> ({L("đơn")} #{st.orderId})</> : ""}</>}</Badge></td>
                    <td className="td text-xs text-slate-500">{dt(st.createdAt)}</td>
                    <td className="td text-right">{st.status === "AVAILABLE" && <form action={adminDeleteStock}><input type="hidden" name="id" value={st.id} /><button className="btn-ghost btn-sm !text-rose-600">{L("Xoá")}</button></form>}</td>
                  </tr>
                ))}
                {stocks.length === 0 && <tr><td colSpan={6} className="td text-center text-slate-400 py-8">{L("Kho trống theo bộ lọc này")}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <form action={adminImportStock} className="card p-6 space-y-4 xl:sticky xl:top-24">
          <div className="font-bold text-slate-900">{L("Nhập kho hàng loạt")}</div>
          <div>
            <label className="lbl">{L("Gói áp dụng")}</label>
            <select className="inp" name="variantId" required>
              <option value="" disabled selected>{L("— Chọn gói —")}</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.product.name} — {v.name} ({L("còn")} {avail.get(v.id) || 0})</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">{L("Nội dung — mỗi dòng là 1 mục giao cho 1 khách")}</label>
            <textarea className="inp font-mono" name="bulk" rows={10} required placeholder={"email1@gmail.com | pass123 | profile 1\nemail2@gmail.com | pass456 | profile 2\nCODE-XXXX-YYYY"} />
          </div>
          <button className="btn-primary w-full">{L("Nhập vào kho")}</button>
          <p className="text-xs text-slate-400">{L("Chỉ nhập tài khoản/mã bạn có quyền bán lại. Khách mua sẽ thấy nguyên văn dòng tương ứng trong đơn của họ.")}</p>
        </form>
      </div>
    </div>
  );
}
