import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge, Empty, I } from "@/components/ui";
import { panelSaveBankAccountAction, panelToggleBankAccountAction, panelDeleteBankAccountAction } from "@/app/actions/panel";

export const dynamic = "force-dynamic";

/** Ngân hàng — như web mẹ nhưng là tài khoản nhận nạp RIÊNG của panel:
 *  khách của panel thấy các tài khoản này ở trang Nạp tiền và gửi yêu cầu để chủ panel duyệt. */
export default async function PanelBanks({ searchParams }: { searchParams: { msg?: string; err?: string; edit?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const accounts = await prisma.panelBankAccount.findMany({ where: { panelId: panel.id }, orderBy: [{ sort: "asc" }, { id: "asc" }] });
  const editing = searchParams.edit ? accounts.find((a) => a.id === parseInt(searchParams.edit!)) : undefined;
  return (
    <div>
      <PageHead title="Ngân hàng" desc="Tài khoản ngân hàng nhận tiền nạp của riêng website — khách của panel thấy các tài khoản đang bật ở trang Nạp tiền. (Kênh nạp tự động QR ngân hàng qua SePay vẫn dùng cấu hình chung của web mẹ.)" />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {accounts.map((a) => (
            <div key={a.id} className="card overflow-hidden">
              <div className="flex items-center gap-2.5 bg-gradient-to-r from-brand-600 to-violet-600 px-5 py-3.5 text-white">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">{I.landmark}</span>
                <span className="font-bold">{a.bankName}</span>
                {a.active ? <Badge cls="ml-auto bg-emerald-400/90 text-emerald-950">Đang hiện</Badge> : <Badge cls="ml-auto bg-white/25 text-white">Đang ẩn</Badge>}
              </div>
              <div className="space-y-1.5 px-5 py-4 text-sm">
                <div className="flex justify-between gap-3"><span className="text-slate-400">Số tài khoản</span><b className="font-mono text-slate-800">{a.accountNo}</b></div>
                <div className="flex justify-between gap-3"><span className="text-slate-400">Chủ tài khoản</span><b className="text-slate-800">{a.accountName}</b></div>
                {a.note && <div className="flex justify-between gap-3"><span className="text-slate-400">Ghi chú</span><span className="text-right text-slate-600">{a.note}</span></div>}
              </div>
              <div className="flex gap-2 border-t border-slate-100 px-5 py-3">
                <Link href={`/panel-admin/ngan-hang?edit=${a.id}`} className="btn-ghost btn-sm">Sửa</Link>
                <form action={panelToggleBankAccountAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn-ghost btn-sm">{a.active ? "Ẩn" : "Hiện"}</button>
                </form>
                <form action={panelDeleteBankAccountAction} className="ml-auto">
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn-ghost btn-sm !border-rose-200 !text-rose-600 hover:!bg-rose-50">Xoá</button>
                </form>
              </div>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="md:col-span-2">
              <Empty text="Chưa có tài khoản ngân hàng riêng — khách đang thấy tài khoản mặc định trong Cấu hình của panel (nếu có). Thêm tài khoản ở form bên cạnh để hiện nhiều tài khoản." />
            </div>
          )}
        </div>

        <form action={panelSaveBankAccountAction} className="card space-y-4 p-6">
          <div className="font-bold text-slate-900">{editing ? "Sửa tài khoản" : "Thêm tài khoản ngân hàng"}</div>
          <input type="hidden" name="id" value={editing?.id || ""} />
          <div><label className="lbl">Ngân hàng</label><input name="bankName" className="inp" required defaultValue={editing?.bankName || ""} placeholder="VD: Vietcombank" /></div>
          <div><label className="lbl">Số tài khoản</label><input name="accountNo" className="inp" required defaultValue={editing?.accountNo || ""} placeholder="VD: 0123456789" /></div>
          <div><label className="lbl">Chủ tài khoản</label><input name="accountName" className="inp" required defaultValue={editing?.accountName || ""} placeholder="VD: NGUYEN VAN A" /></div>
          <div><label className="lbl">Ghi chú cho khách (tuỳ chọn)</label><input name="note" className="inp" defaultValue={editing?.note || ""} placeholder="VD: Chuyển xong chụp màn hình gửi hỗ trợ" /></div>
          <button className="btn-primary w-full !py-2.5">{editing ? "Lưu thay đổi" : "Thêm tài khoản"}</button>
          {editing && <Link href="/panel-admin/ngan-hang" className="btn-ghost w-full text-center">Huỷ sửa</Link>}
        </form>
      </div>
    </div>
  );
}
