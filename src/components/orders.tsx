import Link from "next/link";
import { prisma } from "@/lib/db";
import { Flash, Badge, Empty, I, Stat } from "@/components/ui";
import { PremiumOrderCards, type PremiumOrderCard } from "@/components/client";
import { num, PRE_STATUS, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { resolveDeliveryType } from "@/lib/variant-stock";
import { regularPremiumWhere } from "@/lib/order-scope";
import { historyPageSize } from "@/lib/settings";

type SP = Record<string, string | string[] | undefined>;
const arr = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const one = (v: string | string[] | undefined): string => arr(v)[0] || "";

/* ================= ĐƠN PREMIUM — khung giống hệt trang lịch sử Telegram ================= */
export async function PremiumOrdersView({ userId, sp, base }: { userId: number; sp: SP; base: string }) {
  const { L, M } = await getServerI18n();
  // Khung trang GIỐNG HỆT trang lịch sử Telegram (fix7 task B): thẻ header
  // gradient → 4 thẻ thống kê → thẻ lọc (tìm kiếm / trạng thái / khoảng ngày)
  // → thẻ đơn + phân trang phía server. Cơ chế tab tải-sẵn-50-đơn cũ được
  // thay bằng bộ lọc này; tham số ?tab= cũ vẫn được dịch sang trạng thái
  // tương đương để các liên kết cũ không gãy. Bấm Chi tiết vẫn mở modal tại
  // chỗ qua PremiumOrderCards như trước.
  const PAGE_SIZE = await historyPageSize();
  // Tách khu (lệnh chủ site): trang này CHỈ chứa đơn Premium thường — đơn
  // Telegram/Steam (variant thuộc nhóm riêng) nằm ở trang lịch sử riêng của
  // từng khu. Cả 4 thẻ thống kê + danh sách + đếm phân trang dùng CHUNG một
  // điều kiện regularPremiumWhere để không lệch nhau.
  const [statTotal, statDelivered, statPending, spentAgg] = await Promise.all([
    prisma.premiumOrder.count({ where: regularPremiumWhere(userId) }),
    prisma.premiumOrder.count({ where: { ...regularPremiumWhere(userId), status: { in: ["DELIVERED", "COMPLETED"] } } }),
    prisma.premiumOrder.count({ where: { ...regularPremiumWhere(userId), status: "PENDING" } }),
    prisma.premiumOrder.aggregate({ where: { ...regularPremiumWhere(userId), status: { notIn: ["CANCELED", "REFUNDED"] } }, _sum: { total: true } }),
  ]);
  const q = one(sp.q).trim();
  const tabStatus = ({ pending: "PENDING", delivered: "DELIVERED", canceled: "CANCELED" } as Record<string, string>)[one(sp.tab)] || "";
  const status = Object.keys(PRE_STATUS).includes(one(sp.status)) ? one(sp.status) : tabStatus;
  const fromD = one(sp.from) ? new Date(`${one(sp.from)}T00:00:00`) : null;
  const toD = one(sp.to) ? new Date(`${one(sp.to)}T23:59:59`) : null;
  const where: any = {
    ...regularPremiumWhere(userId),
    ...(status ? { status } : {}),
    ...(fromD || toD ? { createdAt: { ...(fromD ? { gte: fromD } : {}), ...(toD ? { lte: toD } : {}) } } : {}),
    ...(q ? { OR: [
      { code: { contains: q, mode: "insensitive" } },
      { buyerInfo: { contains: q, mode: "insensitive" } },
      { variant: { product: { name: { contains: q, mode: "insensitive" } } } },
    ] } : {}),
  };
  const filtered = await prisma.premiumOrder.count({ where });
  const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(one(sp.page) || "1") || 1));
  const orders = await prisma.premiumOrder.findMany({
    where,
    orderBy: { id: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { variant: { include: { product: true } } },
  });
  const cards: PremiumOrderCard[] = orders.map((o) => ({
    id: o.id,
    code: o.code,
    name: o.variant.product.name,
    variant: o.variant.name,
    desc: (o.variant.product.description || "").split("\n")[0].slice(0, 140),
    total: o.total,
    quantity: o.quantity,
    status: o.status,
    statusLabel: L(PRE_STATUS[o.status].label),
    statusCls: PRE_STATUS[o.status].cls,
    created: o.createdAt.toISOString(),
    updated: o.updatedAt.toISOString(),
    delivery: o.deliveryData || "",
    deliveryType: resolveDeliveryType(o.variant.deliveryType, o.variant.product.fulfillment),
    buyerInfo: o.buyerInfo || "",
    warrantyUntil: o.warrantyUntil ? o.warrantyUntil.toISOString() : null,
  }));
  const hasFilter = !!(q || status || one(sp.from) || one(sp.to));
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { q, status, from: one(sp.from), to: one(sp.to), page: String(page) };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) p.set(k, String(v));
    return `${base}?${p.toString()}`;
  };
  return (
    <div>
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">{L("Sản phẩm đã mua")}</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Danh sách sản phẩm đã mua của bạn")}</p>
      </div>
      <div className="mt-5"><Flash msg={one(sp.msg)} err={one(sp.err)} /></div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat icon={I.list} label={L("Tổng số đơn")} value={String(statTotal)} />
        <Stat icon={I.check} label={L("Đã giao")} value={String(statDelivered)} />
        <Stat icon={I.clock} label={L("Chờ xử lý")} value={String(statPending)} />
        <Stat icon={I.money} label={L("Tổng đã chi")} value={M(spentAgg._sum.total || 0)} />
      </div>
      <form method="get" className="card mt-5 grid grid-cols-2 gap-3 p-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <div><label className="lbl">{L("Tìm kiếm")}</label><input className="inp" name="q" defaultValue={q} placeholder={L("Mã đơn, tên sản phẩm")} /></div>
        <div><label className="lbl">{L("Trạng thái")}</label>
          <select className="inp" name="status" defaultValue={status}>
            <option value="">{L("Tất cả")}</option>
            {Object.entries(PRE_STATUS).map(([k, v]) => <option key={k} value={k}>{L(v.label)}</option>)}
          </select></div>
        <div><label className="lbl">{L("Từ ngày")}</label><input className="inp" type="date" name="from" defaultValue={one(sp.from)} /></div>
        <div><label className="lbl">{L("Đến ngày")}</label><input className="inp" type="date" name="to" defaultValue={one(sp.to)} /></div>
        <div className="flex items-end gap-2">
          <button className="btn-primary !py-2.5">{L("Lọc")}</button>
          {hasFilter && <Link href={base} className="btn-ghost !py-2.5">{L("Xoá lọc")}</Link>}
        </div>
      </form>
      <div className="mt-5">
        {cards.length === 0 ? (
          <div className="card"><Empty text={hasFilter ? L("Không có đơn nào khớp bộ lọc") : L("Chưa có sản phẩm nào")} /></div>
        ) : (
          <PremiumOrderCards orders={cards} />
        )}
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">{L("Trang")} {page}/{pages} · {filtered} {L("đơn")}</span>
          <span className="flex gap-2">
            {page > 1 && <Link className="btn-ghost btn-sm" href={qs({ page: page - 1 })}>{L("Trang trước")}</Link>}
            {page < pages && <Link className="btn-ghost btn-sm" href={qs({ page: page + 1 })}>{L("Trang sau")}</Link>}
          </span>
        </div>
      )}
    </div>
  );
}
