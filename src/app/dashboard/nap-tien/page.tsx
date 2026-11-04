import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, depositContent, vietQrUrl } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { DepositCard } from "@/components/deposit-card";
import { vnd, num, DEP_STATUS, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DepositPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const s = await getSettings();
  const content = depositContent(user.depositCode);
  const tiers = (() => { try { return JSON.parse(s.deposit_bonus_tiers || "[]") as { from: number; percent: number }[]; } catch { return []; } })();
  const deposits = await prisma.deposit.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 20 });
  const paypalOn = s.paypal_enabled === "1" && !!s.paypal_client_id;
  const stripeOn = s.stripe_enabled === "1" && !!s.stripe_secret_key;
  return (
    <div>
      <PageHead title="Nạp tiền" desc="Chọn phương thức nạp bên dưới. SePay (ngân hàng & MoMo) cộng tự động khi đúng nội dung; PayPal/Stripe cộng tự động theo tỉ giá ngay khi thanh toán thành công." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <DepositCard
          bank={s.bank_account ? { name: s.bank_name, account: s.bank_account, holder: s.bank_holder, qr: vietQrUrl(s.bank_name, s.bank_account, 0, content, s.bank_holder), content, min: parseInt(s.deposit_min || "10000", 10) || 10000 } : null}
          momo={s.momo_phone ? { phone: s.momo_phone, name: s.momo_name, content } : null}
          tiers={tiers}
          intl={paypalOn || stripeOn ? { rate: parseInt(s.usd_rate || "25000", 10) || 25000, paypal: paypalOn, stripe: stripeOn } : null}
        />

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
