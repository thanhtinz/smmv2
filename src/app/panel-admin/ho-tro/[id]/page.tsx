import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePanelAccessPage } from "@/lib/panel-access";
import { PageHead, Flash, Badge } from "@/components/ui";
import { panelReplyTicket, panelToggleTicket } from "@/app/actions/panel";
import { TicketAttachInput, TicketAttachments } from "@/components/ticket-attach";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Chờ trả lời", cls: "bg-rose-50 text-rose-600" },
  ANSWERED: { label: "Đã trả lời", cls: "bg-emerald-50 text-emerald-600" },
  CLOSED: { label: "Đã đóng", cls: "bg-slate-100 text-slate-500" },
};

/** Chi tiết ticket của khách panel: đọc hội thoại + trả lời + đóng/mở lại. */
export default async function PanelTicketDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelAccessPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const ticket = await prisma.ticket.findFirst({
    where: { id: parseInt(params.id), user: { panelId: panel.id } },
    include: { user: { select: { username: true, email: true } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) notFound();
  return (
    <div>
      <PageHead title={Ld(`Ticket #${ticket.id}: ${ticket.subject}`)} desc={Ld(`Khách ${ticket.user.username} · ${ticket.user.email}`)}>
        <span className="flex items-center gap-2">
          <Badge cls={STATUS[ticket.status].cls}>{L(STATUS[ticket.status].label)}</Badge>
          <Link href="/panel-admin/ho-tro" className="btn-ghost btn-sm !px-4 !py-2">{L("← Danh sách")}</Link>
        </span>
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="card mb-6 space-y-4 p-6">
        {ticket.messages.map((m) => (
          <div key={m.id} className={`flex ${m.fromAdmin ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.fromAdmin ? "rounded-br-md bg-slate-900 text-white" : "rounded-bl-md bg-slate-100 text-slate-700"}`}>
              <div className={`mb-1 text-[11px] font-semibold ${m.fromAdmin ? "text-slate-400" : "text-slate-400"}`}>{m.fromAdmin ? L("Hỗ trợ (bạn)") : ticket.user.username} · {dt(m.createdAt)}</div>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <TicketAttachments raw={m.attachments} />
            </div>
          </div>
        ))}
        {ticket.messages.length === 0 && <p className="text-sm text-slate-400">{L("Chưa có tin nhắn nào.")}</p>}
      </div>
      {ticket.status !== "CLOSED" ? (
        <form action={panelReplyTicket} className="card space-y-4 p-6">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <div className="font-bold text-slate-900">{L("Trả lời khách")}</div>
          <textarea name="body" rows={4} required className="inp" placeholder={L("Nội dung phản hồi...")} />
          <TicketAttachInput />
          <div className="flex flex-wrap items-center gap-4">
            <button className="btn-primary !py-2.5">{L("Gửi phản hồi")}</button>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="close" className="h-4 w-4 accent-slate-900" /> {L("Đóng ticket sau khi trả lời")}</label>
          </div>
        </form>
      ) : (
        <form action={panelToggleTicket} className="card flex items-center justify-between p-6">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <span className="text-sm text-slate-500">{L("Ticket đã đóng.")}</span>
          <button className="btn-ghost btn-sm !px-4 !py-2">{L("Mở lại ticket")}</button>
        </form>
      )}
    </div>
  );
}
