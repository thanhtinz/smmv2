import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHead, Badge, Empty } from "@/components/ui";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";
const T_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Chờ phản hồi", cls: "bg-amber-100 text-amber-800" },
  ANSWERED: { label: "Đã phản hồi", cls: "bg-emerald-100 text-emerald-800" },
  CLOSED: { label: "Đã đóng", cls: "bg-slate-200 text-slate-600" },
};

export default async function AdminTickets() {
  const tickets = await prisma.ticket.findMany({ where: { user: { panelId: null } }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 60, include: { user: true, _count: { select: { messages: true } } } });
  return (
    <div>
      <PageHead title="Ticket hỗ trợ" desc="Ticket CHỜ PHẢN HỒI (khách vừa gửi/trả lời) được xếp lên đầu." />
      {tickets.length === 0 ? <Empty text="Chưa có ticket nào" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="th">Tiêu đề</th><th className="th">Khách</th><th className="th">Chủ đề</th><th className="th">Tin nhắn</th><th className="th">Cập nhật</th><th className="th">Trạng thái</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="td"><Link href={`/admin/ticket/${t.id}`} className="font-semibold text-brand-700">{t.subject}</Link></td>
                  <td className="td">{t.user.username}</td>
                  <td className="td text-slate-500">{t.category}</td>
                  <td className="td">{t._count.messages}</td>
                  <td className="td text-xs text-slate-500">{dt(t.updatedAt)}</td>
                  <td className="td"><Badge cls={T_STATUS[t.status].cls}>{T_STATUS[t.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
