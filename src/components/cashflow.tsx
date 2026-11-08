import Link from "next/link";
import { prisma } from "@/lib/db";
import { Empty } from "@/components/ui";
import { num, dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) || "";

const TX_LABEL: Record<string, string> = {
  DEPOSIT: "Nạp tiền",
  SMM_ORDER: "Đơn SMM",
  PREMIUM_ORDER: "Đơn Premium",
  REFUND: "Hoàn tiền",
  ADJUST: "Điều chỉnh",
  BONUS: "Thưởng",
  PANEL_COMMISSION: "Hoa hồng panel",
  REFERRAL_COMMISSION: "Hoa hồng giới thiệu",
  PANEL_FEE: "Phí tạo panel",
};

/* ===== Dòng tiền / Lịch sử số dư — bố cục theo panel mẫu: 1 thẻ "Chi tiết giao dịch",
 *  lọc theo khoảng ngày + nội dung + loại, cột Thời gian/Loại/Số tiền/Biến động/Nội dung ===== */
export async function CashflowView({ userId, sp, base }: { userId: number; sp: SP; base: string }) {
  const { L, Ld, M } = await getServerI18n();
  const q = one(sp.q).trim();
  const type = one(sp.type).trim();
  const from = one(sp.from).trim();
  const to = one(sp.to).trim();
  const size = [10, 20, 30, 50, 100].includes(parseInt(one(sp.size))) ? parseInt(one(sp.size)) : 10;
  const page = Math.max(1, parseInt(one(sp.page) || "1"));
  const where: any = { userId };
  if (q) where.OR = [{ note: { contains: q } }, { ref: { contains: q } }];
  if (type && TX_LABEL[type]) where.type = type;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
      ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}),
    };
  }
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * size, take: size }),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (type) u.set("type", type);
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    u.set("size", String(size));
    if (p > 1) u.set("page", String(p));
    return `${base}?${u.toString()}`;
  };
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{L("Lịch sử dòng tiền")}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{L("Theo dõi chi tiết lịch sử cộng/trừ tiền trong ví của bạn")}</p>
      </div>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="font-bold text-slate-900">{L("Chi tiết giao dịch")}</div>
          <Link href={base} className="btn-ghost btn-sm">{L("Tải lại")}</Link>
        </div>
        <form className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
          <label className="flex w-[9.5rem] flex-col gap-1 text-xs font-semibold text-slate-500">{L("Từ ngày")}
            <input type="date" name="from" defaultValue={from} className="inp w-full !py-2" />
          </label>
          <label className="flex w-[9.5rem] flex-col gap-1 text-xs font-semibold text-slate-500">{L("Đến ngày")}
            <input type="date" name="to" defaultValue={to} className="inp w-full !py-2" />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs font-semibold text-slate-500">{L("Tìm nội dung")}
            <input className="inp w-full !py-2" name="q" placeholder={L("Tìm nội dung, mã giao dịch...")} defaultValue={q} />
          </label>
          <label className="flex w-44 flex-col gap-1 text-xs font-semibold text-slate-500">{L("Loại giao dịch")}
            <select className="inp w-full !py-2" name="type" defaultValue={type}>
              <option value="">{L("Tất cả loại")}</option>
              {Object.entries(TX_LABEL).map(([k, v]) => <option key={k} value={k}>{L(v)}</option>)}
            </select>
          </label>
          <label className="flex w-28 flex-col gap-1 text-xs font-semibold text-slate-500">{L("Hiển thị")}
            <select className="inp w-full !py-2" name="size" defaultValue={String(size)}>
              {[10, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{Ld(`${n} mục`)}</option>)}
            </select>
          </label>
          <button className="btn-dark !py-2">{L("Lọc")}</button>
        </form>
        {rows.length === 0 ? <Empty text={L("Chưa có giao dịch nào")} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-200 bg-slate-50"><tr>
                <th className="th">{L("Thời gian")}</th><th className="th">{L("Loại")}</th><th className="th">{L("Số tiền")}</th><th className="th">{L("Biến động số dư")}</th><th className="th">{L("Nội dung")}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="td whitespace-nowrap text-xs text-slate-500">{dt(t.createdAt)}</td>
                    <td className="td whitespace-nowrap">{L(TX_LABEL[t.type] || t.type)}</td>
                    <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : "−"}{M(Math.abs(t.amount))}</td>
                    <td className="td whitespace-nowrap text-slate-500">{M(t.balanceAfter - t.amount)} → <b className="text-slate-800">{M(t.balanceAfter)}</b></td>
                    <td className="td text-slate-600">{t.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pages > 1 && (
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <Link href={href(page - 1)} className={`rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}>‹</Link>
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={href(p)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${p === page ? "bg-slate-900 text-white" : "border border-slate-200 bg-white"}`}>{p}</Link>
          ))}
          <Link href={href(page + 1)} className={`rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold ${page >= pages ? "pointer-events-none opacity-40" : ""}`}>›</Link>
          <span className="ml-2 text-xs text-slate-400">{Ld(`${num(total)} giao dịch`)}</span>
        </div>
      )}
    </div>
  );
}
