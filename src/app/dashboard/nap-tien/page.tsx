import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, depositContent, vietQrUrl, usdtRateOf } from "@/lib/settings";
import { vietqrUrl } from "@/lib/vietqr";
import { PageHead, Flash, Badge } from "@/components/ui";
import { DepositCard } from "@/components/deposit-card";
import { num, DEP_STATUS, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

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
  const { L, Ld, M } = await getServerI18n();
  const effTiers = tiers;
  // Method quốc tế theo cấu hình của web mẹ
  const { resolveIntlConfig } = await import("@/lib/payments");
  const intlCfg = await resolveIntlConfig(user.id);
  const paypalOn = !!intlCfg.paypal;
  const stripeOn = !!intlCfg.stripe;
  return (
    <div>
      <PageHead title={L("Nạp tiền")} desc={L("Chọn phương thức nạp bên dưới. QR ngân hàng (ngân hàng & MoMo) cộng tự động khi đúng nội dung; PayPal/Stripe cộng tự động theo tỉ giá ngay khi thanh toán thành công.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <DepositCard
          banks={banksProp}
          bank={s.bank_account ? { name: s.bank_name, account: s.bank_account, holder: s.bank_holder, qr: vietQrUrl(s.bank_name, s.bank_account, 0, content, s.bank_holder), content, min: parseInt(s.deposit_min || "10000", 10) || 10000 } : null}
          momo={s.momo_phone ? { phone: s.momo_phone, name: s.momo_name, content } : null}
          tiers={effTiers}
          intl={paypalOn || stripeOn ? { rate: intlCfg.rate, paypal: paypalOn, stripe: stripeOn, minUsd: intlCfg.minUsd || 5 } : null}
          usdt={s.boltutil_enabled === "1" && s.boltutil_api_key ? {
            rate: usdtRateOf(s),
            minUsd: parseFloat(s.usdt_min || "") || 5,
            defaultNetwork: s.boltutil_default_network || "TRON",
            networks: String(s.boltutil_networks || "TRON").split(",").map((x: string) => x.trim().toUpperCase()).filter((x: string) => ["TRON", "BSC", "ETHEREUM", "SOLANA", "ARBITRUM", "BASE"].includes(x)),
            pending: (() => {
              const pd = deposits.find((d) => d.method === "USDT" && d.status === "PENDING" && (d.externalId || "").startsWith("bolt:"));
              if (!pd) return null;
              let data: any = {};
              try { data = pd.providerData ? JSON.parse(pd.providerData) : {}; } catch { /* dữ liệu cổng hỏng -> coi như không có phiên chờ */ }
              if (!data.externalOrderId) return null;
              return { code: pd.code, checkoutUrl: data.checkoutUrl || null, paymentAddress: data.paymentAddress || null, cryptoAmount: data.cryptoAmount || null, network: data.network || "TRON", expiresAt: data.expiresAt || null, status: data.boltStatus || "PENDING" };
            })(),
          } : null}
        />
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">{L("Lịch sử nạp")}</div>
          {deposits.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">{L("Chưa có giao dịch nạp nào")}</div> : (
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {deposits.map((d) => (
                  <tr key={d.id}>
                    <td className="td"><div className="font-mono text-xs">{d.code}</div><div className="text-xs text-slate-400">{dt(d.createdAt)}{d.auto ? L(" · tự động") : ""}</div></td>
                    <td className="td font-semibold">{M(d.amount)}{d.bonus > 0 && <div className="text-xs text-emerald-600">{`+${M(d.bonus)} ${L("thưởng")}`}</div>}</td>
                    <td className="td text-right"><Badge cls={DEP_STATUS[d.status].cls}>{L(DEP_STATUS[d.status].label)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="px-5 py-4 bg-slate-50 text-sm text-slate-500">{L("Tổng đã nạp:")} <b className="text-slate-800">{M(user.totalDeposited)}</b> · {L("Đã chi tiêu:")} <b className="text-slate-800">{M(user.totalSpent)}</b> · {L("Số dư:")} <b className="text-emerald-700">{M(user.balance)}</b></div>
        </div>
      </div>
    </div>
  );
}
