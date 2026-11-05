import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { vnd, dt } from "@/lib/format";

export const dynamic = "force-dynamic";

const TX_LABEL: Record<string, string> = {
  DEPOSIT: "Nạp tiền", SMM_ORDER: "Đặt đơn SMM", PREMIUM_ORDER: "Mua Premium",
  REFUND: "Hoàn tiền", ADJUST: "Điều chỉnh", BONUS: "Thưởng nạp",
  PANEL_COMMISSION: "Hoa hồng panel", REFERRAL_COMMISSION: "Hoa hồng giới thiệu",
};
const PER = 30;

/** Biến động số dư — như web mẹ nhưng chỉ gồm khách của panel + hoa hồng của chủ panel. */
export default async function PanelMovements({ searchParams }: { searchParams: { q?: string; type?: string; page?: string; msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const page = Math.max(1, parseInt(searchParams.page || "1"));
  // Phạm vi: mọi giao dịch của khách panel + riêng dòng hoa hồng PANEL_COMMISSION của chủ panel.
  const finalWhere: any = { AND: [{ OR: [{ user: { panelId: panel.id } }, { userId: panel.ownerId, type: "PANEL_COMMISSION" }] }] };
  if (searchParams.type) finalWhere.AND.push({ type: searchParams.type });
  if (searchParams.q) finalWhere.AND.push({ OR: [{ note: { contains: searchParams.q } }, { ref: { contains: searchParams.q } }, { user: { username: { contains: searchParams.q } } }] });
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where: finalWhere }),
    prisma.transaction.findMany({ where: finalWhere, orderBy: { id: "desc" }, skip: (page - 1) * PER, take: PER, include: { user: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER));
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (searchParams.q) u.set("q", searchParams.q);
    if (searchParams.type) u.set("type", searchParams.type);
    u.set("page", String(p));
    return `/panel-admin/bien-dong?${u}`;
  };
  const csvQs = new URLSearchParams();
  if (searchParams.q) csvQs.set("q", searchParams.q);
  if (searchParams.type) csvQs.set("type", searchParams.type);
  return (
    <div>
      <PageHead title="Biến động số dư" desc={`${total.toLocaleString("vi-VN")} giao dịch của khách panel và hoa hồng của bạn — mọi thay đổi số dư trong panel đều có sổ ở đây.`}>
        <a href={`/panel-admin/bien-dong/csv?${csvQs}`} className="btn-dark">Xuất CSV</a>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1"><label className="lbl">Tìm kiếm</label><input className="inp" name="q" placeholder="Mô tả, mã tham chiếu, username..." defaultValue={searchParams.q || ""} /></div>
        <div><label className="lbl">Loại giao dịch</label>
          <select className="inp !w-52" name="type" defaultValue={searchParams.type || ""}>
            <option value="">Tất cả loại</option>
            {Object.entries(TX_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <button className="btn-primary">Tìm kiếm</button>
        <Link href="/panel-admin/bien-dong" className="btn-ghost">Đặt lại</Link>
      </form>
      {rows.length === 0 ? <Empty text="Không có giao dịch nào khớp" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr>
              <th className="th">ID</th><th className="th">Người dùng</th><th className="th">Loại</th><th className="th">Số tiền</th><th className="th">Số dư trước</th><th className="th">Số dư sau</th><th className="th">Mô tả</th><th className="th">Thời gian</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="td font-mono text-xs text-slate-400">#{t.id}</td>
                  <td className="td"><span className="font-medium">{t.user.username}</span><div className="text-xs text-slate-400">{t.userId === panel.ownerId ? "Chủ panel" : `Khách · ID ${t.userId}`}</div></td>
                  <td className="td"><Badge cls={t.amount >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>{TX_LABEL[t.type] || t.type}</Badge></td>
                  <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : "−"}{vnd(Math.abs(t.amount))}</td>
                  <td className="td text-slate-500">{vnd(t.balanceAfter - t.amount)}</td>
                  <td className="td font-medium">{vnd(t.balanceAfter)}</td>
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
          {page > 1 && <Link href={qs(page - 1)} className="btn-ghost btn-sm">← Trước</Link>}
          {Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 2).map((p, i, arr) => (
            <span key={p} className="flex items-center gap-1.5">
              {i > 0 && arr[i - 1] < p - 1 && <span className="text-slate-400">…</span>}
              <Link href={qs(p)} className={p === page ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{p}</Link>
            </span>
          ))}
          {page < pages && <Link href={qs(page + 1)} className="btn-ghost btn-sm">Sau →</Link>}
        </div>
      )}
    </div>
  );
}
