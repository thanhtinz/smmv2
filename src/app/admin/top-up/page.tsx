import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { PRE_STATUS, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Đơn hàng Top-Up: cùng bảng PremiumOrder + cùng trang chi tiết
 *  /admin/don-premium/[id] như các khu riêng khác, nhưng lọc sẵn về nhóm
 *  topups — đơn khu này TÁCH HẲN khỏi hàng đợi Đơn Premium thường
 *  (lib/order-scope: topups nằm trong DEDICATED_GROUPS). */
export default async function AdminTopupOrders( { searchParams: searchParamsPromise }: { searchParams: Promise<{ status?: string; q?: string; msg?: string; err?: string }> }) {
  const searchParams = await searchParamsPromise;
  const { L, Ld, M } = await getServerI18n(null);
  const where: any = { variant: { providerGroup: "topups" } };
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.q) where.OR = [{ code: { contains: searchParams.q, mode: "insensitive" } }, { user: { username: { contains: searchParams.q, mode: "insensitive" } } }];
  const orders = await prisma.premiumOrder.findMany({ where, orderBy: { id: "desc" }, take: 50, include: { variant: { include: { product: true } }, user: true } });
  return (
    <div>
      <PageHead title={L("Đơn hàng Top-Up")} desc={L("Đơn Chờ giao = khách đã trả tiền, cần xử lý. Đơn Bảo hành = khách báo lỗi, cần đổi/hoàn.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form className="flex flex-wrap gap-2 mb-5">
        <input className="inp min-w-[220px] flex-1" name="q" placeholder={L("Mã đơn / username...")} defaultValue={searchParams.q || ""} />
        <select className="inp !w-48" name="status" defaultValue={searchParams.status || ""}>
          <option value="">{L("Tất cả trạng thái")}</option>
          {Object.entries(PRE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-dark">{L("Lọc")}</button>
      </form>
      {orders.length === 0 ? <Empty text={L("Không có đơn nào")} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">{L("Mã đơn")}</th><th className="th">{L("Khách")}</th><th className="th">{L("Sản phẩm")}</th><th className="th">{L("Thu / Vốn")}</th><th className="th">{L("Trạng thái")}</th><th className="th">{L("Thời gian")}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="td"><Link href={`/admin/don-premium/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link></td>
                  <td className="td font-medium">{o.user.username}</td>
                  <td className="td"><div className="font-medium">{o.variant.product.name} — {o.variant.name} × {o.quantity}</div><div className="text-xs text-slate-400 max-w-[280px] truncate">{o.buyerInfo || ""}</div></td>
                  <td className="td"><div className="font-semibold">{M(o.total)}</div><div className="text-xs text-slate-400">{L("vốn")} {M(o.cost)}</div></td>
                  <td className="td"><Badge cls={PRE_STATUS[o.status].cls}>{L(PRE_STATUS[o.status].label)}</Badge></td>
                  <td className="td text-xs text-slate-500">{dt(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
