import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { PageHead, Flash, Badge, Empty, Stat, I } from "@/components/ui";
import { createTicketAction } from "@/app/actions/user";
import { dt, num } from "@/lib/format";

export const dynamic = "force-dynamic";
const T_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Chờ phản hồi", cls: "bg-amber-100 text-amber-800" },
  ANSWERED: { label: "Đã phản hồi", cls: "bg-emerald-100 text-emerald-800" },
  CLOSED: { label: "Đã đóng", cls: "bg-slate-200 text-slate-600" },
};
const T_CAT: Record<string, string> = { smm: "Đơn SMM", premium: "Đơn Premium / bảo hành", deposit: "Nạp tiền", other: "Khác" };

/** Hỗ trợ — bố cục theo panel mẫu: thẻ thống kê, nút lọc theo trạng thái (có số lượng),
 *  tìm kiếm, bảng ticket và form tạo ở cuối trang. */
export default async function TicketsPage({ searchParams }: { searchParams: { msg?: string; err?: string; st?: string; q?: string } }) {
  const user = (await getCurrentUser())!;
  if (!(await moduleOn("tickets", user.panelId))) { const { redirect } = await import("next/navigation"); redirect("/dashboard"); }
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
        <PageHead title="Hỗ trợ" desc="Quản lý ticket hỗ trợ của bạn" />
        <div className="flex gap-2 pt-1">
          <Link href="/dashboard/ticket" className="btn-ghost">Làm mới</Link>
          <a href="#tao-ticket" className="btn-primary">+ Tạo ticket mới</a>
        </div>
      </div>
      <Flash msg={searchParams.msg} err={searchParams.err} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Tổng số ticket" value={num(total)} icon={I.ticket} />
        <Stat label="Chờ phản hồi" value={num(c("OPEN"))} icon={I.clock} />
        <Stat label="Đã phản hồi" value={num(c("ANSWERED"))} icon={I.check} />
        <Stat label="Đã đóng" value={num(c("CLOSED"))} icon={I.db} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {pills.map((p) => (
          <Link key={p.st} href={`/dashboard/ticket${p.st ? `?st=${p.st}` : ""}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${st === p.st ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
            {p.label} ({p.n})
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          {st && <input type="hidden" name="st" value={st} />}
          <input name="q" defaultValue={q} placeholder="Tìm kiếm ticket..." className="inp !w-56 !py-2" />
          <button className="btn-dark !py-2">Tìm</button>
        </form>
      </div>

      {tickets.length === 0 ? <div className="mt-5"><Empty text="Chưa có ticket nào" /></div> : (
        <div className="card mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-slate-200 bg-slate-50"><tr>
              <th className="th">#</th><th className="th">Vấn đề</th><th className="th">Trạng thái</th><th className="th">Cập nhật</th><th className="th"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="td font-mono text-xs text-slate-400">#{t.id}</td>
                  <td className="td">
                    <div className="max-w-[420px] truncate font-semibold text-slate-800">{t.subject}</div>
                    <div className="text-xs text-slate-400">{T_CAT[t.category] || t.category} · {t._count.messages} tin nhắn</div>
                  </td>
                  <td className="td"><Badge cls={T_STATUS[t.status].cls}>{T_STATUS[t.status].label}</Badge></td>
                  <td className="td whitespace-nowrap text-xs text-slate-500">{dt(t.updatedAt)}</td>
                  <td className="td text-right"><Link href={`/dashboard/ticket/${t.id}`} className="text-sm font-semibold text-brand-600">Xem</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form id="tao-ticket" action={createTicketAction} className="card mt-6 scroll-mt-24 space-y-4 p-6">
        <div className="font-bold text-slate-900">Tạo ticket hỗ trợ</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <input className="inp" name="subject" required placeholder="Tóm tắt ngắn gọn vấn đề cần hỗ trợ" />
          </div>
        </div>
        <div>
          <label className="lbl">Mô tả chi tiết</label>
          <textarea className="inp" name="body" rows={5} required placeholder="Mô tả chi tiết vấn đề bạn gặp phải, kèm mã đơn nếu có..." />
        </div>
        <button className="btn-primary">Gửi yêu cầu</button>
      </form>
    </div>
  );
}
