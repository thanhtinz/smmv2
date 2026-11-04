import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash, Badge, Empty } from "@/components/ui";
import { createTicketAction } from "@/app/actions/user";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";
const T_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Chờ phản hồi", cls: "bg-amber-100 text-amber-800" },
  ANSWERED: { label: "Đã phản hồi", cls: "bg-emerald-100 text-emerald-800" },
  CLOSED: { label: "Đã đóng", cls: "bg-slate-200 text-slate-600" },
};

export default async function TicketsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const tickets = await prisma.ticket.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 30, include: { _count: { select: { messages: true } } } });
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      <div className="lg:col-span-3">
        <PageHead title="Ticket hỗ trợ" desc="Đội hỗ trợ phản hồi trong giờ hành chính, thường dưới 2 giờ." />
        <Flash msg={searchParams.msg} err={searchParams.err} />
        {tickets.length === 0 ? <Empty text="Chưa có ticket nào" /> : (
          <div className="space-y-3">
            {tickets.map((t) => (
              <Link key={t.id} href={`/dashboard/ticket/${t.id}`} className="card p-4 flex items-center gap-4 hover:shadow-md transition">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 truncate">{t.subject}</div>
                  <div className="text-xs text-slate-400">{t._count.messages} tin nhắn · Cập nhật {dt(t.updatedAt)}</div>
                </div>
                <Badge cls={T_STATUS[t.status].cls}>{T_STATUS[t.status].label}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
      <form action={createTicketAction} className="card p-6 lg:col-span-2 space-y-4 lg:sticky lg:top-24">
        <div className="font-bold text-slate-900">Tạo ticket mới</div>
        <div>
          <label className="lbl">Chủ đề</label>
          <select className="inp" name="category">
            <option value="smm">Đơn SMM</option>
            <option value="premium">Đơn Premium / bảo hành</option>
            <option value="deposit">Nạp tiền</option>
            <option value="other">Khác</option>
          </select>
        </div>
        <div>
          <label className="lbl">Tiêu đề</label>
          <input className="inp" name="subject" required placeholder="Vd: Đơn SMM100123 chạy chậm" />
        </div>
        <div>
          <label className="lbl">Nội dung</label>
          <textarea className="inp" name="body" rows={5} required placeholder="Mô tả chi tiết, kèm mã đơn nếu có..." />
        </div>
        <button className="btn-primary w-full">Gửi ticket</button>
      </form>
    </div>
  );
}
