import Link from "next/link";
import { prisma } from "@/lib/db";
import { Flash, Badge, Empty } from "@/components/ui";
import { PremiumOrderCards, type PremiumOrderCard } from "@/components/client";
import { vnd, num, SMM_STATUS, PRE_STATUS, dt } from "@/lib/format";

type SP = Record<string, string | string[] | undefined>;
const arr = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const one = (v: string | string[] | undefined): string => arr(v)[0] || "";

/* ================= ĐƠN SMM — bố cục kiểu thatim (ĐƠN HÀNG ĐÃ TẠO) ================= */
export async function SmmOrdersView({ userId, sp }: { userId: number; sp: SP }) {
  const ALL = Object.keys(SMM_STATUS);
  const filtering = one(sp.f) === "1";
  const selected = filtering ? arr(sp.st).filter((s) => ALL.includes(s)) : ALL;
  const size = [10, 20, 30, 50, 100].includes(parseInt(one(sp.size))) ? parseInt(one(sp.size)) : 20;
  const page = Math.max(1, parseInt(one(sp.page) || "1"));
  const sortOld = one(sp.sort) === "old";
  const q = one(sp.q).trim();
  const codes = q.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

  const where: any = { userId, status: { in: selected } };
  if (codes.length === 1) where.code = { contains: codes[0] };
  else if (codes.length > 1) where.code = { in: codes };
  const from = one(sp.from), to = one(sp.to);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(`${from}T00:00:00`);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59`);
  }
  const [total, orders] = await Promise.all([
    prisma.smmOrder.count({ where }),
    prisma.smmOrder.findMany({ where, orderBy: { id: sortOld ? "asc" : "desc" }, skip: (page - 1) * size, take: size, include: { service: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const u = new URLSearchParams();
    u.set("f", "1");
    selected.forEach((s) => u.append("st", s));
    if (q) u.set("q", q);
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    u.set("size", String(size));
    if (sortOld) u.set("sort", "old");
    if (p > 1) u.set("page", String(p));
    return `?${u.toString()}`;
  };
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-black tracking-tight text-slate-900 uppercase">Đơn hàng đã tạo</h1>
        <p className="text-sm text-slate-500 mt-0.5">Theo dõi chi tiết lịch sử đơn hàng đã tạo</p>
      </div>
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <form className="card p-4 mb-5 space-y-3">
        <input type="hidden" name="f" value="1" />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 mr-1">Chọn trạng thái</span>
          {ALL.map((k) => (
            <label key={k} className="cursor-pointer">
              <input type="checkbox" name="st" value={k} defaultChecked={selected.includes(k)} className="peer sr-only" />
              <span className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition peer-checked:bg-slate-900 peer-checked:text-white peer-checked:border-slate-900">{SMM_STATUS[k].label}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Hiển thị
            <select className="inp !w-28 !py-2" name="size" defaultValue={String(size)}>
              {[10, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n} mục</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Sắp xếp
            <select className="inp !w-32 !py-2" name="sort" defaultValue={sortOld ? "old" : "new"}>
              <option value="new">Mới nhất</option>
              <option value="old">Cũ nhất</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Ngày bắt đầu
            <input className="inp !w-40 !py-2" type="date" name="from" defaultValue={from} />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Ngày kết thúc
            <input className="inp !w-40 !py-2" type="date" name="to" defaultValue={to} />
          </label>
          <input className="inp flex-1 min-w-[200px] !py-2" name="q" placeholder="Mã đơn 1, Mã đơn 2,..." defaultValue={q} />
          <button className="btn-dark !py-2">Tìm kiếm</button>
        </div>
      </form>
      {orders.length === 0 ? <Empty text="Không có đơn hàng nào" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Thông tin</th><th className="th">Chi tiết</th><th className="th">Cấu hình</th><th className="th">Thời gian</th><th className="th">Thao tác</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => {
                const drip = (() => { try { const p = JSON.parse(o.params || "{}"); return p.dripfeed as { runs: number; interval: number } | undefined; } catch { return undefined; } })();
                return (
                  <tr key={o.id} className="hover:bg-slate-50/60 align-top">
                    <td className="td">
                      <Link href={`/dashboard/don-hang/${o.id}`} className="font-mono text-xs font-bold text-brand-700">{o.code}</Link>
                      <div className="mt-1.5"><Badge cls={SMM_STATUS[o.status].cls}>{SMM_STATUS[o.status].label}</Badge></div>
                      {o.viaApi && <div className="text-[11px] text-slate-400 mt-1">qua API</div>}
                    </td>
                    <td className="td">
                      <div className="font-medium max-w-[280px] truncate">{o.service.name}</div>
                      <div className="text-xs text-slate-400 max-w-[280px] truncate">{o.link}</div>
                      <div className="text-xs text-slate-500 mt-1">Số lượng {num(o.quantity)} · Bắt đầu {o.startCount !== null ? num(o.startCount) : "—"} · Còn lại {o.remains !== null ? num(o.remains) : "—"}</div>
                    </td>
                    <td className="td">
                      <div className="font-bold">{vnd(o.charge)}</div>
                      <div className="text-xs text-slate-400">Đơn giá {vnd(o.service.rate)}/1000</div>
                      {o.refundedAmount > 0 && <div className="text-xs text-emerald-600">đã hoàn {vnd(o.refundedAmount)}</div>}
                      {drip && <div className="text-xs text-slate-500">Drip-feed: {drip.runs} lượt × {drip.interval} phút</div>}
                    </td>
                    <td className="td text-xs text-slate-500 whitespace-nowrap">{dt(o.createdAt)}<div className="text-slate-400 mt-0.5">Cập nhật {dt(o.updatedAt)}</div></td>
                    <td className="td"><Link href={`/dashboard/don-hang/${o.id}`} className="btn-dark btn-sm">Chi tiết</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-5">
          <Link href={href(page - 1)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${page <= 1 ? "pointer-events-none opacity-40 bg-white border border-slate-200" : "bg-white border border-slate-200"}`}>‹</Link>
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={href(p)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${p === page ? "bg-slate-900 text-white" : "bg-white border border-slate-200"}`}>{p}</Link>
          ))}
          <Link href={href(page + 1)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${page >= pages ? "pointer-events-none opacity-40 bg-white border border-slate-200" : "bg-white border border-slate-200"}`}>›</Link>
          <span className="text-xs text-slate-400 ml-2">{num(total)} đơn</span>
        </div>
      )}
    </div>
  );
}

/* ================= ĐƠN PREMIUM — bố cục kiểu thatim (SẢN PHẨM ĐÃ MUA) ================= */
const PRE_TABS: { key: string; label: string; statuses: string[] | null }[] = [
  { key: "all", label: "Tất cả", statuses: null },
  { key: "pending", label: "Chờ xử lý", statuses: ["PENDING"] },
  { key: "delivered", label: "Đã giao", statuses: ["DELIVERED", "COMPLETED", "WARRANTY"] },
  { key: "canceled", label: "Đã hủy", statuses: ["CANCELED", "REFUNDED"] },
];

export async function PremiumOrdersView({ userId, sp, base }: { userId: number; sp: SP; base: string }) {
  const tab = PRE_TABS.find((t) => t.key === one(sp.tab)) || PRE_TABS[0];
  const where: any = { userId };
  if (tab.statuses) where.status = { in: tab.statuses };
  const orders = await prisma.premiumOrder.findMany({
    where,
    orderBy: { id: "desc" },
    take: 50,
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
    statusLabel: PRE_STATUS[o.status].label,
    statusCls: PRE_STATUS[o.status].cls,
    created: o.createdAt.toISOString(),
    updated: o.updatedAt.toISOString(),
    delivery: o.deliveryData || "",
    buyerInfo: o.buyerInfo || "",
    warrantyUntil: o.warrantyUntil ? o.warrantyUntil.toISOString() : null,
  }));
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-black tracking-tight text-slate-900 uppercase">Sản phẩm đã mua</h1>
        <p className="text-sm text-slate-500 mt-0.5">Danh sách sản phẩm đã mua của bạn</p>
      </div>
      <Flash msg={one(sp.msg)} err={one(sp.err)} />
      <div className="flex flex-wrap gap-2 mb-5">
        {PRE_TABS.map((t) => (
          <Link key={t.key} href={t.key === "all" ? base : `${base}?tab=${t.key}`} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${t.key === tab.key ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"}`}>{t.label}</Link>
        ))}
      </div>
      {cards.length === 0 ? <Empty text="Chưa có sản phẩm nào" /> : <PremiumOrderCards orders={cards} />}
    </div>
  );
}
