import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePanelAccessPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Chờ trả lời", cls: "bg-rose-50 text-rose-600" },
  ANSWERED: { label: "Đã trả lời", cls: "bg-emerald-50 text-emerald-600" },
  CLOSED: { label: "Đã đóng", cls: "bg-slate-100 text-slate-500" },
};
const CAT: Record<string, string> = { smm: "Đơn SMM", premium: "Premium", deposit: "Nạp tiền", other: "Khác" };

/** Ticket hỗ trợ của khách panel — chỉ ticket do khách của panel này tạo. */
export default async function PanelTicketsPage({ searchParams }: { searchParams: { msg?: string; err?: string; status?: string } }) {
  const { user, panel, isOwner } = await requirePanelAccessPage();
  const status = ["OPEN", "ANSWERED", "CLOSED"].includes(searchParams.status || "") ? searchParams.status : "";
  const tickets = await prisma.ticket.findMany({
    where: { user: { panelId: panel.id }, ...(status ? { status: status as any } : {}) },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    include: { user: { select: { username: true } }, _count: { select: { messages: true } } },
  });
  return (
    <div>
      <PageHead title="Hỗ trợ khách panel" desc="Ticket do khách của gian hàng bạn gửi — trả lời ngay tại đây, khách nhận thông báo." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="mb-4 flex flex-wrap gap-2">
        {[{ v: "", l: "Tất cả" }, { v: "OPEN", l: "Chờ trả lời" }, { v: "ANSWERED", l: "Đã trả lời" }, { v: "CLOSED", l: "Đã đóng" }].map((t) => (
          <Link key={t.v} href={t.v ? `/panel-admin/ho-tro?status=${t.v}` : "/panel-admin/ho-tro"} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${status === t.v ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{t.l}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead><tr className="border-b border-slate-100"><th className="th">Ticket</th><th className="th">Khách</th><th className="th">Chủ đề</th><th className="th">Tin nhắn</th><th className="th">Cập nhật</th><th className="th">Trạng thái</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/60">
                <td className="td font-mono text-[13px] font-semibold text-slate-700">#{t.id}</td>
                <td className="td font-medium text-slate-700">{t.user.username}</td>
                <td className="td"><Link href={`/panel-admin/ho-tro/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.subject}</Link><div className="text-xs text-slate-400">{CAT[t.category] || t.category}</div></td>
                <td className="td text-slate-500">{t._count.messages}</td>
                <td className="td whitespace-nowrap text-slate-500">{dt(t.updatedAt)}</td>
                <td className="td"><Badge cls={STATUS[t.status].cls}>{STATUS[t.status].label}</Badge></td>
              </tr>
            ))}
            {tickets.length === 0 && <tr><td colSpan={6} className="td py-10 text-center text-slate-400">Chưa có ticket nào từ khách của panel.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
