import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty, I } from "@/components/ui";
import { saveBankAction, deleteBankAction } from "@/app/actions/admin-features";
import { vietqrUrl } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

export default async function AdminBanks({ searchParams }: { searchParams: { edit?: string; msg?: string; err?: string } }) {
  await requireAdminPage();
  const banks = await prisma.bankAccount.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] });
  const edit = searchParams.edit ? banks.find((b) => b.id === parseInt(searchParams.edit || "0")) : undefined;
  return (
    <div>
      <PageHead title="Ngân hàng" desc="Quản lý tài khoản ngân hàng nhận thanh toán. Người dùng sẽ chuyển khoản vào các tài khoản này (hiện ở trang Nạp tiền).">
        {edit && <Link href="/admin/ngan-hang" className="btn-ghost">+ Thêm ngân hàng</Link>}
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div>
        <div>
          {banks.length === 0 ? <Empty text="Chưa có ngân hàng nào — trang Nạp tiền đang dùng ngân hàng khai trong Cấu hình" /> : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {banks.map((b) => {
                const qr = b.qrImage || vietqrUrl(b.bankName, b.accountNumber, b.holder);
                return (
                  <div key={b.id} className="card p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{I.landmark}</span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900">{b.bankName}</div>
                        <div className="text-sm text-slate-500">{b.holder}</div>
                      </div>
                      <span className="ml-auto">{b.active ? <Badge cls="bg-emerald-100 text-emerald-700">Đang hoạt động</Badge> : <Badge cls="bg-slate-200 text-slate-500">Đã tắt</Badge>}</span>
                    </div>
                    <div className="mt-3 font-mono text-lg font-bold tracking-wide text-slate-800">{b.accountNumber}</div>
                    {b.branch && <div className="text-sm text-slate-400">Chi nhánh: {b.branch}</div>}
                    {b.note && <div className="mt-1 text-sm text-slate-400">{b.note}</div>}
                    {qr && <img src={qr} alt="QR" className="mt-3 h-36 w-36 rounded-xl border border-slate-100 object-contain" />}
                    <div className="mt-4 flex gap-2">
                      <Link href={`/admin/ngan-hang?edit=${b.id}`} className="btn-ghost btn-sm">Sửa</Link>
                      <form action={deleteBankAction}><input type="hidden" name="id" value={b.id} /><button className="btn-ghost btn-sm !text-rose-600">Xoá</button></form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <form action={saveBankAction} className="card mt-6 p-5">
          <div className="font-bold text-slate-900">{edit ? `Sửa: ${edit.bankName}` : "Thêm ngân hàng"}</div>
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><label className="lbl">Tên ngân hàng</label><input className="inp" name="bankName" required defaultValue={edit?.bankName || ""} placeholder="VD: Vietcombank" /></div>
            <div><label className="lbl">Số tài khoản</label><input className="inp" name="accountNumber" required defaultValue={edit?.accountNumber || ""} /></div>
            <div><label className="lbl">Chủ tài khoản</label><input className="inp uppercase" name="holder" required defaultValue={edit?.holder || ""} /></div>
            <div><label className="lbl">Chi nhánh</label><input className="inp" name="branch" defaultValue={edit?.branch || ""} /></div>
            <div><label className="lbl">Ảnh QR (URL, để trống = tự sinh VietQR)</label><input className="inp" name="qrImage" defaultValue={edit?.qrImage || ""} placeholder="https://..." /></div>
            <div><label className="lbl">Ghi chú</label><input className="inp" name="note" defaultValue={edit?.note || ""} /></div>
            <div><label className="lbl">Thứ tự</label><input className="inp" name="sort" type="number" defaultValue={edit?.sort ?? 0} /></div>
            <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium text-slate-700"><input type="checkbox" name="active" defaultChecked={edit ? edit.active : true} className="h-4 w-4 accent-brand-600" /> Đang bật</label>
          </div>
          <button className="btn-primary mt-4">{edit ? "Lưu thay đổi" : "Thêm ngân hàng"}</button>
        </form>
      </div>
    </div>
  );
}
