import { prisma } from "./db";

/** Nguồn sự kiện cho thông báo realtime trong Admin: gom các bản ghi mới nhất
 *  từ đơn Premium / nạp tiền / ticket / khách mới.
 *  Client poll endpoint này mỗi vài giây; bản ghi mới hơn mốc đã xem sẽ bật toast. */

export type RtEvent = {
  id: string; // dạng "pre-123" — so sánh phần số theo từng kind để biết tin mới
  kind: "premium" | "deposit" | "ticket" | "user" | "risk";
  title: string;
  body: string;
  link: string;
  at: string;
};

export async function getRealtimeFeed() {
  const ow: any = {};
  const dw: any = {};
  const [pre, dep, tickets, users, counts] = await Promise.all([
    prisma.premiumOrder.findMany({ where: ow, orderBy: { id: "desc" }, take: 5, include: { user: { select: { username: true } }, variant: { include: { product: { select: { name: true } } } } } }),
    prisma.deposit.findMany({ where: dw, orderBy: { id: "desc" }, take: 5, include: { user: { select: { username: true } } } }),
    prisma.ticket.findMany({ where: { ...dw }, orderBy: { id: "desc" }, take: 5, include: { user: { select: { username: true } } } }),
    prisma.user.findMany({ orderBy: { id: "desc" }, take: 4, select: { id: true, username: true, createdAt: true } }),
    Promise.all([
      prisma.deposit.count({ where: { status: "PENDING", ...dw } }),
      prisma.premiumOrder.count({ where: { ...ow, status: "PENDING" } }),
      prisma.ticket.count({ where: { status: "OPEN", ...dw } }),
    ]),
  ]);
  const base = "/admin";
  const events: RtEvent[] = [];
  for (const o of pre) {
    events.push({
      id: `pre-${o.id}`, kind: "premium", title: `Đơn Premium mới ${o.code}`,
      body: `${o.user.username} · ${o.variant.product.name} — ${o.variant.name} · ${o.total.toLocaleString("vi-VN")}đ`,
      link: `${base}/don-premium`,
      at: o.createdAt.toISOString(),
    });
  }
  for (const d of dep) {
    events.push({
      id: `dep-${d.id}`, kind: "deposit",
      title: d.status === "PENDING" ? `Yêu cầu nạp chờ duyệt ${d.code}` : `Nạp tiền ${d.code}`,
      body: `${d.user.username} · ${d.method} · ${d.amount.toLocaleString("vi-VN")}đ · ${d.status}`,
      link: `${base}/nap-tien`,
      at: d.createdAt.toISOString(),
    });
  }
  for (const t of tickets) {
    events.push({
      id: `tick-${t.id}`, kind: "ticket", title: `Ticket #${t.id}`,
      body: `${t.user.username} · ${t.subject}`,
      link: `${base}/ticket/${t.id}`,
      at: t.createdAt.toISOString(),
    });
  }
  for (const u of users) {
    events.push({
      id: `user-${u.id}`, kind: "user", title: "Khách đăng ký mới",
      body: u.username,
      link: `${base}/nguoi-dung/${u.id}`,
      at: u.createdAt.toISOString(),
    });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  const [depPending, prePending, ticketOpen] = counts;
  return {
    counts: { depPending, prePending, ticketOpen, total: depPending + prePending + ticketOpen },
    events: events.slice(0, 12),
  };
}
