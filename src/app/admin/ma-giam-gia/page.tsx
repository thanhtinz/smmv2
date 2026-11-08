import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { saveDiscountCodeAction, deleteDiscountCodeAction } from "@/app/actions/admin-features";
import { num, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const SCOPE_LABEL: Record<string, string> = { ALL: "Mọi đơn", SMM: "Đơn SMM", PREMIUM: "Đơn Premium" };
const fmtDtLocal = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default async function AdminDiscountCodes({ searchParams }: { searchParams: { edit?: string; q?: string; msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld, M } = await getServerI18n(null);
  const codes = await prisma.discountCode.findMany({ where: { panelId: null }, orderBy: { id: "desc" }, take: 200 });
  const edit = searchParams.edit ? codes.find((c) => c.id === parseInt(searchParams.edit || "0")) : undefined;
  return (
    <div>
      <PageHead title={L("Mã giảm giá")} desc={L("Mã khuyến mãi khách nhập khi đặt đơn SMM / mua Premium — tiền giảm trừ thẳng vào tiền đơn, hệ thống chịu phần giảm.")}>
        {edit && <Link href="/admin/ma-giam-gia" className="btn-ghost">{L("+ Tạo mã mới")}</Link>}
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px] [&>*]:min-w-0">
        <div className="card overflow-x-auto">
          {codes.length === 0 ? <Empty text={L("Chưa có mã giảm giá nào")} /> : (
            <table className="w-full min-w-[680px] [&_th]:whitespace-nowrap">
              <thead><tr>
                <th className="th">{L("Mã giảm giá")}</th><th className="th">{L("Giảm giá")}</th><th className="th">{L("Đã dùng")}</th><th className="th">{L("Điều kiện")}</th><th className="th">{L("Thời gian")}</th><th className="th">{L("Trạng thái")}</th><th className="th"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {codes.map((c) => {
                  const pct = c.usageLimit > 0 ? Math.min(100, Math.round((c.usedCount / c.usageLimit) * 100)) : 0;
                  return (
                    <tr key={c.id}>
                      <td className="td">
                        <span className="rounded-md border border-dashed border-brand-300 bg-brand-50 px-2 py-1 font-mono text-xs font-bold text-brand-700">{c.code}</span>
                        <div className="mt-1.5 text-xs text-slate-400">{L(SCOPE_LABEL[c.scope])}</div>
                      </td>
                      <td className="td font-semibold">{c.type === "PERCENT" ? `${c.value}%` : M(c.value)}{c.type === "PERCENT" && c.maxDiscount > 0 && <div className="text-xs font-normal text-slate-400">{Ld(`tối đa ${M(c.maxDiscount)}`)}</div>}</td>
                      <td className="td">
                        <span className="font-medium">{num(c.usedCount)}{c.usageLimit > 0 ? ` / ${num(c.usageLimit)}` : " / ∞"}</span>
                        {c.usageLimit > 0 && <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>}
                      </td>
                      <td className="td text-slate-500">{c.minOrder > 0 ? Ld(`Đơn từ ${M(c.minOrder)}`) : L("Không")}</td>
                      <td className="td text-xs text-slate-500">{c.startsAt ? dt(c.startsAt) : "—"} → {c.endsAt ? dt(c.endsAt) : "—"}</td>
                      <td className="td">{c.active ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Hoạt động")}</Badge> : <Badge cls="bg-slate-200 text-slate-500">{L("Đã tắt")}</Badge>}</td>
                      <td className="td whitespace-nowrap">
                        <Link href={`/admin/ma-giam-gia?edit=${c.id}`} className="btn-ghost btn-sm">{L("Sửa")}</Link>{" "}
                        <form action={deleteDiscountCodeAction} className="inline"><input type="hidden" name="id" value={c.id} /><button className="btn-ghost btn-sm !text-rose-600">{L("Xoá")}</button></form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <form action={saveDiscountCodeAction} className="card space-y-4 p-5">
          <div className="font-bold text-slate-900">{edit ? Ld(`Sửa mã ${edit.code}`) : L("Tạo mã giảm giá")}</div>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <div><label className="lbl">{L("Mã giảm giá")}</label><input className="inp uppercase" name="code" required defaultValue={edit?.code || ""} placeholder={L("VD: SALE10")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">{L("Loại giảm")}</label>
              <select className="inp" name="type" defaultValue={edit?.type || "PERCENT"}><option value="PERCENT">{L("Phần trăm %")}</option><option value="FIXED">{L("Số tiền cố định")}</option></select></div>
            <div><label className="lbl">{L("Giá trị")}</label><input className="inp" name="value" type="number" min={1} required defaultValue={edit?.value ?? 10} /></div>
            <div><label className="lbl">{L("Áp dụng cho")}</label>
              <select className="inp" name="scope" defaultValue={edit?.scope || "ALL"}><option value="ALL">{L("Mọi đơn")}</option><option value="SMM">{L("Đơn SMM")}</option><option value="PREMIUM">{L("Đơn Premium")}</option></select></div>
            <div><label className="lbl">{L("Đơn tối thiểu (đ)")}</label><input className="inp" name="minOrder" type="number" min={0} defaultValue={edit?.minOrder ?? 0} /></div>
            <div><label className="lbl">{L("Trần giảm cho mã % (đ)")}</label><input className="inp" name="maxDiscount" type="number" min={0} defaultValue={edit?.maxDiscount ?? 0} /></div>
            <div><label className="lbl">{L("Giới hạn lượt dùng")}</label><input className="inp" name="usageLimit" type="number" min={0} defaultValue={edit?.usageLimit ?? 0} /></div>
            <div><label className="lbl">{L("Bắt đầu")}</label><input className="inp" name="startsAt" type="datetime-local" defaultValue={fmtDtLocal(edit?.startsAt ?? null)} /></div>
            <div><label className="lbl">{L("Kết thúc")}</label><input className="inp" name="endsAt" type="datetime-local" defaultValue={fmtDtLocal(edit?.endsAt ?? null)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" name="active" defaultChecked={edit ? edit.active : true} className="h-4 w-4 accent-brand-600" /> {L("Đang bật")}</label>
          <button className="btn-primary w-full">{edit ? L("Lưu thay đổi") : L("Tạo mã")}</button>
        </form>
      </div>
    </div>
  );
}
