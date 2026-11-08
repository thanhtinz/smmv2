import Link from "next/link";
import { prisma } from "@/lib/db";
import { Flash, Badge, Empty } from "@/components/ui";
import { PremiumOrderCards, type PremiumOrderCard } from "@/components/client";
import { PremiumOrderTabs } from "@/components/premium-order-tabs";
import { num, SMM_STATUS, PRE_STATUS, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { resolveDeliveryType } from "@/lib/variant-stock";

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
    <div className="mx-auto w-full max-w-[860px]">
      {/* Thẻ header kiểu Telegram như các trang đơn khác (fix6 task 3: trang này
          còn h1 + bảng cũ trong khi đặt đơn/chi tiết đã đổi ở fix5) */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-black leading-tight text-slate-900">{L("Đơn hàng đã tạo")}</h1>
            <p className="mt-1 text-sm text-slate-500">{L("Theo dõi chi tiết lịch sử đơn hàng đã tạo")}</p>
          </div>
          <div className="text-right">
            <div className="text-[22px] font-black leading-tight text-slate-900">{num(total)}</div>
            <div className="text-xs text-slate-500">{L("đơn")}</div>
          </div>
        </div>
      </div>
      <div className="mt-5"><Flash msg={one(sp.msg)} err={one(sp.err)} /></div>
      <form className="card p-4 mb-5 space-y-3">
        <input type="hidden" name="f" value="1" />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-500 mr-1">{L("Chọn trạng thái")}</span>
          <label className="cursor-pointer">
            <input type="radio" name="st" value="ALL" defaultChecked={activeTab === "ALL"} className="peer sr-only" />
            <span className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition peer-checked:bg-slate-900 peer-checked:text-white peer-checked:border-slate-900">{L("Tất cả")}</span>
          </label>
          {ALL.map((k) => (
            <label key={k} className="cursor-pointer">
              <input type="radio" name="st" value={k} defaultChecked={activeTab === k} className="peer sr-only" />
              <span className="inline-block rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition peer-checked:bg-slate-900 peer-checked:text-white peer-checked:border-slate-900">{L(SMM_STATUS[k].label)}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">{L("Hiển thị")}
            <select className="inp !w-28 !py-2" name="size" defaultValue={String(size)}>
              {[10, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n}{L(" mục")}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">{L("Sắp xếp")}
            <select className="inp !w-32 !py-2" name="sort" defaultValue={sortOld ? "old" : "new"}>
              <option value="new">{L("Mới nhất")}</option>
              <option value="old">{L("Cũ nhất")}</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">{L("Ngày bắt đầu")}
            <input className="inp !w-40 !py-2" type="date" name="from" defaultValue={from} />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">{L("Ngày kết thúc")}
            <input className="inp !w-40 !py-2" type="date" name="to" defaultValue={to} />
          </label>
          <input className="inp flex-1 min-w-[200px] !py-2" name="q" placeholder={L("Mã đơn 1, Mã đơn 2,...")} defaultValue={q} />
          <button className="btn-dark !py-2">{L("Tìm kiếm")}</button>
        </div>
      </form>
      {orders.length === 0 ? <Empty text={L("Không có đơn hàng nào")} /> : (
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
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-5">
          <Link href={href(page - 1)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${page <= 1 ? "pointer-events-none opacity-40 bg-white border border-slate-200" : "bg-white border border-slate-200"}`}>‹</Link>
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={href(p)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${p === page ? "bg-slate-900 text-white" : "bg-white border border-slate-200"}`}>{p}</Link>
          ))}
          <Link href={href(page + 1)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${page >= pages ? "pointer-events-none opacity-40 bg-white border border-slate-200" : "bg-white border border-slate-200"}`}>›</Link>
          <span className="text-xs text-slate-400 ml-2">{num(total)}{L(" đơn")}</span>
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
  const { L } = await getServerI18n();
  void base; // base không còn dùng cho tab (tab đã chuyển client-side tại chỗ)
  const initial = (PRE_TABS.find((t) => t.key === one(sp.tab)) || PRE_TABS[0]).key;
  // Tải sẵn cả 4 tab (mỗi tab tối đa 50 đơn như trước) để chuyển tab tại chỗ
  const tabs = await Promise.all(PRE_TABS.map(async (t) => {
    const where: any = { userId };
    if (t.statuses) where.status = { in: t.statuses };
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
      statusLabel: L(PRE_STATUS[o.status].label),
      statusCls: PRE_STATUS[o.status].cls,
      created: o.createdAt.toISOString(),
      updated: o.updatedAt.toISOString(),
      delivery: o.deliveryData || "",
      deliveryType: resolveDeliveryType(o.variant.deliveryType, o.variant.product.fulfillment),
      buyerInfo: o.buyerInfo || "",
      warrantyUntil: o.warrantyUntil ? o.warrantyUntil.toISOString() : null,
    }));
    return {
      key: t.key,
      label: L(t.label),
      content: cards.length === 0 ? <Empty text={L("Chưa có sản phẩm nào")} /> : <PremiumOrderCards orders={cards} />,
    };
  }));
  return (
    <div className="mx-auto w-full max-w-[860px]">
      {/* Thẻ header kiểu Telegram như các trang đơn khác (fix6 task 3) */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">{L("Sản phẩm đã mua")}</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Danh sách sản phẩm đã mua của bạn")}</p>
      </div>
      <div className="mt-5"><Flash msg={one(sp.msg)} err={one(sp.err)} /></div>
      <PremiumOrderTabs initial={initial} tabs={tabs} />
    </div>
  );
}
