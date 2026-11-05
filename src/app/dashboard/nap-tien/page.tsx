import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, depositContent, vietQrUrl } from "@/lib/settings";
import { vietqrUrl } from "@/lib/vietqr";
import { PageHead, Flash, Badge } from "@/components/ui";
import { DepositCard } from "@/components/deposit-card";
import { createPanelBankDepositAction } from "@/app/actions/user";
import { vnd, num, DEP_STATUS, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DepositPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const s = await getSettings();
  const content = depositContent(user.depositCode);
  const tiers = (() => { try { return JSON.parse(s.deposit_bonus_tiers || "[]") as { from: number; percent: number }[]; } catch { return []; } })();
  const deposits = await prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 20 });
  const bankRows = await prisma.bankAccount.findMany({ where: { active: true }, orderBy: [{ sort: "asc" }, { id: "asc" }] });
  const minDep = parseInt(s.deposit_min || "10000", 10) || 10000;
  const banksProp = bankRows.map((b) => ({
    name: b.bankName, account: b.accountNumber, holder: b.holder,
    qr: b.qrImage || vietqrUrl(b.bankName, b.accountNumber, b.holder, content) || vietQrUrl(b.bankName, b.accountNumber, 0, content, b.holder),
    content, min: minDep,
  }));
  const myPanel = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId } }) : null;
  const panelUsdt = myPanel && myPanel.status === "ACTIVE" && myPanel.usdtAddress
    ? { address: myPanel.usdtAddress, network: myPanel.usdtNetwork || "TRC20", rate: myPanel.usdtRate || parseInt(s.usdt_rate || "") || parseInt(s.usd_rate || "25400") }
    : null;
  const paypalOn = s.paypal_enabled === "1" && !!s.paypal_client_id;
  const stripeOn = s.stripe_enabled === "1" && !!s.stripe_secret_key;
  return (
    <div>
      <PageHead title="Nạp tiền" desc="Chọn phương thức nạp bên dưới. QR ngân hàng (ngân hàng & MoMo) cộng tự động khi đúng nội dung; PayPal/Stripe cộng tự động theo tỉ giá ngay khi thanh toán thành công." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <DepositCard
          banks={banksProp}
          bank={s.bank_account ? { name: s.bank_name, account: s.bank_account, holder: s.bank_holder, qr: vietQrUrl(s.bank_name, s.bank_account, 0, content, s.bank_holder), content, min: parseInt(s.deposit_min || "10000", 10) || 10000 } : null}
          momo={s.momo_phone ? { phone: s.momo_phone, name: s.momo_name, content } : null}
          tiers={tiers}
          intl={paypalOn || stripeOn ? { rate: parseInt(s.usd_rate || "25000", 10) || 25000, paypal: paypalOn, stripe: stripeOn } : null}
          usdt={panelUsdt || (s.usdt_enabled === "1" && s.usdt_address ? { address: s.usdt_address, network: s.usdt_network || "TRC20", rate: parseInt(s.usdt_rate || "") || parseInt(s.usd_rate || "25400") } : null)}
        />
        {myPanel && myPanel.status === "ACTIVE" && myPanel.bankAccount && (
          <form action={createPanelBankDepositAction} className="card p-5">
            <div className="font-bold text-slate-900">Chuyển khoản cho shop {myPanel.name}</div>
            <p className="mt-1 text-sm text-slate-500">{myPanel.bankName} · STK <b className="text-slate-700">{myPanel.bankAccount}</b>{myPanel.bankHolder ? ` · ${myPanel.bankHolder}` : ""}. Chuyển xong hãy gửi yêu cầu bên dưới — chủ shop duyệt và cộng tiền cho bạn.</p>
            <div className="mt-3 flex gap-2">
              <input name="amount" type="number" min={10000} step={1000} required placeholder="Số tiền đã chuyển (đ)" className="inp" />
              <button className="btn-primary shrink-0 !py-2.5">Gửi yêu cầu duyệt</button>
            </div>
          </form>
        )}

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
