import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { BackLink, Badge } from "@/components/ui";
import { replyTicketAction, rateTicketAction } from "@/app/actions/user";
import { TicketAttachInput, TicketAttachments } from "@/components/ticket-attach";
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
                <TicketAttachments raw={m.attachments} />
              </div>
            </div>
          ))}
        </div>
        {t.status !== "CLOSED" ? (
          <form action={replyTicketAction} className="mt-6 space-y-3">
            <input type="hidden" name="ticketId" value={t.id} />
            <div className="flex gap-2">
              <input className="inp flex-1" name="body" required placeholder="Nhập phản hồi..." />
              <button className="btn-primary">Gửi</button>
            </div>
            <TicketAttachInput />
          </form>
        ) : (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="text-center text-sm text-slate-400">Ticket đã đóng. Tạo ticket mới nếu cần hỗ trợ thêm.</p>
            {t.rating ? (
              <p className="mt-3 text-center text-sm text-slate-600">Bạn đã đánh giá hỗ trợ: <b className="text-amber-500">{"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}</b>{t.ratingNote ? ` — ${t.ratingNote}` : ""}</p>
            ) : (
              <form action={rateTicketAction} className="mx-auto mt-4 max-w-md space-y-3">
                <input type="hidden" name="ticketId" value={t.id} />
                <div className="text-center text-sm font-semibold text-slate-800">Đánh giá chất lượng hỗ trợ</div>
                <div className="flex justify-center gap-2">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <label key={n} className="cursor-pointer rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:border-amber-300 hover:text-amber-600">
                      <input type="radio" name="rating" value={n} className="mr-1 accent-amber-500" />{n}★
                    </label>
                  ))}
                </div>
                <input className="inp" name="ratingNote" placeholder="Nhận xét thêm (không bắt buộc)" />
                <button className="btn-primary w-full">Gửi đánh giá</button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
