import { prisma } from "./db";

/** Thống kê dùng chung cho trang Phân tích + Báo cáo — chỉ mảng Premium
 *  (phần SMM đã gỡ, lệnh Tín 2026-11-12). Lợi nhuận = doanh thu − vốn. */

export type Scope = Record<string, never>;

export type PeriodStat = { revenue: number; profit: number; orders: number; deposits: number; newUsers: number };
export type BestPremium = { name: string; orders: number; quantity: number; revenue: number };
export type TopUser = { id: number; username: string; level: string; spend: number; orders: number; deposited: number };
export type StatsBundle = {
  scopeName: string;
  today: PeriodStat;
  last7: PeriodStat;
  last30: PeriodStat;
  month: PeriodStat;
  bestPremium: BestPremium[];
  topUsers: TopUser[];
  pending: { premium: number; deposits: number; tickets: number };
};

const PRE_OK = { notIn: ["REFUNDED", "CANCELED"] } as any;

async function period(scope: Scope, from: Date): Promise<PeriodStat> {
  const pw: any = { createdAt: { gte: from }, status: PRE_OK };
  const dw: any = { status: "APPROVED", createdAt: { gte: from } };
  const uw: any = { createdAt: { gte: from } };
  const [pre, dep, nu] = await Promise.all([
    prisma.premiumOrder.aggregate({ where: pw, _sum: { total: true, cost: true, commission: true }, _count: true }),
    prisma.deposit.aggregate({ where: dw, _sum: { amount: true } }),
    prisma.user.count({ where: uw }),
  ]);
  const revenue = pre._sum.total || 0;
  const profit = (pre._sum.total || 0) - (pre._sum.cost || 0);
  return { revenue, profit, orders: pre._count || 0, deposits: dep._sum.amount || 0, newUsers: nu };
}

export async function getStats(scope: Scope): Promise<StatsBundle> {
  const now = new Date();
  const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);
  const start7 = new Date(now.getTime() - 6 * 86400000); start7.setHours(0, 0, 0, 0);
  const start30 = new Date(now.getTime() - 29 * 86400000); start30.setHours(0, 0, 0, 0);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const pw30: any = { createdAt: { gte: start30 }, status: PRE_OK };

  const [today, last7, last30, month, preGroup, preUsers] = await Promise.all([
    period(scope, startDay),
    period(scope, start7),
    period(scope, start30),
    period(scope, startMonth),
    prisma.premiumOrder.groupBy({ by: ["variantId"], where: pw30, _count: true, _sum: { total: true, quantity: true }, orderBy: { _count: { variantId: "desc" } }, take: 8 }),
    prisma.premiumOrder.groupBy({ by: ["userId"], where: { status: PRE_OK }, _sum: { total: true }, _count: true }),
  ]);

  const varRows = preGroup.length
    ? await prisma.premiumVariant.findMany({ where: { id: { in: preGroup.map((g) => g.variantId) } }, select: { id: true, name: true, product: { select: { name: true } } } })
    : [];
  const varName = new Map(varRows.map((v) => [v.id, `${v.product.name} — ${v.name}`]));
  const bestPremium: BestPremium[] = preGroup.map((g) => ({
    name: varName.get(g.variantId) || `Gói #${g.variantId}`,
    orders: g._count,
    quantity: g._sum.quantity || 0,
    revenue: g._sum.total || 0,
  }));

  const spend = new Map<number, { spend: number; orders: number }>();
  for (const g of preUsers) {
    const cur = spend.get(g.userId) || { spend: 0, orders: 0 };
    cur.spend += g._sum.total || 0;
    cur.orders += g._count;
    spend.set(g.userId, cur);
  }
  const topIds = Array.from(spend.entries()).sort((a, b) => b[1].spend - a[1].spend).slice(0, 8);
  const userRows = topIds.length
    ? await prisma.user.findMany({ where: { id: { in: topIds.map(([id]) => id) } }, select: { id: true, username: true, level: true, totalDeposited: true } })
    : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const topUsers: TopUser[] = topIds.map(([id, v]) => ({
    id,
    username: userMap.get(id)?.username || `#${id}`,
    level: userMap.get(id)?.level || "MEMBER",
    spend: v.spend,
    orders: v.orders,
    deposited: userMap.get(id)?.totalDeposited || 0,
  }));

  const pendW: any = {};
  const [premiumP, depositsP, ticketsO] = await Promise.all([
    prisma.premiumOrder.count({ where: { ...pendW, status: "PENDING" } }),
    prisma.deposit.count({ where: { status: "PENDING" } }),
    prisma.ticket.count({ where: { status: "OPEN" } }),
  ]);

  const scopeName = "Toàn hệ thống";
  return {
    scopeName,
    today, last7, last30, month,
    bestPremium, topUsers,
    pending: { premium: premiumP, deposits: depositsP, tickets: ticketsO },
  };
}
