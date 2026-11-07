import { prisma } from "@/lib/db";
import { createFlashSaleAction, toggleFlashSaleAction, deleteFlashSaleAction, panelCreateFlashSaleAction, panelToggleFlashSaleAction, panelDeleteFlashSaleAction } from "@/app/actions/flash";
import { dt } from "@/lib/format";

/** Khối quản lý Flash Sale dùng chung cho Admin web mẹ và Panel Admin (parity).
 *  Để cân bằng bố cục: khối này luôn là thẻ full-width nằm DƯỚI lưới 2 cột của trang Khuyến mãi. */
export async function FlashSaleAdmin({ panelId }: { panelId: number | null }) {
  const sales = await prisma.flashSale.findMany({ where: { panelId }, orderBy: { id: "desc" }, take: 20 });
  const panel = panelId !== null;
  const create = panel ? panelCreateFlashSaleAction : createFlashSaleAction;
  const toggle = panel ? panelToggleFlashSaleAction : toggleFlashSaleAction;
  const del = panel ? panelDeleteFlashSaleAction : deleteFlashSaleAction;
  const now = new Date();
  const state = (x: (typeof sales)[number]) => !x.active ? "Đã tắt" : now < x.startsAt ? "Sắp chạy" : now > x.endsAt ? "Đã kết thúc" : "Đang chạy";
  const inputCls = "rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]";
  return (
    <div className="card mt-6 p-6">
      <div className="font-bold text-slate-900">Flash Sale — giảm giá theo khung giờ</div>
      <p className="mt-1 text-sm text-slate-500">Trong khung giờ chạy, giá dịch vụ SMM được giảm thêm % này ngay khi đặt đơn (áp tại máy chủ), banner đếm ngược hiện ở trang chủ khách và trang đặt đơn.</p>
      <form action={create} className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <input className={`${inputCls} col-span-2`} name="name" required placeholder="Tên chương trình" />
        <input className={inputCls} name="percent" type="number" min={1} max={90} required placeholder="Giảm %" />
        <input className={inputCls} name="startsAt" type="datetime-local" required />
        <input className={inputCls} name="endsAt" type="datetime-local" required />
        <select className={inputCls} name="scope">
          <option value="all">Toàn bộ dịch vụ</option>
          <option value="some">Theo ID dịch vụ</option>
        </select>
        <input className={`${inputCls} col-span-2 lg:col-span-5`} name="serviceIds" placeholder="ID dịch vụ (khi chọn Theo ID, cách nhau bằng dấu phẩy) — để trống nếu áp toàn bộ" />
        <button className="btn-primary !py-2">Tạo flash sale</button>
      </form>
      {sales.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">Tên</th><th className="th">Giảm</th><th className="th">Bắt đầu</th><th className="th">Kết thúc</th><th className="th">Trạng thái</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {sales.map((x) => (
                <tr key={x.id}>
                  <td className="td font-medium">{x.name}</td>
                  <td className="td font-bold text-rose-600">{x.percent}%</td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(x.startsAt)}</td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(x.endsAt)}</td>
                  <td className="td"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${state(x) === "Đang chạy" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>{state(x)}</span></td>
                  <td className="td whitespace-nowrap">
                    <form action={toggle} className="inline"><input type="hidden" name="id" value={x.id} /><button className="btn-ghost btn-sm">{x.active ? "Tắt" : "Bật"}</button></form>{" "}
                    <form action={del} className="inline"><input type="hidden" name="id" value={x.id} /><button className="btn-ghost btn-sm !text-rose-600">Xoá</button></form>
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
