import Link from "next/link";
import { prisma } from "@/lib/db";
import { I, PageHead, Badge, Empty, Stat, Flash } from "@/components/ui";
import { PRE_STATUS, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { telegramOrderWhere, telegramRecipient } from "@/lib/tg";
import { adminListPageSize } from "@/lib/settings";

export const dynamic = "force-dynamic";


/** Đơn Telegram (khu riêng Admin → Telegram): thống kê + lọc + danh sách.
 *  Bản ghi vẫn là PremiumOrder với providerGroup telegram_* — trang này là
 *  góc nhìn quản lý riêng, không lẫn với đơn Premium thường. */
export default async function AdminTelegramOrdersPage({ searchParams }: {
  searchParams: { q?: string; type?: string; status?: string; from?: string; to?: string; page?: string; msg?: string; err?: string };
}) {
  const PAGE_SIZE = await adminListPageSize();
  const { L, M, Ld } = await getServerI18n();
  const base = telegramOrderWhere();
  const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
  const [todayCount, doneCount, starsAgg, revenueAgg] = await Promise.all([
    prisma.premiumOrder.count({ where: { ...base, createdAt: { gte: startDay } } }),
    prisma.premiumOrder.count({ where: { ...base, status: { in: ["DELIVERED", "COMPLETED"] } } }),
    prisma.premiumOrder.aggregate({ where: { ...base, variant: { providerGroup: "telegram_stars" }, status: { in: ["DELIVERED", "COMPLETED"] } }, _sum: { quantity: true } }),
    prisma.premiumOrder.aggregate({ where: { ...base, status: { notIn: ["CANCELED", "REFUNDED"] } }, _sum: { total: true } }),
  ]);
  const q = (searchParams.q || "").trim();
  const type = ["telegram_stars", "telegram_premium"].includes(searchParams.type || "") ? searchParams.type! : "";
  const status = ["PENDING", "DELIVERED", "COMPLETED", "WARRANTY", "CANCELED", "REFUNDED"].includes(searchParams.status || "") ? searchParams.status! : "";
  const fromD = searchParams.from ? new Date(`${searchParams.from}T00:00:00`) : null;
  const toD = searchParams.to ? new Date(`${searchParams.to}T23:59:59`) : null;
  const where: any = {
    ...base,
    ...(type ? { variant: { providerGroup: type } } : {}),
    ...(status ? { status } : {}),
    ...(fromD || toD ? { createdAt: { ...(fromD ? { gte: fromD } : {}), ...(toD ? { lte: toD } : {}) } } : {}),
    ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { buyerInfo: { contains: q, mode: "insensitive" } }, { user: { username: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const filtered = await prisma.premiumOrder.count({ where });
  const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(searchParams.page || "1") || 1));
  const orders = await prisma.premiumOrder.findMany({
    where, orderBy: { id: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    include: { variant: { select: { name: true, providerGroup: true } }, user: { select: { username: true } } },
  });
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { q, type, status, from: searchParams.from || "", to: searchParams.to || "", page: String(page) };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) p.set(k, String(v));
    return `/admin/telegram?${p.toString()}`;
  };

  return (
    <div>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <PageHead title={L("Đơn Telegram")} desc={L("Đơn Stars và Premium Telegram của toàn hệ thống.")} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat icon={I.send} label={L("Đơn hôm nay")} value={String(todayCount)} />
        <Stat icon={I.check} label={L("Đã hoàn thành")} value={String(doneCount)} />
        <Stat icon={I.star} label={L("Sao đã bán")} value={(starsAgg._sum.quantity || 0).toLocaleString("vi-VN")} />
        <Stat icon={I.money} label={L("Doanh thu")} value={M(revenueAgg._sum.total || 0)} />
      </div>
      <form method="get" className="card mt-5 grid grid-cols-2 gap-3 p-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]">
        <div><label className="lbl">{L("Tìm kiếm")}</label><input className="inp" name="q" defaultValue={q} placeholder={L("Mã đơn, khách, username, Telegram ID")} /></div>
        <div><label className="lbl">{L("Loại đơn")}</label>
          <select className="inp" name="type" defaultValue={type}>
            <option value="">{L("Tất cả")}</option><option value="telegram_stars">Stars</option><option value="telegram_premium">Premium</option>
          </select></div>
        <div><label className="lbl">{L("Trạng thái")}</label>
          <select className="inp" name="status" defaultValue={status}>
            <option value="">{L("Tất cả")}</option>
            {Object.entries(PRE_STATUS).map(([k, v]) => <option key={k} value={k}>{L(v.label)}</option>)}
          </select></div>
        <div><label className="lbl">{L("Từ ngày")}</label><input className="inp" type="date" name="from" defaultValue={searchParams.from || ""} /></div>
        <div><label className="lbl">{L("Đến ngày")}</label><input className="inp" type="date" name="to" defaultValue={searchParams.to || ""} /></div>
        <div className="flex items-end"><button className="btn-primary !py-2.5">{L("Lọc")}</button></div>
      </form>
      <div className="card mt-5 overflow-x-auto">
        {orders.length === 0 ? <Empty text={L("Chưa có đơn Telegram nào")} /> : (
          <table className="w-full min-w-[860px]">
            <thead><tr><th className="th">{L("Mã đơn")}</th><th className="th">{L("Khách")}</th><th className="th">{L("Loại")}</th><th className="th">{L("Người nhận")}</th><th className="th">{L("Số lượng / Gói")}</th><th className="th">{L("Tổng tiền")}</th><th className="th">{L("Trạng thái")}</th><th className="th">{L("Ngày tạo")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => {
                const r = telegramRecipient(o.buyerInfo);
                const isStars = o.variant.providerGroup === "telegram_stars";
                return (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="td"><Link href={`/admin/telegram/${o.id}`} className="font-mono text-xs font-bold text-brand-600">{o.code}</Link></td>
                    <td className="td font-medium">{o.user.username}</td>
                    <td className="td"><Badge cls={isStars ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}>{isStars ? "Stars" : "Premium"}</Badge></td>
                    <td className="td"><div className="font-medium text-slate-800">{r.username || "—"}</div><div className="text-xs text-slate-400">ID: {r.id || "—"}</div></td>
                    <td className="td">{isStars ? `${o.quantity.toLocaleString("vi-VN")} Stars` : o.variant.name}</td>
                    <td className="td font-bold text-slate-900">{M(o.total)}</td>
                    <td className="td"><Badge cls={PRE_STATUS[o.status]?.cls || "bg-slate-100 text-slate-600"}>{L(PRE_STATUS[o.status]?.label || o.status)}</Badge></td>
                    <td className="td whitespace-nowrap text-slate-500">{dt(o.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
