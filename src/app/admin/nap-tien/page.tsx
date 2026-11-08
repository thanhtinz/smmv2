import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { DepositTable, DeleteAllDeposits, type DepositRowDTO } from "@/components/deposit-table";
import { adminDepositAction, adminDeleteDepositsAction } from "@/app/actions/admin";
import { dt, relTime, DEP_METHOD } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUS_OPTS: [string, string][] = [["", "Tất cả"], ["PENDING", "Chờ xử lý"], ["APPROVED", "Đã hoàn thành"], ["REJECTED", "Đã từ chối"]];

export default async function AdminDeposits({ searchParams }: {
  searchParams: { msg?: string; err?: string; q?: string; status?: string; method?: string; from?: string; to?: string; sort?: string; dir?: string; page?: string };
}) {
  await requireAdminPage();
  const { L, Ld, M } = await getServerI18n(null);
  // Chỉ nạp của TÀI KHOẢN WEB MẸ — nạp của khách site con do chủ panel tự quản lý, mẹ không xem
  const scope = {};
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [totalSum, monthSum, pendingCount, todaySum] = await Promise.all([
    prisma.deposit.aggregate({ where: { ...scope, status: "APPROVED" }, _sum: { amount: true } }),
    prisma.deposit.aggregate({ where: { ...scope, status: "APPROVED", createdAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.deposit.count({ where: { ...scope, status: "PENDING" } }),
    prisma.deposit.aggregate({ where: { ...scope, status: "APPROVED", createdAt: { gte: todayStart } }, _sum: { amount: true } }),
  ]);

  const q = (searchParams.q || "").trim();
  const where: any = { ...scope };
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.method) where.method = searchParams.method;
  if (q) where.AND = [{ OR: [{ code: { contains: q.toUpperCase(), mode: "insensitive" } }, { user: { username: { contains: q, mode: "insensitive" } } }, { user: { email: { contains: q, mode: "insensitive" } } }] }];
  if (searchParams.from || searchParams.to) {
    where.createdAt = {};
    if (searchParams.from) where.createdAt.gte = new Date(searchParams.from);
    if (searchParams.to) where.createdAt.lte = new Date(`${searchParams.to}T23:59:59`);
  }
  const sort = searchParams.sort === "amount" ? "amount" : "time";
  const dir = searchParams.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(searchParams.page || "1") || 1);
  const [total, deposits] = await Promise.all([
    prisma.deposit.count({ where }),
    prisma.deposit.findMany({
      where,
      orderBy: sort === "amount" ? [{ amount: dir }, { id: dir }] : [{ createdAt: dir }, { id: dir }],
      skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      include: { user: { select: { username: true, email: true } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (searchParams.status) qs.set("status", searchParams.status);
    if (searchParams.method) qs.set("method", searchParams.method);
    if (searchParams.from) qs.set("from", searchParams.from);
    if (searchParams.to) qs.set("to", searchParams.to);
    if (searchParams.sort) qs.set("sort", searchParams.sort);
    if (searchParams.dir) qs.set("dir", searchParams.dir);
    qs.set("page", String(p));
    return `/admin/nap-tien?${qs.toString()}`;
  };
  const rows: DepositRowDTO[] = deposits.map((d) => ({
    id: d.id, code: d.code, username: d.user.username, email: d.user.email, method: d.method,
    amount: d.amount, bonus: d.bonus, content: d.content, auto: d.auto, status: d.status,
    timeLabel: dt(d.createdAt), relLabel: Ld(relTime(d.createdAt)),
    bolt: (d.externalId || "").startsWith("bolt:") ? (() => { let data: any = {}; try { data = d.providerData ? JSON.parse(d.providerData) : {}; } catch { /* ignore */ } return { orderId: d.providerRef || null, network: data.network || d.content || "TRON", txHash: data.paidTxHash || null, settlement: data.settlementType || null, status: data.boltStatus || d.status }; })() : null,
  }));

  return (
    <div>
      <PageHead title={L("Quản lý Nạp tiền")} desc={L("Phê duyệt và theo dõi các giao dịch tài chính trên hệ thống.")}>
        <DeleteAllDeposits action={adminDeleteDepositsAction} />
        <a href="/admin/nap-tien" className="btn-primary">{L("Cập nhật dữ liệu")}</a>
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label={L("Tổng nạp (Tất cả)")} value={M(totalSum._sum.amount || 0)} icon={I.wallet} />
        <Stat label={L("Nạp trong tháng")} value={M(monthSum._sum.amount || 0)} icon={I.money} tone="emerald" />
        <Stat label={L("Đang chờ xử lý")} value={String(pendingCount)} icon={I.clock} tone="amber" />
        <Stat label={L("Hôm nay")} value={M(todaySum._sum.amount || 0)} icon={I.chart} tone="violet" />
      </div>

      <form method="GET" action="/admin/nap-tien" className="card mb-6 space-y-4 p-5">
        <div className="font-bold text-slate-900">{L("Tìm kiếm giao dịch")}</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="lbl">{L("Tìm kiếm")}</label>
            <input className="inp" name="q" defaultValue={q} placeholder={L("Tên, Email hoặc Mã giao dịch...")} />
          </div>
          <div>
            <label className="lbl">{L("Trạng thái")}</label>
            <select className="inp" name="status" defaultValue={searchParams.status || ""}>
              {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{L(l)}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">{L("Phương thức")}</label>
            <select className="inp" name="method" defaultValue={searchParams.method || ""}>
              <option value="">{L("Tất cả")}</option>
              {Object.entries(DEP_METHOD).map(([v, l]) => <option key={v} value={v}>{L(l)}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">{L("Thời gian")}</label>
            <div className="flex items-center gap-2">
              <input className="inp min-w-0 flex-1" type="date" name="from" defaultValue={searchParams.from || ""} />
              <span className="shrink-0 text-slate-400 [&_svg]:h-4 [&_svg]:w-4">{I.arrowRight}</span>
              <input className="inp min-w-0 flex-1" type="date" name="to" defaultValue={searchParams.to || ""} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary !py-2.5">{L("Tìm kiếm")}</button>
          <a href="/admin/nap-tien" className="btn-ghost !py-2.5">{L("Làm mới")}</a>
        </div>
      </form>

      <div className="card overflow-hidden">
        <DepositTable rows={rows} depositAction={adminDepositAction} deleteAction={adminDeleteDepositsAction} sort={sort} dir={dir} basePath="/admin/nap-tien" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <span className="text-sm text-slate-500">{L("Tổng cộng")} {total} {L("giao dịch")}</span>
          <div className="flex items-center gap-1.5">
            {page > 1 ? <a className="btn-ghost btn-sm" href={pageHref(page - 1)}>{L("Trước")}</a> : <span className="btn-ghost btn-sm pointer-events-none opacity-40">{L("Trước")}</span>}
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <a key={p} href={pageHref(p)} className={p === page ? "btn-primary btn-sm !px-3" : "btn-ghost btn-sm !px-3"}>{p}</a>
            ))}
            {page < pages ? <a className="btn-ghost btn-sm" href={pageHref(page + 1)}>{L("Sau")}</a> : <span className="btn-ghost btn-sm pointer-events-none opacity-40">{L("Sau")}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
