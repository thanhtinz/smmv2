import { prisma } from "@/lib/db";
import { createFlashSaleAction, toggleFlashSaleAction, deleteFlashSaleAction } from "@/app/actions/flash";
import { dt } from "@/lib/format";
import { FlashSaleForm } from "@/components/flash-form";
import { getServerI18n } from "@/lib/lang-server";

const SCOPE_LABEL: Record<string, string> = { ALL: "Chung (SMM + Premium)", SMM: "Chỉ SMM", PREMIUM: "Chỉ Premium" };
function countIds(json: string | null): number | null {
  if (!json || !json.trim()) return null;
  try { const a = JSON.parse(json) as number[]; return Array.isArray(a) && a.length > 0 ? a.length : null; } catch { return null; }
}
function scopeDetail(x: { scope: string; serviceIds: string | null; productIds: string | null }): string[] {
  const parts: string[] = [];
  if (x.scope !== "PREMIUM") { const n = countIds(x.serviceIds); parts.push(n ? `${n} dịch vụ` : "Mọi dịch vụ"); }
  if (x.scope !== "SMM") { const n = countIds(x.productIds); parts.push(n ? `${n} sản phẩm` : "Mọi sản phẩm"); }
  return parts;
}

/** Khối quản lý Flash Sale của Admin web mẹ.
 *  Để cân bằng bố cục: khối này luôn là thẻ full-width nằm DƯỚI lưới 2 cột của trang Khuyến mãi. */
export async function FlashSaleAdmin() {
  const { L, Ld } = await getServerI18n();
  const sales = await prisma.flashSale.findMany({ where: { panelId: null }, orderBy: { id: "desc" }, take: 20 });
  const products = await prisma.premiumProduct.findMany({
    where: { active: true, panelId: null },
    select: { id: true, name: true }, orderBy: [{ sort: "asc" }, { id: "asc" }],
  });
  const create = createFlashSaleAction;
  const toggle = toggleFlashSaleAction;
  const del = deleteFlashSaleAction;
  const now = new Date();
  const state = (x: (typeof sales)[number]) => !x.active ? "Đã tắt" : now < x.startsAt ? "Sắp chạy" : now > x.endsAt ? "Đã kết thúc" : "Đang chạy";
  return (
    <div className="card mt-6 p-6">
      <div className="font-bold text-slate-900">{L("Flash Sale — giảm giá theo khung giờ")}</div>
      <p className="mt-1 text-sm text-slate-500">{L("Trong khung giờ chạy, đơn thuộc phạm vi chương trình (chỉ SMM, chỉ Premium hoặc chung cả hai) được giảm thêm % này ngay khi đặt đơn (áp tại máy chủ), banner đếm ngược hiện ở trang chủ khách, trang đặt đơn và trang sản phẩm Premium.")}</p>
      <FlashSaleForm action={create} products={products} />
      {sales.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr><th className="th">{L("Tên")}</th><th className="th">{L("Giảm")}</th><th className="th">{L("Phạm vi")}</th><th className="th">{L("Bắt đầu")}</th><th className="th">{L("Kết thúc")}</th><th className="th">{L("Trạng thái")}</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map((x) => (
                <tr key={x.id}>
                  <td className="td font-medium">{x.name}</td>
                  <td className="td font-bold text-rose-600">{x.percent}%</td>
                  <td className="td">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">{L(SCOPE_LABEL[x.scope] || "Chỉ SMM")}</span>
                    <span className="mt-1 block text-xs text-slate-400">{scopeDetail(x).map((p, i) => (<span key={i}>{i > 0 && <span> · </span>}{Ld(p)}</span>))}</span>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(x.startsAt)}</td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(x.endsAt)}</td>
                  <td className="td"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${state(x) === "Đang chạy" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>{L(state(x))}</span></td>
                  <td className="td whitespace-nowrap">
                    <form action={toggle} className="inline"><input type="hidden" name="id" value={x.id} /><button className="btn-ghost btn-sm">{x.active ? L("Tắt") : L("Bật")}</button></form>{" "}
                    <form action={del} className="inline"><input type="hidden" name="id" value={x.id} /><button className="btn-ghost btn-sm !text-rose-600">{L("Xoá")}</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
