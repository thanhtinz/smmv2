import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink, Badge } from "@/components/ui";
import { adminReplyTicket } from "@/app/actions/admin";
import { TicketAttachInput, TicketAttachments } from "@/components/ticket-attach";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminTicketDetail({ params }: { params: { id: string } }) {
  const t = await prisma.ticket.findUnique({
    where: { id: parseInt(params.id) },
    include: { user: true, messages: { orderBy: { id: "asc" } } },
  });
  if (!t) notFound();
  // Ticket của khách site con do panel con tự hỗ trợ — web mẹ không xem
  if (t.user.panelId) notFound();
  return (
    <div className="max-w-3xl">
      <BackLink href="/admin/ticket">Tất cả ticket</BackLink>
      <div className="card p-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-xl font-bold text-slate-900">{t.subject}</h1>
          <Badge cls={t.status === "CLOSED" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-800"}>{t.status}</Badge>
        </div>
        <p className="text-sm text-slate-500 mb-6">Khách: {t.user.username} ({t.user.email}) · Chủ đề: {t.category}</p>
        {t.rating ? <p className="mb-6 -mt-4 text-sm text-slate-500">Khách đánh giá hỗ trợ: <b className="text-amber-500">{"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}</b>{t.ratingNote ? ` — ${t.ratingNote}` : ""}</p> : null}
        <div className="space-y-4">
          {t.messages.map((m) => (
            <div key={m.id} className={`flex ${m.fromAdmin ? "justify-end" : ""}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.fromAdmin ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                <div className={`text-[11px] mb-1 ${m.fromAdmin ? "text-brand-100" : "text-slate-400"}`}>{m.fromAdmin ? "Hỗ trợ (bạn)" : t.user.username} · {dt(m.createdAt)}</div>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                <TicketAttachments raw={m.attachments} />
              </div>
            </div>
          ))}
        </div>
        <form action={adminReplyTicket} className="mt-6 space-y-3">
          <input type="hidden" name="ticketId" value={t.id} />
          <textarea className="inp" name="body" rows={3} placeholder="Nhập phản hồi cho khách..."></textarea>
          <TicketAttachInput />
          <div className="flex items-center gap-3">
            <button className="btn-primary">Gửi phản hồi</button>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="close" className="w-4 h-4" /> Đóng ticket sau khi gửi</label>
          </div>
        </form>
      </div>
    </div>
  );
}
