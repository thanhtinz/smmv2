import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { DepositTable, DeleteAllDeposits, type DepositRowDTO } from "@/components/deposit-table";
import { panelDepositAction, panelManualDepositAction, panelDeleteDepositsAction } from "@/app/actions/panel";
import { dt, relTime, DEP_METHOD } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const STATUS_OPTS: [string, string][] = [["", "Tất cả"], ["PENDING", "Chờ xử lý"], ["APPROVED", "Đã hoàn thành"], ["REJECTED", "Đã từ chối"]];

/** Quản lý nạp tiền của khách panel — cùng cấu trúc trang của web mẹ, phạm vi dữ liệu riêng của panel. */
export default async function PanelDepositsPage({ searchParams }: {
  searchParams: { msg?: string; err?: string; q?: string; status?: string; method?: string; from?: string; to?: string; sort?: string; dir?: string; page?: string };
}) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld, M } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const scope = { user: { panelId: panel.id } };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [totalSum, monthSum, pendingCount, todaySum, members] = await Promise.all([
    prisma.deposit.aggregate({ where: { ...scope, status: "APPROVED" }, _sum: { amount: true } }),
    prisma.deposit.aggregate({ where: { ...scope, status: "APPROVED", createdAt: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.deposit.count({ where: { ...scope, status: "PENDING" } }),
    prisma.deposit.aggregate({ where: { ...scope, status: "APPROVED", createdAt: { gte: todayStart } }, _sum: { amount: true } }),
    prisma.user.findMany({ where: { panelId: panel.id }, select: { id: true, username: true }, orderBy: { username: "asc" }, take: 500 }),
  ]);

  const q = (searchParams.q || "").trim();
  const where: any = { ...scope };
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.method) where.method = searchParams.method;
  if (q) where.AND = [{ OR: [{ code: { contains: q.toUpperCase() } }, { user: { username: { contains: q } } }, { user: { email: { contains: q } } }] }];
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
    return `/panel-admin/nap-tien?${qs.toString()}`;
  };
  const rows: DepositRowDTO[] = deposits.map((d) => ({
    id: d.id, code: d.code, username: d.user.username, email: d.user.email, method: d.method,
    amount: d.amount, bonus: d.bonus, content: d.content, auto: d.auto, status: d.status,
    timeLabel: dt(d.createdAt), relLabel: Ld(relTime(d.createdAt)),
  }));

  return (
    <div>
      <PageHead title={L("Quản lý Nạp tiền")} desc={L("Phê duyệt và theo dõi các giao dịch nạp của khách panel.")}>
        <DeleteAllDeposits action={panelDeleteDepositsAction} />
        <a href="/panel-admin/nap-tien" className="btn-primary">{L("Cập nhật dữ liệu")}</a>
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label={L("Tổng nạp (Tất cả)")} value={M(totalSum._sum.amount || 0)} icon={I.wallet} />
        <Stat label={L("Nạp trong tháng")} value={M(monthSum._sum.amount || 0)} icon={I.money} tone="emerald" />
        <Stat label={L("Đang chờ xử lý")} value={String(pendingCount)} icon={I.clock} tone="amber" />
        <Stat label={L("Hôm nay")} value={M(todaySum._sum.amount || 0)} icon={I.chart} tone="violet" />
      </div>

      <form method="GET" action="/panel-admin/nap-tien" className="card mb-6 space-y-4 p-5">
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
              <span className="text-slate-400">→</span>
              <input className="inp min-w-0 flex-1" type="date" name="to" defaultValue={searchParams.to || ""} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary !py-2.5">{L("Tìm kiếm")}</button>
          <a href="/panel-admin/nap-tien" className="btn-ghost !py-2.5">{L("Làm mới")}</a>
        </div>
      </form>

      <div className="card mb-6 overflow-hidden">
        <DepositTable rows={rows} depositAction={panelDepositAction} deleteAction={panelDeleteDepositsAction} sort={sort} dir={dir} basePath="/panel-admin/nap-tien" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <span className="text-sm text-slate-500">{Ld(`Tổng cộng ${total} giao dịch`)}</span>
          <div className="flex items-center gap-1.5">
            {page > 1 ? <a className="btn-ghost btn-sm" href={pageHref(page - 1)}>{L("Trước")}</a> : <span className="btn-ghost btn-sm pointer-events-none opacity-40">{L("Trước")}</span>}
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <a key={p} href={pageHref(p)} className={p === page ? "btn-primary btn-sm !px-3" : "btn-ghost btn-sm !px-3"}>{p}</a>
            ))}
            {page < pages ? <a className="btn-ghost btn-sm" href={pageHref(page + 1)}>{L("Sau")}</a> : <span className="btn-ghost btn-sm pointer-events-none opacity-40">{L("Sau")}</span>}
          </div>
        </div>
      </div>

      <form action={panelManualDepositAction} className="card flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-[220px] flex-1">
          <label className="lbl">{L("Cộng tiền tay — Khách")}</label>
          <select name="memberId" required className="inp">
            <option value="">{L("— Chọn khách của panel —")}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.username}</option>)}
          </select>
        </div>
        <div className="w-48">
          <label className="lbl">{L("Số tiền cộng (đ)")}</label>
          <input name="amount" type="number" min={1000} step={1000} required placeholder="100000" className="inp" />
        </div>
        <button className="btn-primary !py-2.5">{L("Cộng tiền tay")}</button>
      </form>
    </div>
  );
}
