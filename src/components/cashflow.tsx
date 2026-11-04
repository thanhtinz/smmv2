import Link from "next/link";
import { prisma } from "@/lib/db";
import { Empty } from "@/components/ui";
import { vnd, num, dt } from "@/lib/format";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) || "";

/* ===== Dòng tiền / Lịch sử số dư — bố cục kiểu thatim (QUẢN LÝ DÒNG TIỀN) ===== */
export async function CashflowView({ userId, sp, base }: { userId: number; sp: SP; base: string }) {
  const q = one(sp.q).trim();
  const size = [10, 20, 30, 50, 100].includes(parseInt(one(sp.size))) ? parseInt(one(sp.size)) : 10;
  const page = Math.max(1, parseInt(one(sp.page) || "1"));
  const where: any = { userId };
  if (q) where.OR = [{ note: { contains: q } }, { ref: { contains: q } }];
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * size, take: size }),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    u.set("size", String(size));
    if (p > 1) u.set("page", String(p));
    return `${base}?${u.toString()}`;
  };
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-black tracking-tight text-slate-900 uppercase">Quản lý dòng tiền</h1>
        <p className="text-sm text-slate-500 mt-0.5">Theo dõi chi tiết lịch sử cộng/trừ tiền trong ví của bạn</p>
      </div>
      <form className="flex flex-wrap gap-2 mb-5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Hiển thị
          <select className="inp !w-28 !py-2" name="size" defaultValue={String(size)}>
            {[10, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n} mục</option>)}
          </select>
        </label>
        <input className="inp flex-1 min-w-[200px] !py-2" name="q" placeholder="Tìm kiếm..." defaultValue={q} />
        <button className="btn-dark !py-2">Tìm kiếm</button>
      </form>
      {rows.length === 0 ? <Empty text="Chưa có giao dịch nào" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">STT</th><th className="th">Mã giao dịch</th><th className="th">Số dư trước</th><th className="th">Số tiền</th><th className="th">Số dư</th><th className="th">Thời gian</th><th className="th">Ghi chú</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t, i) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="td text-slate-400">{(page - 1) * size + i + 1}</td>
                  <td className="td font-mono text-xs font-semibold">{t.ref || `GD${t.id}`}</td>
                  <td className="td text-slate-500">{vnd(t.balanceAfter - t.amount)}</td>
                  <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : "−"}{vnd(Math.abs(t.amount))}</td>
                  <td className="td font-semibold">{vnd(t.balanceAfter)}</td>
                  <td className="td text-slate-500 text-xs whitespace-nowrap">{dt(t.createdAt)}</td>
                  <td className="td text-slate-600">{t.note || "—"}</td>
                </tr>
              ))}
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
          <span className="text-xs text-slate-400 ml-2">{num(total)} giao dịch</span>
        </div>
      )}
    </div>
  );
}
