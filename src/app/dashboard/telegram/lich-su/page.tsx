import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { I, Flash, Badge, Empty, Stat } from "@/components/ui";
import { PRE_STATUS, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { telegramEnabled, telegramOrderWhere, telegramRecipient } from "@/lib/tg";
import { historyPageSize } from "@/lib/settings";

export const dynamic = "force-dynamic";


/** Lịch sử đơn Telegram của khách: thẻ thống kê + bộ lọc (tìm kiếm / loại /
 *  trạng thái / khoảng ngày) + bảng đơn, phân trang như các trang lịch sử khác. */
export default async function TelegramHistoryPage({ searchParams }: {
  searchParams: { q?: string; type?: string; status?: string; from?: string; to?: string; page?: string; msg?: string; err?: string };
}) {
  const PAGE_SIZE = await historyPageSize();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { L, Ld, M } = await getServerI18n();
  if (!(await telegramEnabled())) redirect("/");
  const base = telegramOrderWhere(user.id);
  const [totalOrders, doneAgg, starsAgg, spentAgg] = await Promise.all([
    prisma.premiumOrder.count({ where: base }),
    prisma.premiumOrder.count({ where: { ...base, status: { in: ["DELIVERED", "COMPLETED"] } } }),
    prisma.premiumOrder.aggregate({ where: { ...base, variant: { providerGroup: "telegram_stars" }, status: { in: ["DELIVERED", "COMPLETED"] } }, _sum: { quantity: true } }),
    prisma.premiumOrder.aggregate({ where: { ...base, status: { notIn: ["CANCELED", "REFUNDED"] } }, _sum: { total: true } }),
  ]);

  const q = (searchParams.q || "").trim();
  const type = ["telegram_stars", "telegram_premium"].includes(searchParams.type || "") ? searchParams.type! : "";
  const status = ["PENDING", "PARTIAL", "DELIVERED", "COMPLETED", "WARRANTY", "CANCELED", "REFUNDED"].includes(searchParams.status || "") ? searchParams.status! : "";
  const fromD = searchParams.from ? new Date(`${searchParams.from}T00:00:00`) : null;
  const toD = searchParams.to ? new Date(`${searchParams.to}T23:59:59`) : null;
  const where: any = {
    ...base,
    ...(type ? { variant: { providerGroup: type } } : {}),
    ...(status ? { status } : {}),
    ...(fromD || toD ? { createdAt: { ...(fromD ? { gte: fromD } : {}), ...(toD ? { lte: toD } : {}) } } : {}),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { buyerInfo: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const filtered = await prisma.premiumOrder.count({ where });
  const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(searchParams.page || "1") || 1));
  const orders = await prisma.premiumOrder.findMany({
    where, orderBy: { id: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    include: { variant: { select: { name: true, providerGroup: true } } },
  });
  const hasFilter = !!(q || type || status || searchParams.from || searchParams.to);
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { q, type, status, from: searchParams.from || "", to: searchParams.to || "", page: String(page) };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) p.set(k, String(v));
    return `/dashboard/telegram/lich-su?${p.toString()}`;
  };

  return (
    <div>
      {/* Thẻ header kiểu Telegram như các trang đơn khác (fix6 task 3) */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">{L("Lịch sử đơn Telegram")}</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Mọi đơn Stars và Premium bạn đã đặt.")}</p>
      </div>
      <div className="mt-5"><Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} /></div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat icon={I.list} label={L("Tổng số đơn")} value={String(totalOrders)} />
        <Stat icon={I.check} label={L("Đã hoàn thành")} value={String(doneAgg)} />
        <Stat icon={I.star} label={L("Sao đã mua")} value={(starsAgg._sum.quantity || 0).toLocaleString("vi-VN")} />
        <Stat icon={I.money} label={L("Tổng đã chi")} value={M(spentAgg._sum.total || 0)} />
      </div>

      <form method="get" className="card mt-5 grid grid-cols-2 gap-3 p-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]">
        <div><label className="lbl">{L("Tìm kiếm")}</label><input className="inp" name="q" defaultValue={q} placeholder={L("Mã đơn, username, Telegram ID")} /></div>
        <div><label className="lbl">{L("Loại đơn")}</label>
          <select className="inp" name="type" defaultValue={type}>
            <option value="">{L("Tất cả")}</option>
            <option value="telegram_stars">Stars</option>
            <option value="telegram_premium">Premium</option>
          </select></div>
        <div><label className="lbl">{L("Trạng thái")}</label>
          <select className="inp" name="status" defaultValue={status}>
            <option value="">{L("Tất cả")}</option>
            {Object.entries(PRE_STATUS).map(([k, v]) => <option key={k} value={k}>{L(v.label)}</option>)}
          </select></div>
        <div><label className="lbl">{L("Từ ngày")}</label><input className="inp" type="date" name="from" defaultValue={searchParams.from || ""} /></div>
        <div><label className="lbl">{L("Đến ngày")}</label><input className="inp" type="date" name="to" defaultValue={searchParams.to || ""} /></div>
        <div className="flex items-end gap-2">
          <button className="btn-primary !py-2.5">{L("Lọc")}</button>
          {hasFilter && <Link href="/dashboard/telegram/lich-su" className="btn-ghost !py-2.5">{L("Xoá lọc")}</Link>}
        </div>
      </form>

      <div className="mt-5">
        {orders.length === 0 ? (
          <div className="card"><Empty text={hasFilter ? L("Không có đơn nào khớp bộ lọc") : L("Chưa có đơn Telegram nào — đặt đơn đầu tiên ở mục Đặt đơn")} /></div>
        ) : (
          <div className="space-y-3.5">
            {orders.map((o) => {
              const r = telegramRecipient(o.buyerInfo);
              const isStars = o.variant.providerGroup === "telegram_stars";
              return (
                <div key={o.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-sm font-black text-slate-900">{o.code}</span>
                      <Badge cls={isStars ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-700"}>{isStars ? "Stars" : "Premium"}</Badge>
                      <Badge cls={PRE_STATUS[o.status]?.cls || "bg-slate-100 text-slate-600"}>{L(PRE_STATUS[o.status]?.label || o.status)}</Badge>
                    </div>
                    <div className="font-black text-slate-900">{M(o.total)}</div>
                  </div>
                  <div className="mt-3.5 border-t border-slate-100 pt-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-bold text-slate-900">{r.username || "—"}</span>
                      <span className="text-xs text-slate-400">ID: {r.id || "—"}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">{isStars ? `${o.quantity.toLocaleString("vi-VN")} Stars` : o.variant.name}</span>
                      <span className="text-xs text-slate-400">{dt(o.createdAt)}</span>
                    </div>
                    {o.deliveryData ? <details className="mt-2"><summary className="cursor-pointer text-xs font-bold text-brand-600">{L("Chi tiết giao")}</summary><div className="mt-1 break-all rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{o.deliveryData}</div></details> : null}
                  </div>
                </div>
              );
            })}
          </div>
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
