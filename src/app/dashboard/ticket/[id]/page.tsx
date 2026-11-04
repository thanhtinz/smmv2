import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { BackLink, Badge } from "@/components/ui";
import { replyTicketAction } from "@/app/actions/user";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TicketDetail({ params }: { params: { id: string } }) {
  const user = (await getCurrentUser())!;
  const t = await prisma.ticket.findFirst({
    where: { id: parseInt(params.id), userId: user.id },
    include: { messages: { orderBy: { id: "asc" } } },
  });
  if (!t) notFound();
  return (
    <div className="max-w-3xl">
      <BackLink href="/dashboard/ticket">Tất cả ticket</BackLink>
      <div className="card p-6">
        <div className="flex items-start justify-between gap-3 mb-6">
          <h1 className="text-xl font-bold text-slate-900">{t.subject}</h1>
          <Badge cls={t.status === "CLOSED" ? "bg-slate-200 text-slate-600" : t.status === "ANSWERED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{t.status === "CLOSED" ? "Đã đóng" : t.status === "ANSWERED" ? "Đã phản hồi" : "Chờ phản hồi"}</Badge>
        </div>
        <div className="space-y-4">
          {t.messages.map((m) => (
            <div key={m.id} className={`flex ${m.fromAdmin ? "" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.fromAdmin ? "bg-slate-100 text-slate-800" : "bg-brand-600 text-white"}`}>
                <div className={`text-[11px] mb-1 ${m.fromAdmin ? "text-slate-400" : "text-brand-100"}`}>{m.fromAdmin ? "Hỗ trợ" : "Bạn"} · {dt(m.createdAt)}</div>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              </div>
            </div>
          ))}
        </div>
        {t.status !== "CLOSED" ? (
          <form action={replyTicketAction} className="mt-6 flex gap-2">
            <input type="hidden" name="ticketId" value={t.id} />
            <input className="inp flex-1" name="body" required placeholder="Nhập phản hồi..." />
            <button className="btn-primary">Gửi</button>
          </form>
        ) : <p className="text-sm text-slate-400 mt-6 text-center">Ticket đã đóng. Tạo ticket mới nếu cần hỗ trợ thêm.</p>}
      </div>
    </div>
  );
}
