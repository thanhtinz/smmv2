import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Empty } from "@/components/ui";
import { RichText } from "@/components/rich-text";

export const dynamic = "force-dynamic";

/** Hỏi đáp thường gặp: đọc từ Bài viết thuộc danh mục slug "faq" để admin tự sửa/thêm.
 *  Khách panel thấy FAQ của panel mình nếu panel có đăng, không thì dùng FAQ của web mẹ. */
export default async function FaqPage() {
  const user = (await getCurrentUser())!;
  const cat = await prisma.postCategory.findUnique({ where: { slug: "faq" } });
  if (!cat) return <div><PageHead title="Hỏi đáp thường gặp" desc="Những câu hỏi khách hàng hay gặp nhất" /><Empty text="Chưa có câu hỏi nào" /></div>;
  let scopePid: number | null = user.panelId ?? null;
  if (scopePid) {
    const cnt = await prisma.post.count({ where: { published: true, categoryId: cat.id, panelId: scopePid } });
    if (cnt === 0) scopePid = null;
  }
  const posts = await prisma.post.findMany({
    where: { published: true, categoryId: cat.id, panelId: scopePid },
    orderBy: [{ pinned: "desc" }, { id: "asc" }],
    take: 100,
  });
  return (
    <div className="max-w-3xl">
      <PageHead title="Hỏi đáp thường gặp" desc="Những câu hỏi khách hàng hay gặp nhất — vẫn chưa rõ thì gửi ticket, đội hỗ trợ luôn sẵn sàng." />
      {posts.length === 0 ? <Empty text="Chưa có câu hỏi nào" /> : (
        <div className="space-y-3">
          {posts.map((p) => (
            <details key={p.id} className="card group p-5">
              <summary className="cursor-pointer list-none font-bold text-slate-900 marker:hidden">
                {p.title}
                <span className="float-right text-slate-300 transition group-open:rotate-45">+</span>
              </summary>
              <div className="mt-3 text-sm leading-relaxed text-slate-600">
                <RichText value={p.content} />
              </div>
            </details>
          ))}
        </div>
      )}
      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <div className="font-bold text-slate-900">Chưa tìm thấy câu trả lời?</div>
          <p className="text-sm text-slate-500">Gửi ticket để đội hỗ trợ trả lời trực tiếp cho bạn.</p>
        </div>
        <Link href="/dashboard/ticket#tao-ticket" className="btn-primary">Tạo ticket hỗ trợ</Link>
      </div>
    </div>
  );
}
