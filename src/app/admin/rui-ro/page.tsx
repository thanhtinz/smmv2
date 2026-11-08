import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Badge, Empty, Stat, I } from "@/components/ui";
import { num, dt, SMM_STATUS } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminRisk() {
  await requireAdminPage();
  const { L, Ld, M } = await getServerI18n(null);
  const hourAgo = new Date(Date.now() - 3600_000);
  const dayAgo = new Date(Date.now() - 86400_000);

  const [flagged, rapidUsers, sharedLinks, bigDeposits, refundHeavy] = await Promise.all([
    prisma.smmOrder.findMany({ where: { flagNote: { not: null } }, orderBy: { id: "desc" }, take: 30, include: { user: true, service: true } }),
    prisma.smmOrder.groupBy({ by: ["userId"], where: { createdAt: { gte: hourAgo } }, _count: true, orderBy: { _count: { id: "desc" } }, take: 10 }).then(async (rows) => {
      const ids = rows.filter((r) => r._count >= 5).map((r) => r.userId);
      const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
      const name = new Map(users.map((u) => [u.id, u.username]));
      return rows.filter((r) => r._count >= 5).map((r) => ({ userId: r.userId, username: name.get(r.userId) || `#${r.userId}`, count: r._count }));
    }),
    prisma.smmOrder.groupBy({ by: ["link"], where: { createdAt: { gte: dayAgo } }, _count: true, orderBy: { _count: { id: "desc" } }, take: 30 }).then(async (rows) => {
      const out: { link: string; users: number; orders: number }[] = [];
      for (const r of rows.slice(0, 10)) {
        const distinct = await prisma.smmOrder.groupBy({ by: ["userId"], where: { link: r.link, createdAt: { gte: dayAgo } } });
        if (distinct.length >= 3) out.push({ link: r.link, users: distinct.length, orders: r._count });
      }
      return out;
    }),
    prisma.deposit.findMany({ where: { status: "PENDING", amount: { gte: 5000000 } }, orderBy: { id: "desc" }, take: 10, include: { user: true } }),
    prisma.smmOrder.groupBy({ by: ["userId"], where: { status: "REFUNDED", createdAt: { gte: dayAgo } }, _count: true, orderBy: { _count: { id: "desc" } }, take: 10 }).then(async (rows) => {
      const ids = rows.filter((r) => r._count >= 3).map((r) => r.userId);
      const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } });
      const name = new Map(users.map((u) => [u.id, u.username]));
      return rows.filter((r) => r._count >= 3).map((r) => ({ userId: r.userId, username: name.get(r.userId) || `#${r.userId}`, count: r._count }));
    }),
  ]);

  return (
    <div>
      <PageHead title={L("Phát hiện rủi ro")} desc={L("Các dấu hiệu bất thường hệ thống tự quét: đơn bị gắn cờ, đặt đơn dày bất thường, link dùng chung nhiều tài khoản, nạp lớn chờ duyệt, hoàn tiền dày.")} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={L("Đơn đang có cờ rủi ro")} value={num(flagged.length)} icon={I.shield} tone="rose" />
        <Stat label={L("Khách đặt ≥5 đơn / giờ")} value={num(rapidUsers.length)} icon={I.clock} tone="orange" />
        <Stat label={L("Link dùng chung ≥3 tài khoản")} value={num(sharedLinks.length)} icon={I.list} tone="amber" />
        <Stat label={L("Khách bị hoàn ≥3 đơn / ngày")} value={num(refundHeavy.length)} icon={I.money} tone="violet" />
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">{L("Đơn hàng bị gắn cờ (trùng đơn / lặp link / số lượng lớn)")}</div>
        {flagged.length === 0 ? <Empty text={L("Không có đơn nào bị gắn cờ")} /> : (
          <table className="w-full min-w-[760px]">
            <thead><tr><th className="th">{L("Mã đơn")}</th><th className="th">{L("Khách")}</th><th className="th">{L("Dịch vụ")}</th><th className="th">{L("Cờ rủi ro")}</th><th className="th">{L("Trạng thái")}</th><th className="th">{L("Thời gian")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {flagged.map((o) => (
                <tr key={o.id}>
                  <td className="td"><Link href={`/admin/don-smm/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link></td>
                  <td className="td"><Link href={`/admin/nguoi-dung/${o.userId}`} className="font-medium text-brand-700">{o.user.username}</Link></td>
                  <td className="td"><div className="max-w-[220px] truncate">{o.service.name}</div></td>
                  <td className="td"><span className="text-amber-700">{o.flagNote}</span></td>
                  <td className="td"><Badge cls={SMM_STATUS[o.status].cls}>{L(SMM_STATUS[o.status].label)}</Badge></td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
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
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">{L("Link được nhiều tài khoản cùng đặt (24 giờ)")}</div>
            {sharedLinks.length === 0 ? <Empty text={L("Không có link nào dùng chung bất thường")} /> : (
              <table className="w-full"><tbody className="divide-y divide-slate-100">
                {sharedLinks.map((r) => (
                  <tr key={r.link}><td className="td"><div className="max-w-[300px] truncate font-mono text-xs">{r.link}</div></td><td className="td text-right"><b>{num(r.users)}</b> {L("tài khoản · ")}{num(r.orders)}{L(" đơn")}</td></tr>
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
