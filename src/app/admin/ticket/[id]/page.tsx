import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink, Badge, Flash } from "@/components/ui";
import { Stars } from "@/components/premium-card";
import { adminReplyTicket } from "@/app/actions/admin";
import { TicketAttachInput, TicketAttachments } from "@/components/ticket-attach";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminTicketDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  const { L, Ld } = await getServerI18n(null);
  const t = await prisma.ticket.findUnique({
    where: { id: parseInt(params.id) },
    include: { user: true, messages: { orderBy: { id: "asc" } } },
  });
  if (!t) notFound();
  // Ticket của khách site con do panel con tự hỗ trợ — web mẹ không xem
  return (
    <div className="max-w-3xl">
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <BackLink href="/admin/ticket">{L("Tất cả ticket")}</BackLink>
      <div className="card p-6">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h1 className="text-xl font-bold text-slate-900">{t.subject}</h1>
          <Badge cls={t.status === "CLOSED" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-800"}>{t.status}</Badge>
        </div>
        <p className="text-sm text-slate-500 mb-6">{L("Khách:")} {t.user.username} ({t.user.email}) · {L("Chủ đề:")} {t.category}</p>
        {t.rating ? <p className="mb-6 -mt-4 text-sm text-slate-500">{L("Khách đánh giá hỗ trợ:")} <span className="inline-flex align-middle"><Stars value={t.rating} className="h-4 w-4" /></span>{t.ratingNote ? ` — ${t.ratingNote}` : ""}</p> : null}
        <div className="space-y-4">
          {t.messages.map((m) => (
            <div key={m.id} className={`flex ${m.fromAdmin ? "justify-end" : ""}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.fromAdmin ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                <div className={`text-[11px] mb-1 ${m.fromAdmin ? "text-brand-100" : "text-slate-400"}`}>{m.fromAdmin ? L("Hỗ trợ (bạn)") : t.user.username} · {dt(m.createdAt)}</div>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                <TicketAttachments raw={m.attachments} />
              </div>
            </div>
          ))}
        </div>
        <form action={adminReplyTicket} className="mt-6 space-y-3">
          <input type="hidden" name="ticketId" value={t.id} />
          <textarea className="inp" name="body" rows={3} placeholder={L("Nhập phản hồi cho khách...")}></textarea>
          <TicketAttachInput />
          <div className="flex items-center gap-3">
            <button className="btn-primary">{L("Gửi phản hồi")}</button>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="close" className="w-4 h-4" /> {L("Đóng ticket sau khi gửi")}</label>
          </div>
        </form>
      </div>
    </div>
  );
}
