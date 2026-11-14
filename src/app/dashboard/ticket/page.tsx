import Link from "next/link";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { PageHead, Flash, Badge, Empty, Stat, I } from "@/components/ui";
import { createTicketAction } from "@/app/actions/user";
import { TicketAttachInput } from "@/components/ticket-attach";
import { RichText } from "@/components/rich-text";
import { getFloatingContacts, type FloatingContact } from "@/lib/contact";
import { dt, num } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";
const T_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "Chờ phản hồi", cls: "bg-amber-100 text-amber-800" },
  ANSWERED: { label: "Đã phản hồi", cls: "bg-emerald-100 text-emerald-800" },
  CLOSED: { label: "Đã đóng", cls: "bg-slate-200 text-slate-600" },
};
const T_CAT: Record<string, string> = { smm: "Đơn hàng", premium: "Đơn Premium / bảo hành", deposit: "Nạp tiền", other: "Khác" };

/** Giá trị hiển thị của một kênh liên hệ, suy từ link đã chuẩn hoá
 *  (cùng cách suy của footer): tel: → số điện thoại; t.me → @tên; còn lại bỏ phần miền. */
function contactDisplay(c: FloatingContact): string {
  const h = c.href || "";
  if (h.startsWith("tel:")) return h.slice(4);
  const m = h.match(/^https?:\/\/(?:www\.)?([^/]+)\/(.+)$/);
  if (m) return m[1].includes("t.me") ? `@${m[2]}` : m[2];
  return h;
}

/** Hỗ trợ — MỘT trang duy nhất (gộp FAQ vào đây theo lệnh Tín 2026-11-09 19:12
 *  "gộp cái câu hỏi đó vào cái ticket luôn cho gọn"): trên cùng là mục Câu hỏi
 *  thường gặp (accordion đọc từ Bài viết danh mục slug "faq", admin sửa ở
 *  Admin → Bài viết) + cột liên hệ admin cấu hình; dưới là danh sách ticket
 *  của khách. FORM tạo ticket nằm LUÔN trong cột phụ ở đầu trang, hiện sẵn
 *  (lệnh Tín 20:28 cùng ngày — "đưa cái form lên đó luôn đi chứ tự nhiên bấm
 *  nút rồi nhảy xuống đó": bỏ hẳn nút bấm mở form + cú nhảy cuộn của bản
 *  19:40). Neo #tao-ticket trỏ thẳng vào thẻ form này; link điền trước
 *  subject/category/body từ chi tiết đơn (Báo lỗi đơn / Yêu cầu hoàn tiền)
 *  mở trang là thấy form đã điền sẵn ở cột phụ. Route /dashboard/faq cũ
 *  redirect về đây kèm neo #faq. */
export default async function TicketsPage( { searchParams: searchParamsPromise }: { searchParams: Promise<{ msg?: string; err?: string; st?: string; q?: string; subject?: string; category?: string; body?: string }> }) {
  const searchParams = await searchParamsPromise;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { L, Ld } = await getServerI18n();
  if (!(await moduleOn("tickets"))) { const { redirect } = await import("next/navigation"); redirect("/"); }
  const st = searchParams.st && T_STATUS[searchParams.st] ? searchParams.st : "";
  const q = (searchParams.q || "").trim();
  const faqCat = await prisma.postCategory.findUnique({ where: { slug: "faq" } });
  const [counts, tickets, faqPosts, contacts] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    prisma.ticket.findMany({
      where: { userId: user.id, ...(st ? { status: st as any } : {}), ...(q ? { subject: { contains: q, mode: "insensitive" } } : {}) },
      orderBy: { updatedAt: "desc" }, take: 30, include: { _count: { select: { messages: true } } },
    }),
    faqCat
      ? prisma.post.findMany({ where: { published: true, categoryId: faqCat.id, panelId: null }, orderBy: [{ pinned: "desc" }, { id: "asc" }], take: 100 })
      : Promise.resolve([]),
    getFloatingContacts().catch(() => [] as FloatingContact[]),
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
        <PageHead title={L("Hỗ trợ")} desc={L("Câu hỏi thường gặp, kênh liên hệ và ticket hỗ trợ của bạn")} />
        <div className="flex gap-2 pt-1">
          <Link href="/dashboard/ticket" className="btn-ghost">{L("Làm mới")}</Link>
        </div>
      </div>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      {/* MỤC FAQ + FORM TẠO TICKET — lưới 2 cột trên PC: accordion ở cột rộng
          (hàng 1), FORM tạo ticket nằm luôn ở cột phụ 320px (hiện sẵn không
          nút bấm — neo #tao-ticket trỏ vào thẻ form), thẻ kênh liên hệ ở
          hàng 2 dưới accordion. Form TRẢI 2 HÀNG của lưới: nếu không, chiều
          cao hàng 1 bị form (cao hơn accordion) đội lên và thẻ liên hệ bị
          đẩy xuống dưới đáy form, sinh khoảng chết dưới accordion (đo thật
          lệch 206px); trải hàng thì cột trái xếp theo chiều cao thật của
          nó và hai cột kết thúc gần ngang nhau. Mobile xếp dọc theo đúng
          thứ tự DOM: FAQ → form → liên hệ. */}
      <section id="faq" className="scroll-mt-24">
        <h2 className="text-base font-bold text-slate-900">{L("Câu hỏi thường gặp")}</h2>
        <p className="mb-4 mt-0.5 text-sm text-slate-500">{L("Những câu hỏi khách hàng hay gặp nhất")}</p>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            {faqPosts.length === 0 ? <Empty text={L("Chưa có câu hỏi nào")} /> : (
              <div className="space-y-3">
                {faqPosts.map((p, i) => (
                  <details key={p.id} open={i === 0} className="card group overflow-hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                      <span className="text-[15px] font-bold leading-snug text-slate-900">{p.title}</span>
                      <span className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180">{I.chevron}</span>
                    </summary>
                    <div className="border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-600">
                      <RichText value={p.content} />
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
          <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <form id="tao-ticket" action={createTicketAction} className="card scroll-mt-24 space-y-4 p-5">
              <div>
                <div className="font-bold text-slate-900">{L("Tạo ticket hỗ trợ")}</div>
                <p className="mt-1 text-sm text-slate-500">{L("Gửi ticket để đội hỗ trợ trả lời trực tiếp cho bạn.")}</p>
              </div>
              <div>
                <label className="lbl">{L("Chủ đề")}</label>
                <select className="inp" name="category" defaultValue={searchParams.category || "other"}>
                  <option value="premium">{L("Đơn Premium / bảo hành")}</option>
                  <option value="deposit">{L("Nạp tiền")}</option>
                  <option value="other">{L("Khác")}</option>
                </select>
              </div>
              <div>
                <label className="lbl">{L("Tiêu đề")}</label>
                <input className="inp" name="subject" required placeholder={L("Tóm tắt ngắn gọn vấn đề cần hỗ trợ")} defaultValue={searchParams.subject || ""} />
              </div>
              <div>
                <label className="lbl">{L("Mô tả chi tiết")}</label>
                <textarea className="inp" name="body" rows={6} required placeholder={L("Mô tả chi tiết vấn đề bạn gặp phải, kèm mã đơn nếu có...")} defaultValue={searchParams.body || ""} />
              </div>
              <TicketAttachInput />
              <button className="btn-primary w-full justify-center">{L("Gửi yêu cầu")}</button>
            </form>
          </aside>
          {contacts.length > 0 && (
            <div className="card p-5 lg:col-start-1 lg:row-start-2">
              <div className="font-bold text-slate-900">{L("Kênh liên hệ khác")}</div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
                {contacts.map((ct) => (
                  <a key={ct.name} href={ct.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50">
                    {ct.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ct.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: ct.bg }}>{ct.name.charAt(0).toUpperCase()}</span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-800">{ct.name}</span>
                      <span className="block truncate text-xs text-slate-500">{contactDisplay(ct)}</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* DANH SÁCH TICKET — giữ nguyên hành vi cũ (thống kê, lọc, tìm, bảng). */}
      <h2 className="mb-4 mt-10 text-base font-bold text-slate-900">{L("Ticket của bạn")}</h2>
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

    </div>
  );
}
