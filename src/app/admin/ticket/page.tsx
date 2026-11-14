import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHead, Badge, Empty, I } from "@/components/ui";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";
const T_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Chờ phản hồi", cls: "bg-amber-100 text-amber-800" },
  ANSWERED: { label: "Đã phản hồi", cls: "bg-emerald-100 text-emerald-800" },
  CLOSED: { label: "Đã đóng", cls: "bg-slate-200 text-slate-600" },
};

export default async function AdminTickets() {
  const { L, Ld } = await getServerI18n(null);
  const ratingAgg = await prisma.ticket.aggregate({ where: { rating: { not: null } }, _avg: { rating: true }, _count: { rating: true } });
  const tickets = await prisma.ticket.findMany({ where: {}, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 60, include: { user: true, _count: { select: { messages: true } } } });
  return (
    <div>
      <PageHead title={L("Ticket hỗ trợ")} />
      {ratingAgg._count.rating > 0 && <p className="mb-4 text-sm text-slate-500">{L("Đánh giá hỗ trợ trung bình:")} <b className="inline-flex items-center gap-1 text-amber-500">{(ratingAgg._avg.rating || 0).toFixed(1)}<span className="[&_svg]:h-4 [&_svg]:w-4">{I.star}</span></b> {L("từ")} {ratingAgg._count.rating} {L("lượt chấm của khách")}</p>}
      {tickets.length === 0 ? <Empty text={L("Chưa có ticket nào")} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="th">{L("Tiêu đề")}</th><th className="th">{L("Khách")}</th><th className="th">{L("Chủ đề")}</th><th className="th">{L("Tin nhắn")}</th><th className="th">{L("Cập nhật")}</th><th className="th">{L("Trạng thái")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="td"><Link href={`/admin/ticket/${t.id}`} className="font-semibold text-brand-700">{t.subject}</Link></td>
                  <td className="td">{t.user.username}</td>
                  <td className="td text-slate-500">{t.category}</td>
                  <td className="td">{t._count.messages}</td>
                  <td className="td text-xs text-slate-500">{dt(t.updatedAt)}</td>
                  <td className="td"><Badge cls={T_STATUS[t.status].cls}>{L(T_STATUS[t.status].label)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
