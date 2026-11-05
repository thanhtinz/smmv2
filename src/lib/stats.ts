import { prisma } from "./db";

/** Thống kê dùng chung cho trang Phân tích + Báo cáo (web mẹ và panel con).
 *  scope.panelId trống = toàn hệ thống; có panelId = chỉ dữ liệu của panel đó.
 *  Lợi nhuận: web mẹ = doanh thu − vốn; panel = hoa hồng nhận được. */

export type Scope = { panelId?: number };

export type PeriodStat = { revenue: number; profit: number; orders: number; deposits: number; newUsers: number };
export type BestSmm = { name: string; orders: number; quantity: number; revenue: number; profit: number };
export type BestPremium = { name: string; orders: number; quantity: number; revenue: number };
export type TopUser = { id: number; username: string; level: string; spend: number; orders: number; deposited: number };
export type StatsBundle = {
  scopeName: string;
  today: PeriodStat;
  last7: PeriodStat;
  last30: PeriodStat;
  month: PeriodStat;
  bestSmm: BestSmm[];
  bestPremium: BestPremium[];
  topUsers: TopUser[];
  pending: { smmManual: number; premium: number; deposits: number; tickets: number };
};

const SMM_OK = { notIn: ["REFUNDED"] } as any;
const PRE_OK = { notIn: ["REFUNDED", "CANCELED"] } as any;

async function period(scope: Scope, from: Date): Promise<PeriodStat> {
  const sw: any = { createdAt: { gte: from }, status: SMM_OK };
  const pw: any = { createdAt: { gte: from }, status: PRE_OK };
  const dw: any = { status: "APPROVED", createdAt: { gte: from } };
  const uw: any = { createdAt: { gte: from } };
  if (scope.panelId) {
    sw.panelId = scope.panelId;
    pw.panelId = scope.panelId;
    dw.user = { panelId: scope.panelId };
    uw.panelId = scope.panelId;
  } else {
    // Góc nhìn WEB MẸ: nạp tiền + khách mới chỉ tính TÀI KHOẢN CỦA MẸ — tài khoản của
    // site con là riêng, mẹ không xem số dư/account của site con (đơn hàng qua nguồn
    // của mẹ vẫn là doanh thu nguồn nên giữ nguyên).
    dw.user = { panelId: null };
    uw.panelId = null;
  }
  const [smm, pre, dep, nu] = await Promise.all([
    prisma.smmOrder.aggregate({ where: sw, _sum: { charge: true, cost: true, commission: true }, _count: true }),
    prisma.premiumOrder.aggregate({ where: pw, _sum: { total: true, cost: true, commission: true }, _count: true }),
    prisma.deposit.aggregate({ where: dw, _sum: { amount: true } }),
    prisma.user.count({ where: uw }),
  ]);
  const revenue = (smm._sum.charge || 0) + (pre._sum.total || 0);
  const profit = scope.panelId
    ? (smm._sum.commission || 0) + (pre._sum.commission || 0)
    : (smm._sum.charge || 0) - (smm._sum.cost || 0) + ((pre._sum.total || 0) - (pre._sum.cost || 0));
  return { revenue, profit, orders: (smm._count || 0) + (pre._count || 0), deposits: dep._sum.amount || 0, newUsers: nu };
}

export async function getStats(scope: Scope): Promise<StatsBundle> {
  const now = new Date();
  const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);
  const start7 = new Date(now.getTime() - 6 * 86400000); start7.setHours(0, 0, 0, 0);
  const start30 = new Date(now.getTime() - 29 * 86400000); start30.setHours(0, 0, 0, 0);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const sw30: any = { createdAt: { gte: start30 }, status: SMM_OK };
  const pw30: any = { createdAt: { gte: start30 }, status: PRE_OK };
  if (scope.panelId) { sw30.panelId = scope.panelId; pw30.panelId = scope.panelId; }

  const [today, last7, last30, month, smmGroup, preGroup, smmUsers, preUsers] = await Promise.all([
    period(scope, startDay),
    period(scope, start7),
    period(scope, start30),
    period(scope, startMonth),
    prisma.smmOrder.groupBy({ by: ["serviceId"], where: sw30, _count: true, _sum: { charge: true, cost: true, commission: true, quantity: true }, orderBy: { _count: { serviceId: "desc" } }, take: 8 }),
    prisma.premiumOrder.groupBy({ by: ["variantId"], where: pw30, _count: true, _sum: { total: true, quantity: true }, orderBy: { _count: { variantId: "desc" } }, take: 8 }),
    prisma.smmOrder.groupBy({ by: ["userId"], where: { status: SMM_OK, ...(scope.panelId ? { panelId: scope.panelId } : { user: { panelId: null } }) }, _sum: { charge: true }, _count: true }),
    prisma.premiumOrder.groupBy({ by: ["userId"], where: { status: PRE_OK, ...(scope.panelId ? { panelId: scope.panelId } : { user: { panelId: null } }) }, _sum: { total: true }, _count: true }),
  ]);

  const svcRows = smmGroup.length
    ? await prisma.smmService.findMany({ where: { id: { in: smmGroup.map((g) => g.serviceId) } }, select: { id: true, name: true } })
    : [];
  const svcName = new Map(svcRows.map((s) => [s.id, s.name]));
  const bestSmm: BestSmm[] = smmGroup.map((g) => ({
    name: svcName.get(g.serviceId) || `Dịch vụ #${g.serviceId}`,
    orders: g._count,
    quantity: g._sum.quantity || 0,
    revenue: g._sum.charge || 0,
    profit: scope.panelId ? g._sum.commission || 0 : (g._sum.charge || 0) - (g._sum.cost || 0),
  }));

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
  for (const g of smmUsers) spend.set(g.userId, { spend: g._sum.charge || 0, orders: g._count });
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

  const pendW: any = scope.panelId ? { panelId: scope.panelId } : {};
  const [smmManual, premiumP, depositsP, ticketsO] = await Promise.all([
    prisma.smmOrder.count({ where: { ...pendW, fulfillment: "MANUAL", status: { in: ["PENDING", "PROCESSING"] } } }),
    prisma.premiumOrder.count({ where: { ...pendW, status: "PENDING" } }),
    prisma.deposit.count({ where: { status: "PENDING", user: { panelId: scope.panelId ?? null } } }),
    prisma.ticket.count({ where: { status: "OPEN", user: { panelId: scope.panelId ?? null } } }),
  ]);

  let scopeName = "Toàn hệ thống";
  if (scope.panelId) {
    const p = await prisma.childPanel.findUnique({ where: { id: scope.panelId }, select: { name: true } });
    scopeName = p?.name || `Panel #${scope.panelId}`;
  }
  return {
    scopeName,
    today, last7, last30, month,
    bestSmm, bestPremium, topUsers,
    pending: { smmManual, premium: premiumP, deposits: depositsP, tickets: ticketsO },
  };
}
