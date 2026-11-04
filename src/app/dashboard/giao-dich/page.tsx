import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Empty } from "@/components/ui";
import { vnd, dt } from "@/lib/format";

export const dynamic = "force-dynamic";
const TX_LABEL: Record<string, string> = {
  DEPOSIT: "Nạp tiền", SMM_ORDER: "Đặt đơn SMM", PREMIUM_ORDER: "Mua Premium",
  REFUND: "Hoàn tiền", ADJUST: "Admin điều chỉnh", BONUS: "Thưởng",
};

export default async function TransactionsPage({ searchParams }: { searchParams: { page?: string } }) {
  const user = (await getCurrentUser())!;
  const page = Math.max(1, parseInt(searchParams.page || "1"));
  const PAGE = 30;
  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where: { userId: user.id } }),
    prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
  ]);
  return (
    <div>
      <PageHead title="Lịch sử số dư" desc={`Mọi biến động cộng/trừ đều được ghi sổ — ${total} giao dịch`} />
      {rows.length === 0 ? <Empty text="Chưa có giao dịch nào" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="th">Thời gian</th><th className="th">Loại</th><th className="th">Nội dung</th><th className="th">Biến động</th><th className="th">Số dư sau</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="td text-slate-500 text-xs">{dt(t.createdAt)}</td>
                  <td className="td font-medium">{TX_LABEL[t.type] || t.type}</td>
                  <td className="td text-slate-500">{t.note || "—"}{t.ref ? ` · ${t.ref}` : ""}</td>
                  <td className={`td font-bold ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : ""}{vnd(t.amount)}</td>
                  <td className="td font-medium">{vnd(t.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Math.ceil(total / PAGE) > 1 && <p className="text-sm text-slate-400 mt-4">Trang {page}/{Math.ceil(total / PAGE)} — thêm ?page=N trên URL để xem tiếp.</p>}
    </div>
  );
}
