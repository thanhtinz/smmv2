import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Empty, I } from "@/components/ui";
import { RichText } from "@/components/rich-text";
import { getServerI18n } from "@/lib/lang-server";
import { getFloatingContacts, type FloatingContact } from "@/lib/contact";

export const dynamic = "force-dynamic";

/** Giá trị hiển thị của một kênh liên hệ, suy từ link đã chuẩn hoá
 *  (cùng cách suy của footer): tel: → số điện thoại; t.me → @tên; còn lại bỏ phần miền. */
function contactDisplay(c: FloatingContact): string {
  const h = c.href || "";
  if (h.startsWith("tel:")) return h.slice(4);
  const m = h.match(/^https?:\/\/(?:www\.)?([^/]+)\/(.+)$/);
  if (m) return m[1].includes("t.me") ? `@${m[2]}` : m[2];
  return h;
}

/** Hỏi đáp thường gặp: đọc từ Bài viết thuộc danh mục slug "faq" để admin tự sửa/thêm.
 *  Khách panel thấy FAQ của panel mình nếu panel có đăng, không thì dùng FAQ của web mẹ.
 *  Bố cục PC (lệnh Tín 2026-11-09 "cân bằng trên pc"): hết cảnh cột 768px trôi giữa
 *  khung 1096px — accordion ở cột rộng bên trái, cột phụ bên phải chứa thẻ gửi ticket
 *  (trước nằm ở đáy trang) và các kênh liên hệ admin cấu hình, dưới hai cột là dải
 *  link hỗ trợ khác full-width; mobile vẫn xếp dọc một cột như cũ. */
export default async function FaqPage() {
  const user = (await getCurrentUser())!;
  const { L } = await getServerI18n();
  const cat = await prisma.postCategory.findUnique({ where: { slug: "faq" } });
  if (!cat) return <div><PageHead title={L("Hỏi đáp thường gặp")} desc={L("Những câu hỏi khách hàng hay gặp nhất")} /><Empty text={L("Chưa có câu hỏi nào")} /></div>;
  const scopePid: number | null = null;
  const posts = await prisma.post.findMany({
    where: { published: true, categoryId: cat.id, panelId: scopePid },
    orderBy: [{ pinned: "desc" }, { id: "asc" }],
    take: 100,
  });
  const contacts = await getFloatingContacts().catch(() => [] as FloatingContact[]);
  const supportLinks = [
    { href: "/dashboard/ticket", label: L("Tạo ticket hỗ trợ"), icon: I.ticket },
    { href: "/dashboard/api-docs", label: L("Tài liệu API"), icon: I.code },
    { href: "/dashboard/bai-viet", label: L("Bài viết"), icon: I.book },
    { href: "/dashboard/nap-tien", label: L("Nạp tiền"), icon: I.wallet },
    { href: "/dashboard/dieu-khoan", label: L("Điều khoản sử dụng"), icon: I.file },
  ];
  return (
    <div>
      <PageHead title={L("Hỏi đáp thường gặp")} desc={L("Những câu hỏi khách hàng hay gặp nhất — vẫn chưa rõ thì gửi ticket, đội hỗ trợ luôn sẵn sàng.")} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {posts.length === 0 ? <Empty text={L("Chưa có câu hỏi nào")} /> : (
            <div className="space-y-3">
              {posts.map((p, i) => (
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
        <aside className="space-y-6">
          <div className="card p-5">
            <div className="font-bold text-slate-900">{L("Chưa tìm thấy câu trả lời?")}</div>
            <p className="mt-1 text-sm text-slate-500">{L("Gửi ticket để đội hỗ trợ trả lời trực tiếp cho bạn.")}</p>
            <Link href="/dashboard/ticket#tao-ticket" className="btn-primary mt-4 w-full justify-center">{L("Tạo ticket hỗ trợ")}</Link>
          </div>
          {contacts.length > 0 && (
            <div className="card p-5">
              <div className="font-bold text-slate-900">{L("Kênh liên hệ khác")}</div>
              <div className="mt-2">
                {contacts.map((c) => (
                  <a key={c.name} href={c.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50">
                    {c.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white" style={{ background: c.bg }}>{c.name.charAt(0).toUpperCase()}</span>
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-800">{c.name}</span>
                      <span className="block truncate text-xs text-slate-500">{contactDisplay(c)}</span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
      {/* Dải link hỗ trợ khác nằm full-width dưới hai cột: nếu để trong cột phụ,
          cột phụ cao hơn hẳn accordion (đo thật lệch ~340px); đưa xuống dưới dạng
          dải ngang thì hai cột chính kết thúc gần ngang nhau. */}
      <div className="card mt-6 p-5">
        <div className="font-bold text-slate-900">{L("Hỗ trợ khác")}</div>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {supportLinks.map((l) => (
            <Link key={l.href} href={l.href} className="flex items-center gap-2.5 rounded-full border border-slate-200 py-2 pl-2 pr-4 transition hover:border-brand-300 hover:bg-brand-50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 [&>svg]:h-4 [&>svg]:w-4">{l.icon}</span>
              <span className="text-sm font-bold text-slate-800">{l.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
