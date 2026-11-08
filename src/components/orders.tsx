import Link from "next/link";
import { prisma } from "@/lib/db";
import { Flash, Badge, Empty, I, Stat } from "@/components/ui";
import { PremiumOrderCards, type PremiumOrderCard } from "@/components/client";
import { num, SMM_STATUS, PRE_STATUS, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { resolveDeliveryType } from "@/lib/variant-stock";
import { regularPremiumWhere } from "@/lib/order-scope";

type SP = Record<string, string | string[] | undefined>;
const arr = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const one = (v: string | string[] | undefined): string => arr(v)[0] || "";

/* ================= ĐƠN SMM — bố cục kiểu thatim (ĐƠN HÀNG ĐÃ TẠO) ================= */
export async function SmmOrdersView({ userId, sp }: { userId: number; sp: SP }) {
  const { L, Ld, M } = await getServerI18n();
  const ALL = Object.keys(SMM_STATUS);
  const filtering = one(sp.f) === "1";
  // Bộ chọn trạng thái là RADIO một lựa chọn: mặc định "Tất cả"; chọn 1 trạng thái
  // thì chỉ trạng thái đó active + lọc đúng (trước đây là checkbox mặc định tích hết
  // mọi trạng thái nên nhìn như "tự động chọn hết" — lỗi Tín báo 2026-11-07).
  const stParam = filtering ? one(sp.st) : "";
  const activeTab = stParam && stParam !== "ALL" && ALL.includes(stParam) ? stParam : "ALL";
  const selected = activeTab === "ALL" ? ALL : [activeTab];
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
  // 4 thẻ thống kê như trang lịch sử Telegram (fix7 task B): tổng hợp THẬT
  // trên toàn bộ đơn của khách (không theo bộ lọc hiện tại). "Tổng đã chi" =
  // tổng tiền trừ − tổng đã hoàn trên mọi đơn.
  const [statTotal, statDone, statRunning, spentAgg] = await Promise.all([
    prisma.smmOrder.count({ where: { userId } }),
    prisma.smmOrder.count({ where: { userId, status: "COMPLETED" } }),
    prisma.smmOrder.count({ where: { userId, status: { in: ["PENDING", "PROCESSING", "IN_PROGRESS", "PARTIAL"] } } }),
    prisma.smmOrder.aggregate({ where: { userId }, _sum: { charge: true, refundedAmount: true } }),
  ]);
  const spent = (spentAgg._sum.charge || 0) - (spentAgg._sum.refundedAmount || 0);
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const u = new URLSearchParams();
    u.set("f", "1");
    if (activeTab !== "ALL") u.set("st", activeTab);
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
      {/* Khung trang GIỐNG HỆT trang lịch sử Telegram (fix7 task B): thẻ
          header gradient → 4 thẻ thống kê → thẻ lọc dạng lưới nhãn → thẻ
          đơn. Bỏ cột max-w-860 riêng của trang này. */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">{L("Đơn hàng đã tạo")}</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Theo dõi chi tiết lịch sử đơn hàng đã tạo")}</p>
      </div>
      <div className="mt-5"><Flash msg={one(sp.msg)} err={one(sp.err)} /></div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat icon={I.list} label={L("Tổng số đơn")} value={num(statTotal)} />
        <Stat icon={I.check} label={L("Đã hoàn thành")} value={num(statDone)} />
        <Stat icon={I.clock} label={L("Đang xử lý")} value={num(statRunning)} />
        <Stat icon={I.money} label={L("Tổng đã chi")} value={M(spent)} />
      </div>
      <form method="get" className="card mt-5 grid grid-cols-2 gap-3 p-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_0.75fr_0.85fr_auto]">
        <input type="hidden" name="f" value="1" />
        <div><label className="lbl">{L("Tìm kiếm")}</label><input className="inp" name="q" placeholder={L("Mã đơn 1, Mã đơn 2,...")} defaultValue={q} /></div>
        <div><label className="lbl">{L("Trạng thái")}</label>
          <select className="inp" name="st" defaultValue={activeTab}>
            <option value="ALL">{L("Tất cả")}</option>
            {ALL.map((k) => <option key={k} value={k}>{L(SMM_STATUS[k].label)}</option>)}
          </select></div>
        <div><label className="lbl">{L("Từ ngày")}</label><input className="inp" type="date" name="from" defaultValue={from} /></div>
        <div><label className="lbl">{L("Đến ngày")}</label><input className="inp" type="date" name="to" defaultValue={to} /></div>
        <div><label className="lbl">{L("Hiển thị")}</label>
          <select className="inp" name="size" defaultValue={String(size)}>
            {[10, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n}{L(" mục")}</option>)}
          </select></div>
        <div><label className="lbl">{L("Sắp xếp")}</label>
          <select className="inp" name="sort" defaultValue={sortOld ? "old" : "new"}>
            <option value="new">{L("Mới nhất")}</option>
            <option value="old">{L("Cũ nhất")}</option>
          </select></div>
        <div className="flex items-end gap-2">
          <button className="btn-primary !py-2.5">{L("Lọc")}</button>
          {filtering && <Link href="/dashboard/don-hang" className="btn-ghost !py-2.5">{L("Xoá lọc")}</Link>}
        </div>
      </form>
      <div className="mt-5">
      {orders.length === 0 ? <div className="card"><Empty text={L("Không có đơn hàng nào")} /></div> : (
        <div className="space-y-3.5">
          {orders.map((o) => {
            const drip = (() => { try { const p = JSON.parse(o.params || "{}"); return p.dripfeed as { runs: number; interval: number } | undefined; } catch { return undefined; } })();
            return (
              <div key={o.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link href={`/dashboard/don-hang/${o.id}`} className="font-mono text-sm font-black text-slate-900">{o.code}</Link>
                    <Badge cls={SMM_STATUS[o.status].cls}>{L(SMM_STATUS[o.status].label)}</Badge>
                    {o.viaApi && <span className="text-[11px] font-semibold text-slate-400">{L("qua API")}</span>}
                  </div>
                  <div className="text-right">
                    <div className="font-black text-slate-900">{M(o.charge)}</div>
                    <div className="text-xs text-slate-400">{L("Đơn giá ")}{M(o.service.rate)}/1000</div>
                    {o.refundedAmount > 0 && <div className="text-xs font-semibold text-emerald-600">{L("đã hoàn ")}{M(o.refundedAmount)}</div>}
                  </div>
                </div>
                <div className="mt-3.5 border-t border-slate-100 pt-3.5">
                  <div className="font-bold break-words text-slate-900">{o.service.name}</div>
                  <div className="mt-0.5 break-all text-xs text-slate-400">{o.link}</div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>{L("Số lượng ")}{num(o.quantity)}{L(" · Bắt đầu ")}{o.startCount !== null ? num(o.startCount) : "—"}{L(" · Còn lại ")}{o.remains !== null ? num(o.remains) : "—"}</span>
                    {drip && <span>{L("Drip-feed: ")}{drip.runs}{L(" lượt × ")}{drip.interval}{L(" phút")}</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">{dt(o.createdAt)} · {L("Cập nhật ")}{dt(o.updatedAt)}</span>
                    <Link href={`/dashboard/don-hang/${o.id}`} className="btn-dark btn-sm">{L("Chi tiết")}</Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-5">
          <Link href={href(page - 1)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${page <= 1 ? "pointer-events-none opacity-40 bg-white border border-slate-200" : "bg-white border border-slate-200"}`}><span className="inline-flex rotate-90 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">{I.chevron}</span></Link>
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={href(p)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${p === page ? "bg-slate-900 text-white" : "bg-white border border-slate-200"}`}>{p}</Link>
          ))}
          <Link href={href(page + 1)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${page >= pages ? "pointer-events-none opacity-40 bg-white border border-slate-200" : "bg-white border border-slate-200"}`}><span className="inline-flex -rotate-90 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">{I.chevron}</span></Link>
          <span className="text-xs text-slate-400 ml-2">{num(total)}{L(" đơn")}</span>
        </div>
      )}
    </div>
  );
}

/* ================= ĐƠN PREMIUM — khung giống hệt trang lịch sử Telegram ================= */
export async function PremiumOrdersView({ userId, sp, base }: { userId: number; sp: SP; base: string }) {
  const { L, M } = await getServerI18n();
  // Khung trang GIỐNG HỆT trang lịch sử Telegram (fix7 task B): thẻ header
  // gradient → 4 thẻ thống kê → thẻ lọc (tìm kiếm / trạng thái / khoảng ngày)
  // → thẻ đơn + phân trang phía server. Cơ chế tab tải-sẵn-50-đơn cũ được
  // thay bằng bộ lọc này; tham số ?tab= cũ vẫn được dịch sang trạng thái
  // tương đương để các liên kết cũ không gãy. Bấm Chi tiết vẫn mở modal tại
  // chỗ qua PremiumOrderCards như trước.
  const PAGE_SIZE = 15;
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
