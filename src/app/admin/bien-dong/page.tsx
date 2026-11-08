import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const TX_LABEL: Record<string, string> = {
  DEPOSIT: "Nạp tiền", SMM_ORDER: "Đặt đơn SMM", PREMIUM_ORDER: "Mua Premium",
  REFUND: "Hoàn tiền", ADJUST: "Điều chỉnh", BONUS: "Thưởng nạp",
  PANEL_COMMISSION: "Hoa hồng panel", REFERRAL_COMMISSION: "Hoa hồng giới thiệu",
};
const PER = 30;

export default async function AdminMovements({ searchParams }: { searchParams: { q?: string; type?: string; page?: string; msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld, M } = await getServerI18n(null);
  const page = Math.max(1, parseInt(searchParams.page || "1"));
  const where: any = {};
  if (searchParams.type) where.type = searchParams.type;
  if (searchParams.q) where.OR = [{ note: { contains: searchParams.q } }, { ref: { contains: searchParams.q } }, { user: { username: { contains: searchParams.q } } }];
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * PER, take: PER, include: { user: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (searchParams.q) u.set("q", searchParams.q);
    if (searchParams.type) u.set("type", searchParams.type);
    u.set("page", String(p));
    return `/admin/bien-dong?${u}`;
  };
  const csvQs = new URLSearchParams();
  if (searchParams.q) csvQs.set("q", searchParams.q);
  if (searchParams.type) csvQs.set("type", searchParams.type);
  return (
    <div>
      <PageHead title={L("Biến động số dư")} desc={<>{total.toLocaleString("vi-VN")} {L("giao dịch trên toàn hệ thống — mọi thay đổi số dư đều có sổ ở đây.")}</>}>
        <a href={`/admin/bien-dong/csv?${csvQs}`} className="btn-dark">{L("Xuất CSV")}</a>
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1"><label className="lbl">{L("Tìm kiếm")}</label><input className="inp" name="q" placeholder={L("Mô tả, mã tham chiếu, username...")} defaultValue={searchParams.q || ""} /></div>
        <div><label className="lbl">{L("Loại giao dịch")}</label>
          <select className="inp !w-52" name="type" defaultValue={searchParams.type || ""}>
            <option value="">{L("Tất cả loại")}</option>
            {Object.entries(TX_LABEL).map(([k, v]) => <option key={k} value={k}>{L(v)}</option>)}
          </select></div>
        <button className="btn-primary">{L("Tìm kiếm")}</button>
        <Link href="/admin/bien-dong" className="btn-ghost">{L("Đặt lại")}</Link>
      </form>
      {rows.length === 0 ? <Empty text={L("Không có giao dịch nào khớp")} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr>
              <th className="th">ID</th><th className="th">{L("Người dùng")}</th><th className="th">{L("Loại")}</th><th className="th">{L("Số tiền")}</th><th className="th">{L("Số dư trước")}</th><th className="th">{L("Số dư sau")}</th><th className="th">{L("Mô tả")}</th><th className="th">{L("Thời gian")}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="td font-mono text-xs text-slate-400">#{t.id}</td>
                  <td className="td"><span className="font-medium">{t.user.username}</span><div className="text-xs text-slate-400">{Ld(`ID ${t.userId}`)}</div></td>
                  <td className="td"><Badge cls={t.amount >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>{L(TX_LABEL[t.type] || t.type)}</Badge></td>
                  <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : "−"}{M(Math.abs(t.amount))}</td>
                  <td className="td text-slate-500">{M(t.balanceAfter - t.amount)}</td>
                  <td className="td font-medium">{M(t.balanceAfter)}</td>
                  <td className="td max-w-[280px] truncate text-slate-500">{t.note || t.ref || "—"}</td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {page > 1 && <Link href={qs(page - 1)} className="btn-ghost btn-sm">{L("← Trước")}</Link>}
          {Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2).map((p, i, arr) => (
            <span key={p} className="flex items-center gap-1.5">
              {i > 0 && arr[i - 1] < p - 1 && <span className="text-slate-400">…</span>}
              <Link href={qs(p)} className={p === page ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{p}</Link>
            </span>
          ))}
          {page < pages && <Link href={qs(page + 1)} className="btn-ghost btn-sm">{L("Sau →")}</Link>}
        </div>
      )}
    </div>
  );
}
