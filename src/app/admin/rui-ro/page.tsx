import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Empty, Stat, I } from "@/components/ui";
import { num, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminRisk() {
  await requireAdminPage();
  const { L, Ld, M } = await getServerI18n(null);
  const hourAgo = new Date(Date.now() - 3600_000);
  const dayAgo = new Date(Date.now() - 86400_000);

  const [rapidUsers, sharedBuyers, bigDeposits, refundHeavy] = await Promise.all([
    prisma.premiumOrder.groupBy({ by: ["userId"], where: { createdAt: { gte: hourAgo } }, _count: true, orderBy: { _count: { id: "desc" } }, take: 10 }).then(async (rows) => {
      const ids = rows.filter((r) => r._count >= 5).map((r) => r.userId);
      const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
      const name = new Map(users.map((u) => [u.id, u.username]));
      return rows.filter((r) => r._count >= 5).map((r) => ({ userId: r.userId, username: name.get(r.userId) || `#${r.userId}`, count: r._count }));
    }),
    prisma.premiumOrder.groupBy({ by: ["buyerInfo"], where: { createdAt: { gte: dayAgo }, buyerInfo: { not: null } }, _count: true, orderBy: { _count: { id: "desc" } }, take: 30 }).then(async (rows) => {
      const out: { buyer: string; users: number; orders: number }[] = [];
      for (const r of rows.slice(0, 10)) {
        if (!r.buyerInfo || !r.buyerInfo.trim()) continue;
        const distinct = await prisma.premiumOrder.groupBy({ by: ["userId"], where: { buyerInfo: r.buyerInfo, createdAt: { gte: dayAgo } } });
        if (distinct.length >= 3) out.push({ buyer: r.buyerInfo, users: distinct.length, orders: r._count });
      }
      return out;
    }),
    prisma.deposit.findMany({ where: { status: "PENDING", amount: { gte: 5000000 } }, orderBy: { id: "desc" }, take: 10, include: { user: true } }),
    prisma.premiumOrder.groupBy({ by: ["userId"], where: { status: "REFUNDED", createdAt: { gte: dayAgo } }, _count: true, orderBy: { _count: { id: "desc" } }, take: 10 }).then(async (rows) => {
      const ids = rows.filter((r) => r._count >= 3).map((r) => r.userId);
      const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
      const name = new Map(users.map((u) => [u.id, u.username]));
      return rows.filter((r) => r._count >= 3).map((r) => ({ userId: r.userId, username: name.get(r.userId) || `#${r.userId}`, count: r._count }));
    }),
  ]);

  return (
    <div>
      <PageHead title={L("Phát hiện rủi ro")} desc={L("Các dấu hiệu bất thường hệ thống tự quét: đặt đơn dày bất thường, thông tin nhận hàng dùng chung nhiều tài khoản, nạp lớn chờ duyệt, hoàn tiền dày.")} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={L("Khách đặt ≥5 đơn / giờ")} value={num(rapidUsers.length)} icon={I.clock} tone="orange" />
        <Stat label={L("Thông tin nhận dùng chung ≥3 tài khoản")} value={num(sharedBuyers.length)} icon={I.list} tone="amber" />
        <Stat label={L("Khách bị hoàn ≥3 đơn / ngày")} value={num(refundHeavy.length)} icon={I.money} tone="violet" />
        <Stat label={L("Nạp lớn đang chờ duyệt")} value={num(bigDeposits.length)} icon={I.shield} tone="rose" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">{L("Đặt đơn dày bất thường (1 giờ gần nhất)")}</div>
            {rapidUsers.length === 0 ? <Empty text={L("Không có khách nào đặt dày bất thường")} /> : (
              <table className="w-full"><tbody className="divide-y divide-slate-100">
                {rapidUsers.map((r) => (
                  <tr key={r.userId}><td className="td"><Link href={`/admin/nguoi-dung/${r.userId}`} className="font-medium text-brand-700">{r.username}</Link></td><td className="td text-right font-bold text-orange-600">{num(r.count)}{L(" đơn/giờ")}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">{L("Bị hoàn tiền nhiều (24 giờ gần nhất)")}</div>
            {refundHeavy.length === 0 ? <Empty text={L("Không có khách nào bị hoàn nhiều bất thường")} /> : (
              <table className="w-full"><tbody className="divide-y divide-slate-100">
                {refundHeavy.map((r) => (
                  <tr key={r.userId}><td className="td"><Link href={`/admin/nguoi-dung/${r.userId}`} className="font-medium text-brand-700">{r.username}</Link></td><td className="td text-right font-bold text-rose-600">{num(r.count)}{L(" đơn bị hoàn")}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
        </div>
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">{L("Thông tin nhận hàng được nhiều tài khoản cùng dùng (24 giờ)")}</div>
            {sharedBuyers.length === 0 ? <Empty text={L("Không có thông tin nhận nào dùng chung bất thường")} /> : (
              <table className="w-full"><tbody className="divide-y divide-slate-100">
                {sharedBuyers.map((r) => (
                  <tr key={r.buyer}><td className="td"><div className="max-w-[300px] truncate font-mono text-xs">{r.buyer}</div></td><td className="td text-right"><b>{num(r.users)}</b> {L("tài khoản · ")}{num(r.orders)}{L(" đơn")}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">{L("Nạp lớn đang chờ duyệt (từ 5.000.000đ)")}</div>
            {bigDeposits.length === 0 ? <Empty text={L("Không có lượt nạp lớn nào đang chờ")} /> : (
              <table className="w-full"><tbody className="divide-y divide-slate-100">
                {bigDeposits.map((d) => (
                  <tr key={d.id}><td className="td"><span className="font-medium">{d.user.username}</span><div className="text-xs text-slate-400">{d.code} · {dt(d.createdAt)}</div></td><td className="td text-right font-bold text-amber-600">{M(d.amount)}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
