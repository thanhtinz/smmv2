import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, depositContent, vietQrUrl, calcBonus } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { createDepositAction } from "@/app/actions/user";
import { vnd, num, DEP_STATUS, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DepositPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const s = await getSettings();
  const content = depositContent(user.depositCode);
  const tiers = (() => { try { return JSON.parse(s.deposit_bonus_tiers || "[]") as { from: number; percent: number }[]; } catch { return []; } })();
  const deposits = await prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 20 });
  void calcBonus;
  return (
    <div>
      <PageHead title="Nạp tiền" desc="Chuyển khoản đúng nội dung để được cộng tiền tự động. Sai nội dung vẫn được cộng nhưng phải chờ admin kiểm tra tay." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="card p-6">
          <h2 className="font-bold text-slate-900 mb-4">Chuyển khoản ngân hàng</h2>
          {s.bank_account ? (
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={vietQrUrl(s.bank_name, s.bank_account, 0, content, s.bank_holder)} alt="VietQR nạp tiền" className="w-[200px] h-[200px] rounded-2xl border border-slate-200 object-contain bg-white" />
              <dl className="space-y-3 text-sm">
                <Row k="Ngân hàng" v={s.bank_name} />
                <Row k="Số tài khoản" v={s.bank_account} copy />
                <Row k="Chủ tài khoản" v={s.bank_holder} />
                <Row k="Nội dung CK (bắt buộc đúng)" v={content} copy strong />
                <Row k="Nạp tối thiểu" v={vnd(parseInt(s.deposit_min || "10000"))} />
              </dl>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Admin chưa cấu hình tài khoản ngân hàng. Vui lòng liên hệ hỗ trợ hoặc dùng MoMo bên dưới.</p>
          )}
          {s.momo_phone && (
            <div className="mt-6 border-t border-dashed pt-5">
              <h3 className="font-bold text-slate-900 mb-3">Ví MoMo</h3>
              <dl className="space-y-3 text-sm">
                <Row k="Số MoMo" v={s.momo_phone} copy />
                <Row k="Tên" v={s.momo_name} />
                <Row k="Nội dung" v={content} copy strong />
              </dl>
            </div>
          )}
          {tiers.length > 0 && (
            <div className="mt-6 bg-brand-50 border border-brand-100 rounded-2xl p-4 text-sm">
              <div className="font-semibold text-brand-800 mb-1.5">Thưởng nạp hiện tại</div>
              {tiers.map((t) => <div key={t.from} className="text-brand-700">Nạp từ {vnd(t.from)}: <b>+{t.percent}%</b></div>)}
            </div>
          )}
          <form action={createDepositAction} className="mt-6 border-t border-dashed pt-5 space-y-3">
            <div className="font-semibold text-slate-800 text-sm">Đã chuyển khoản? Khai báo để đối soát nhanh hơn</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Số tiền đã chuyển</label>
                <input className="inp" name="amount" type="number" required min={parseInt(s.deposit_min || "10000")} placeholder="500000" />
              </div>
              <div>
                <label className="lbl">Kênh</label>
                <select className="inp" name="method"><option value="BANK">Ngân hàng</option><option value="MOMO">MoMo</option><option value="CARD">Thẻ cào</option><option value="USDT">USDT</option></select>
              </div>
            </div>
            <button className="btn-dark w-full">Gửi khai báo nạp</button>
            <p className="text-xs text-slate-400">Hệ thống cộng tự động khi chuyển khoản đúng nội dung. Khai báo này giúp admin cộng tay nhanh nếu giao dịch bị lệch nội dung.</p>
          </form>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">Lịch sử nạp</div>
          {deposits.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">Chưa có giao dịch nạp nào</div> : (
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {deposits.map((d) => (
                  <tr key={d.id}>
                    <td className="td"><div className="font-mono text-xs">{d.code}</div><div className="text-xs text-slate-400">{dt(d.createdAt)}{d.auto ? " · tự động" : ""}</div></td>
                    <td className="td font-semibold">{vnd(d.amount)}{d.bonus > 0 && <div className="text-xs text-emerald-600">+{vnd(d.bonus)} thưởng</div>}</td>
                    <td className="td text-right"><Badge cls={DEP_STATUS[d.status].cls}>{DEP_STATUS[d.status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-5 py-4 bg-slate-50 text-sm text-slate-500">Tổng đã nạp: <b className="text-slate-800">{vnd(user.totalDeposited)}</b> · Đã chi tiêu: <b className="text-slate-800">{vnd(user.totalSpent)}</b> · Số dư: <b className="text-emerald-700">{num(user.balance)}đ</b></div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, copy, strong }: { k: string; v: string; copy?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className={`flex items-center gap-2 ${strong ? "font-extrabold text-brand-700" : "font-semibold text-slate-800"}`}>{v}{copy && <CopyBtn text={v} label="Chép" />}</dd>
    </div>
  );
}
