import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { saveDiscountCodeAction, deleteDiscountCodeAction } from "@/app/actions/admin-features";
import { vnd, num, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

const SCOPE_LABEL: Record<string, string> = { ALL: "Mọi đơn", SMM: "Đơn SMM", PREMIUM: "Đơn Premium" };
const fmtDtLocal = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default async function AdminDiscountCodes({ searchParams }: { searchParams: { edit?: string; q?: string; msg?: string; err?: string } }) {
  await requireAdminPage();
  const codes = await prisma.discountCode.findMany({ where: { panelId: null }, orderBy: { id: "desc" }, take: 200 });
  const edit = searchParams.edit ? codes.find((c) => c.id === parseInt(searchParams.edit || "0")) : undefined;
  return (
    <div>
      <PageHead title="Mã giảm giá" desc="Mã khuyến mãi khách nhập khi đặt đơn SMM / mua Premium — tiền giảm trừ thẳng vào tiền đơn, hệ thống chịu phần giảm.">
        {edit && <Link href="/admin/ma-giam-gia" className="btn-ghost">+ Tạo mã mới</Link>}
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        <div className="card overflow-x-auto">
          {codes.length === 0 ? <Empty text="Chưa có mã giảm giá nào" /> : (
            <table className="w-full min-w-[680px] [&_th]:whitespace-nowrap">
              <thead><tr>
                <th className="th">Mã giảm giá</th><th className="th">Giảm giá</th><th className="th">Đã dùng</th><th className="th">Điều kiện</th><th className="th">Thời gian</th><th className="th">Trạng thái</th><th className="th"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {codes.map((c) => {
                  const pct = c.usageLimit > 0 ? Math.min(100, Math.round((c.usedCount / c.usageLimit) * 100)) : 0;
                  return (
                    <tr key={c.id}>
                      <td className="td">
                        <span className="rounded-md border border-dashed border-brand-300 bg-brand-50 px-2 py-1 font-mono text-xs font-bold text-brand-700">{c.code}</span>
                        <div className="mt-1.5 text-xs text-slate-400">{SCOPE_LABEL[c.scope]}</div>
                      </td>
                      <td className="td font-semibold">{c.type === "PERCENT" ? `${c.value}%` : vnd(c.value)}{c.type === "PERCENT" && c.maxDiscount > 0 && <div className="text-xs font-normal text-slate-400">tối đa {vnd(c.maxDiscount)}</div>}</td>
                      <td className="td">
                        <span className="font-medium">{num(c.usedCount)}{c.usageLimit > 0 ? ` / ${num(c.usageLimit)}` : " / ∞"}</span>
                        {c.usageLimit > 0 && <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>}
                      </td>
                      <td className="td text-slate-500">{c.minOrder > 0 ? `Đơn từ ${vnd(c.minOrder)}` : "Không"}</td>
                      <td className="td text-xs text-slate-500">{c.startsAt ? dt(c.startsAt) : "—"} → {c.endsAt ? dt(c.endsAt) : "—"}</td>
                      <td className="td">{c.active ? <Badge cls="bg-emerald-100 text-emerald-700">Hoạt động</Badge> : <Badge cls="bg-slate-200 text-slate-500">Đã tắt</Badge>}</td>
                      <td className="td whitespace-nowrap">
                        <Link href={`/admin/ma-giam-gia?edit=${c.id}`} className="btn-ghost btn-sm">Sửa</Link>{" "}
                        <form action={deleteDiscountCodeAction} className="inline"><input type="hidden" name="id" value={c.id} /><button className="btn-ghost btn-sm !text-rose-600">Xoá</button></form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <form action={saveDiscountCodeAction} className="card space-y-4 p-5">
          <div className="font-bold text-slate-900">{edit ? `Sửa mã ${edit.code}` : "Tạo mã giảm giá"}</div>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <div><label className="lbl">Mã giảm giá</label><input className="inp uppercase" name="code" required defaultValue={edit?.code || ""} placeholder="VD: SALE10" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Loại giảm</label>
              <select className="inp" name="type" defaultValue={edit?.type || "PERCENT"}><option value="PERCENT">Phần trăm %</option><option value="FIXED">Số tiền cố định</option></select></div>
            <div><label className="lbl">Giá trị</label><input className="inp" name="value" type="number" min={1} required defaultValue={edit?.value ?? 10} /></div>
            <div><label className="lbl">Áp dụng cho</label>
              <select className="inp" name="scope" defaultValue={edit?.scope || "ALL"}><option value="ALL">Mọi đơn</option><option value="SMM">Đơn SMM</option><option value="PREMIUM">Đơn Premium</option></select></div>
            <div><label className="lbl">Đơn tối thiểu (đ)</label><input className="inp" name="minOrder" type="number" min={0} defaultValue={edit?.minOrder ?? 0} /></div>
            <div><label className="lbl">Trần giảm cho mã % (đ)</label><input className="inp" name="maxDiscount" type="number" min={0} defaultValue={edit?.maxDiscount ?? 0} /></div>
            <div><label className="lbl">Giới hạn lượt dùng</label><input className="inp" name="usageLimit" type="number" min={0} defaultValue={edit?.usageLimit ?? 0} /></div>
            <div><label className="lbl">Bắt đầu</label><input className="inp" name="startsAt" type="datetime-local" defaultValue={fmtDtLocal(edit?.startsAt ?? null)} /></div>
            <div><label className="lbl">Kết thúc</label><input className="inp" name="endsAt" type="datetime-local" defaultValue={fmtDtLocal(edit?.endsAt ?? null)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" name="active" defaultChecked={edit ? edit.active : true} className="h-4 w-4 accent-brand-600" /> Đang bật</label>
          <button className="btn-primary w-full">{edit ? "Lưu thay đổi" : "Tạo mã"}</button>
        </form>
      </div>
    </div>
  );
}
