import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter, PublicHeader } from "@/components/site";
import { getSettings } from "@/lib/settings";
import { dshort } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PostsPage({ searchParams }: { searchParams: { cat?: string } }) {
  const s = await getSettings();
  if (s.module_blog === "0") notFound();
  const catId = searchParams.cat ? parseInt(searchParams.cat) : undefined;
  const [cats, posts] = await Promise.all([
    prisma.postCategory.findMany({ where: { active: true }, orderBy: { id: "asc" }, include: { _count: { select: { posts: { where: { published: true } } } } } }),
    prisma.post.findMany({ where: { published: true, ...(catId ? { categoryId: catId } : {}) }, orderBy: { id: "desc" }, take: 60, include: { category: true } }),
  ]);
  return (
    <div className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <h1 className="text-3xl font-extrabold text-slate-900">Bài viết</h1>
        <p className="mt-2 text-slate-500">Tin tức, hướng dẫn sử dụng và chương trình khuyến mãi mới nhất từ {s.site_name}.</p>
        {cats.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/bai-viet" className={`rounded-full px-4 py-2 text-sm font-semibold ${!catId ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>Tất cả</Link>
            {cats.map((c) => (
              <Link key={c.id} href={`/bai-viet?cat=${c.id}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${catId === c.id ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{c.name} ({c._count.posts})</Link>
            ))}
          </div>
        )}
        {posts.length === 0 ? (
          <div className="card mt-8 p-12 text-center text-slate-400">Chưa có bài viết nào trong mục này.</div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <Link key={p.id} href={`/bai-viet/${p.slug}`} className="card group overflow-hidden transition hover:shadow-lg">
                {p.coverUrl ? (
                  <img src={p.coverUrl} alt="" className="h-44 w-full object-cover" />
                ) : (
                  <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 text-4xl font-black text-white/90">{(p.title || "B").slice(0, 1)}</div>
                )}
                <div className="p-5">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {p.category && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-600">{p.category.name}</span>}
                    <span>{dshort(p.createdAt)}</span>
                  </div>
                  <h2 className="mt-2 line-clamp-2 font-bold text-slate-900 group-hover:text-brand-700">{p.title}</h2>
                  {p.excerpt && <p className="mt-1.5 line-clamp-3 text-sm text-slate-500">{p.excerpt}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
