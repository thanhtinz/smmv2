import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings, depositContent, vietQrUrl } from "@/lib/settings";
import { usdtDepositRate } from "@/lib/rates";
import { vietqrUrl } from "@/lib/vietqr";
import { PageHead, Flash, Badge } from "@/components/ui";
import { DepositCard } from "@/components/deposit-card";
import { CopyBtn } from "@/components/client";
import { createDepositAction } from "@/app/actions/user";
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
  // Trang nạp CHỈ hiện method có tick mục đích "Nạp vào ví" (+ đủ cấu hình).
  const paypalOn = intlCfg.paypalDepositEnabled;
  const stripeOn = intlCfg.stripeDepositEnabled;
  const sepayOn = s.sepay_enabled !== "0";
  return (
    <div>
      <PageHead title={L("Nạp tiền")} desc={L("Chọn phương thức nạp bên dưới. QR ngân hàng (ngân hàng & MoMo) cộng tự động khi đúng nội dung; PayPal/Stripe cộng tự động theo tỉ giá ngay khi thanh toán thành công.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      {/* Bố cục PC cân bằng (lệnh Tín 2026-11-10): trước đây thẻ nạp 1.112px đứng
          cạnh thẻ lịch sử 195px để lại khoảng chết ~900px. Nay: cột trái là thẻ
          nạp; cột phụ chứa thẻ số dư (trước là footer của thẻ lịch sử) + form
          khai báo nạp + thẻ thưởng nạp (hai khối trước nằm trong thẻ nạp) —
          hai cột kết thúc gần ngang nhau. Lịch sử nạp thành mục full-width ở
          dưới nên số dòng lịch sử không phá cân bằng hai cột nữa. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <DepositCard
          banks={sepayOn ? banksProp : []}
          bank={sepayOn && s.bank_account ? { name: s.bank_name, account: s.bank_account, holder: s.bank_holder, qr: vietQrUrl(s.bank_name, s.bank_account, 0, content, s.bank_holder), content, min: parseInt(s.deposit_min || "10000", 10) || 10000 } : null}
          momo={sepayOn && s.momo_phone ? { phone: s.momo_phone, name: s.momo_name, content } : null}
          intl={paypalOn || stripeOn ? { rate: intlCfg.depositRate, paypal: paypalOn, stripe: stripeOn, minUsd: intlCfg.minUsd || 5 } : null}
          usdt={s.boltutil_enabled === "1" && s.boltutil_api_key ? {
            rate: usdtDepositRate(s).rate,
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
        <aside className="space-y-6">
          <div className="card p-5">
            <div className="text-sm text-slate-500">{L("Số dư hiện tại")}</div>
            <div className="mt-1 text-3xl font-extrabold text-emerald-700">{M(user.balance)}</div>
            <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{L("Tổng đã nạp:")}</dt>
                <dd className="font-semibold text-slate-800">{M(user.totalDeposited)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{L("Đã chi tiêu:")}</dt>
                <dd className="font-semibold text-slate-800">{M(user.totalSpent)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{L("Nội dung chuyển khoản")}</dt>
                <dd className="flex items-center gap-2 font-extrabold text-brand-700">{content}<CopyBtn text={content} label={L("Chép")} /></dd>
              </div>
            </dl>
          </div>
          <form action={createDepositAction} className="card p-5 space-y-3">
            <div className="font-semibold text-slate-800">{L("Đã chuyển khoản? Khai báo để đối soát nhanh hơn")}</div>
            <div>
              <label className="lbl">{L("Số tiền đã chuyển")}</label>
              <input className="inp" name="amount" type="number" required min={minDep} placeholder="500000" />
            </div>
            <div>
              <label className="lbl">{L("Kênh")}</label>
              <select className="inp" name="method" defaultValue="BANK"><option value="BANK">{L("Ngân hàng")}</option><option value="MOMO">MoMo</option><option value="CARD">{L("Thẻ cào")}</option><option value="USDT">USDT</option></select>
            </div>
            <button className="btn-dark w-full">{L("Gửi khai báo nạp")}</button>
            <p className="text-xs text-slate-400">{L("Hệ thống cộng tự động khi chuyển khoản đúng nội dung. Khai báo này giúp admin cộng tay nhanh nếu giao dịch bị lệch nội dung.")}</p>
          </form>
          {effTiers.length > 0 && (
            <div className="card border-brand-100 bg-brand-50 p-5 text-sm">
              <div className="mb-1.5 font-semibold text-brand-800">{L("Thưởng nạp hiện tại")}</div>
              {effTiers.map((tier) => <div key={tier.from} className="text-brand-700">{L("Nạp từ ")}{M(tier.from)}: <b>{`+${tier.percent}%`}</b></div>)}
            </div>
          )}
        </aside>
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
