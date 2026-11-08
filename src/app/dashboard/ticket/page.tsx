import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { PageHead, Flash, Badge, Empty, Stat, I } from "@/components/ui";
import { createTicketAction } from "@/app/actions/user";
import { TicketAttachInput } from "@/components/ticket-attach";
import { dt, num } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";
const T_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Chờ phản hồi", cls: "bg-amber-100 text-amber-800" },
  ANSWERED: { label: "Đã phản hồi", cls: "bg-emerald-100 text-emerald-800" },
  CLOSED: { label: "Đã đóng", cls: "bg-slate-200 text-slate-600" },
};
const T_CAT: Record<string, string> = { smm: "Đơn SMM", premium: "Đơn Premium / bảo hành", deposit: "Nạp tiền", other: "Khác" };

/** Hỗ trợ — bố cục theo panel mẫu: thẻ thống kê, nút lọc theo trạng thái (có số lượng),
 *  tìm kiếm, bảng ticket và form tạo ở cuối trang. */
export default async function TicketsPage({ searchParams }: { searchParams: { msg?: string; err?: string; st?: string; q?: string; subject?: string; category?: string; body?: string } }) {
  const user = (await getCurrentUser())!;
  const { L, Ld } = await getServerI18n();
  if (!(await moduleOn("tickets"))) { const { redirect } = await import("next/navigation"); redirect("/dashboard"); }
  const st = searchParams.st && T_STATUS[searchParams.st] ? searchParams.st : "";
  const q = (searchParams.q || "").trim();
  const [counts, tickets] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    prisma.ticket.findMany({
      where: { userId: user.id, ...(st ? { status: st as any } : {}), ...(q ? { subject: { contains: q, mode: "insensitive" } } : {}) },
      orderBy: { updatedAt: "desc" }, take: 30, include: { _count: { select: { messages: true } } },
    }),
  ]);
  const c = (k: string) => counts.find((x) => x.status === k)?._count || 0;
  const total = counts.reduce((a, x) => a + x._count, 0);
  const pills = [
    { st: "", label: "Tất cả", n: total },
    { st: "OPEN", label: "Chờ phản hồi", n: c("OPEN") },
    { st: "ANSWERED", label: "Đã phản hồi", n: c("ANSWERED") },
    { st: "CLOSED", label: "Đã đóng", n: c("CLOSED") },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHead title={L("Hỗ trợ")} desc={L("Quản lý ticket hỗ trợ của bạn")} />
        <div className="flex gap-2 pt-1">
          <Link href="/dashboard/ticket" className="btn-ghost">{L("Làm mới")}</Link>
          <a href="#tao-ticket" className="btn-primary">{L("+ Tạo ticket mới")}</a>
        </div>
      </div>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label={L("Tổng số ticket")} value={num(total)} icon={I.ticket} />
        <Stat label={L("Chờ phản hồi")} value={num(c("OPEN"))} icon={I.clock} />
        <Stat label={L("Đã phản hồi")} value={num(c("ANSWERED"))} icon={I.check} />
        <Stat label={L("Đã đóng")} value={num(c("CLOSED"))} icon={I.db} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {pills.map((p) => (
          <Link key={p.st} href={`/dashboard/ticket${p.st ? `?st=${p.st}` : ""}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${st === p.st ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
            {`${L(p.label)} (${p.n})`}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          {st && <input type="hidden" name="st" value={st} />}
          <input name="q" defaultValue={q} placeholder={L("Tìm kiếm ticket...")} className="inp !w-56 !py-2" />
          <button className="btn-dark !py-2">{L("Tìm")}</button>
        </form>
      </div>

      {tickets.length === 0 ? <div className="mt-5"><Empty text={L("Chưa có ticket nào")} /></div> : (
        <div className="card mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-slate-200 bg-slate-50"><tr>
              <th className="th">#</th><th className="th">{L("Vấn đề")}</th><th className="th">{L("Trạng thái")}</th><th className="th">{L("Cập nhật")}</th><th className="th"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono text-xs text-slate-400">#{t.id}</td>
                  <td className="td">
                    <div className="max-w-[420px] truncate font-semibold text-slate-800">{t.subject}</div>
                    <div className="text-xs text-slate-400">{`${L(T_CAT[t.category] || t.category)} · ${t._count.messages} ${L("tin nhắn")}`}</div>
                  </td>
                  <td className="td"><Badge cls={T_STATUS[t.status].cls}>{L(T_STATUS[t.status].label)}</Badge></td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">{dt(t.updatedAt)}</td>
                  <td className="td text-right"><Link href={`/dashboard/ticket/${t.id}`} className="text-sm font-semibold text-brand-600">{L("Xem")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form id="tao-ticket" action={createTicketAction} className="card mt-6 scroll-mt-24 space-y-4 p-6">
        <div className="font-bold text-slate-900">{L("Tạo ticket hỗ trợ")}</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="lbl">{L("Chủ đề")}</label>
            <select className="inp" name="category" defaultValue={searchParams.category || "other"}>
              <option value="smm">{L("Đơn SMM")}</option>
              <option value="premium">{L("Đơn Premium / bảo hành")}</option>
              <option value="deposit">{L("Nạp tiền")}</option>
              <option value="other">{L("Khác")}</option>
            </select>
          </div>
          <div>
            <label className="lbl">{L("Tiêu đề")}</label>
            <input className="inp" name="subject" required placeholder={L("Tóm tắt ngắn gọn vấn đề cần hỗ trợ")} defaultValue={searchParams.subject || ""} />
          </div>
        </div>
        <div>
          <label className="lbl">{L("Mô tả chi tiết")}</label>
          <textarea className="inp" name="body" rows={5} required placeholder={L("Mô tả chi tiết vấn đề bạn gặp phải, kèm mã đơn nếu có...")} defaultValue={searchParams.body || ""} />
        </div>
        <TicketAttachInput />
        <button className="btn-primary">{L("Gửi yêu cầu")}</button>
      </form>
    </div>
  );
}
