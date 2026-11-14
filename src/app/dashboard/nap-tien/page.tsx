import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, depositContent, vietQrUrl } from "@/lib/settings";
import { usdtDepositRate } from "@/lib/rates";
import { vietqrUrl } from "@/lib/vietqr";
import { PageHead, Flash, Badge } from "@/components/ui";
import { DepositCard } from "@/components/deposit-card";
import { num, DEP_STATUS, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function DepositPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
  // Trang nạp CHỈ hiện method có tick mục đích "Nạp vào ví" (+ đủ cấu hình).
  const paypalOn = intlCfg.paypalDepositEnabled;
  const stripeOn = intlCfg.stripeDepositEnabled;
  const sepayOn = s.sepay_enabled !== "0";
  return (
    <div>
      <PageHead title={L("Nạp tiền")} desc={L("Chọn phương thức nạp bên dưới. QR ngân hàng cộng tự động khi đúng nội dung; PayPal/Stripe cộng tự động theo tỉ giá ngay khi thanh toán thành công.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      {/* Bố cục (lệnh Tín 2026-11-10): bỏ hẳn thẻ Số dư hiện tại (đã có sẵn ở
          topbar) và form Khai báo nạp (bỏ hẳn theo lệnh 21:00). Khu nạp là 2
          THẺ TÁCH HẲN (20:49): thẻ trái chứa lưới phương thức 2×2, thẻ phải
          là panel của phương thức đang chọn. Riêng QR ngân hàng là luồng 2
          bước (21:00): nhập số tiền ở thẻ trái + bấm Nạp tiền thì thẻ panel
          mới hiện, QR sinh kèm đúng số tiền đó. Thẻ thưởng nạp và lịch sử
          nạp full-width ở dưới cùng. */}
      <div>
        <DepositCard
          tiers={effTiers}
          banks={sepayOn ? banksProp : []}
          bank={sepayOn && s.bank_account ? { name: s.bank_name, account: s.bank_account, holder: s.bank_holder, qr: vietQrUrl(s.bank_name, s.bank_account, 0, content, s.bank_holder), content, min: parseInt(s.deposit_min || "10000", 10) || 10000 } : null}
          intl={paypalOn || stripeOn ? { rate: intlCfg.depositRate, paypal: paypalOn, stripe: stripeOn, minUsd: intlCfg.minUsd || 5 } : null}
          usdt={s.boltutil_enabled === "1" && s.boltutil_api_key ? {
            rate: usdtDepositRate(s).rate,
            minUsd: parseFloat(s.usdt_min || "") || 5,
            defaultNetwork: s.boltutil_default_network || "TRON",
            networks: String(s.boltutil_networks || "TRON").split(",").map((x: string) => x.trim().toUpperCase()).filter((x: string) => ["TRON", "BSC", "ETHEREUM", "POLYGON", "SOLANA", "BASE"].includes(x)),
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
        {effTiers.length > 0 && (
          <div className="card mt-6 border-brand-100 bg-brand-50 p-5 text-sm">
            <div className="mb-1.5 font-semibold text-brand-800">{L("Thưởng nạp hiện tại")}</div>
            <div className="flex flex-wrap gap-x-8 gap-y-1">
              {effTiers.map((tier) => <div key={tier.from} className="text-brand-700">{L("Nạp từ ")}{M(tier.from)}: <b>{`+${tier.percent}%`}</b></div>)}
            </div>
          </div>
        )}
      </div>
      <div className="card mt-6 overflow-hidden">
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
      </div>
    </div>
  );
}
