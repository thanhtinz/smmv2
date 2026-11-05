import { prisma } from "./db";
import { Scope } from "./stats";

/** Nguồn sự kiện cho thông báo realtime trong Admin: gom các bản ghi mới nhất
 *  từ đơn SMM / đơn Premium / nạp tiền / ticket / khách mới / đơn rủi ro.
 *  Client poll endpoint này mỗi vài giây; bản ghi mới hơn mốc đã xem sẽ bật toast. */

export type RtEvent = {
  id: string; // dạng "smm-123" — so sánh phần số theo từng kind để biết tin mới
  kind: "smm" | "premium" | "deposit" | "ticket" | "user" | "risk";
  title: string;
  body: string;
  link: string;
  at: string;
};

export async function getRealtimeFeed(scope: Scope & { panelAdmin?: boolean }) {
  const pid = scope.panelId;
  const ow: any = pid ? { panelId: pid } : {};
  // Web mẹ chỉ thấy nạp/ticket/khách của CHÍNH MẸ — account site con là riêng, mẹ không xem
  const dw: any = { user: { panelId: pid ?? null } };
  const [smm, pre, dep, tickets, users, counts] = await Promise.all([
    prisma.smmOrder.findMany({ where: ow, orderBy: { id: "desc" }, take: 6, include: { user: { select: { username: true } }, service: { select: { name: true } } } }),
    prisma.premiumOrder.findMany({ where: ow, orderBy: { id: "desc" }, take: 5, include: { user: { select: { username: true } }, variant: { include: { product: { select: { name: true } } } } } }),
    prisma.deposit.findMany({ where: dw, orderBy: { id: "desc" }, take: 5, include: { user: { select: { username: true } } } }),
    prisma.ticket.findMany({ where: { ...dw }, orderBy: { id: "desc" }, take: 5, include: { user: { select: { username: true } } } }),
    prisma.user.findMany({ where: { panelId: pid ?? null }, orderBy: { id: "desc" }, take: 4, select: { id: true, username: true, createdAt: true } }),
    Promise.all([
      prisma.deposit.count({ where: { status: "PENDING", ...dw } }),
      prisma.smmOrder.count({ where: { ...ow, fulfillment: "MANUAL", status: { in: ["PENDING", "PROCESSING"] } } }),
      prisma.premiumOrder.count({ where: { ...ow, status: "PENDING" } }),
      prisma.ticket.count({ where: { status: "OPEN", ...dw } }),
    ]),
  ]);
  const base = scope.panelAdmin ? "/panel-admin" : "/admin";
  const events: RtEvent[] = [];
  for (const o of smm) {
    events.push({
      id: `smm-${o.id}`, kind: o.flagNote ? "risk" : "smm",
      title: o.flagNote ? `Đơn rủi ro ${o.code}` : `Đơn SMM mới ${o.code}`,
      body: o.flagNote ? o.flagNote : `${o.user.username} · ${o.service.name} · ${o.charge.toLocaleString("vi-VN")}đ`,
      link: scope.panelAdmin ? `${base}/don-hang` : `${base}/don-smm/${o.id}`,
      at: o.createdAt.toISOString(),
    });
  }
  for (const o of pre) {
    events.push({
      id: `pre-${o.id}`, kind: "premium", title: `Đơn Premium mới ${o.code}`,
      body: `${o.user.username} · ${o.variant.product.name} — ${o.variant.name} · ${o.total.toLocaleString("vi-VN")}đ`,
      link: scope.panelAdmin ? `${base}/don-hang` : `${base}/don-premium`,
      at: o.createdAt.toISOString(),
    });
  }
  for (const d of dep) {
    events.push({
      id: `dep-${d.id}`, kind: "deposit",
      title: d.status === "PENDING" ? `Yêu cầu nạp chờ duyệt ${d.code}` : `Nạp tiền ${d.code}`,
      body: `${d.user.username} · ${d.method} · ${d.amount.toLocaleString("vi-VN")}đ · ${d.status}`,
      link: scope.panelAdmin ? `${base}/nap-tien` : `${base}/nap-tien`,
      at: d.createdAt.toISOString(),
    });
  }
  for (const t of tickets) {
    events.push({
      id: `tick-${t.id}`, kind: "ticket", title: `Ticket #${t.id}`,
      body: `${t.user.username} · ${t.subject}`,
      link: scope.panelAdmin ? `${base}/ho-tro` : `${base}/ticket/${t.id}`,
      at: t.createdAt.toISOString(),
    });
  }
  for (const u of users) {
    events.push({
      id: `user-${u.id}`, kind: "user", title: "Khách đăng ký mới",
      body: u.username,
      link: scope.panelAdmin ? `${base}/khach-hang` : `${base}/nguoi-dung/${u.id}`,
      at: u.createdAt.toISOString(),
    });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  const [depPending, smmManual, prePending, ticketOpen] = counts;
  return {
    counts: { depPending, smmManual, prePending, ticketOpen, total: depPending + smmManual + prePending + ticketOpen },
    events: events.slice(0, 12),
  };
}
