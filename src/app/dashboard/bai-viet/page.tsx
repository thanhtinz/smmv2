import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { dshort } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/* Bài viết nằm TRONG khu khách (lệnh Tín 2026-11-05): khách panel thấy bài của
   panel mình; panel chưa có bài nào thì thấy bài của web mẹ. */
export default async function DashPostsPage({ searchParams }: { searchParams: { cat?: string; q?: string } }) {
  const user = (await getCurrentUser())!;
  const panelLangRaw = user.panelId
    ? ((await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { langConfig: true } }))?.langConfig ?? null)
    : undefined;
  const { L, Ld } = await getServerI18n(panelLangRaw);
  if (!(await moduleOn("blog", user.panelId))) redirect("/dashboard");
  let scopePid: number | null = user.panelId ?? null;
  if (scopePid) {
    const cnt = await prisma.post.count({ where: { published: true, panelId: scopePid } });
    if (cnt === 0) scopePid = null;
  }
  const catId = searchParams.cat ? parseInt(searchParams.cat) : undefined;
  const q = (searchParams.q || "").trim();
  const showPinned = !catId && !q;
  const pinned = showPinned
    ? await prisma.post.findMany({ where: { published: true, pinned: true, panelId: scopePid }, orderBy: { id: "desc" }, take: 4, include: { category: true } })
    : [];
  const [cats, posts] = await Promise.all([
    prisma.postCategory.findMany({ where: { active: true }, orderBy: { id: "asc" }, include: { _count: { select: { posts: { where: { published: true, panelId: scopePid } } } } } }),
    prisma.post.findMany({ where: { published: true, panelId: scopePid, ...(catId ? { categoryId: catId } : {}), ...(q ? { title: { contains: q, mode: "insensitive" } } : {}), ...(pinned.length ? { id: { notIn: pinned.map((p) => p.id) } } : {}) }, orderBy: { id: "desc" }, take: 60, include: { category: true } }),
  ]);
  const card = (p: (typeof posts)[number]) => (
    <Link key={p.id} href={`/dashboard/bai-viet/${p.slug}`} className="card group overflow-hidden transition hover:shadow-lg">
      {p.coverUrl ? (
        <img src={p.coverUrl} alt="" className="h-44 w-full object-cover" />
      ) : (
        <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-brand-500 to-brand-700 text-4xl font-black text-white/90">{(p.title || "B").slice(0, 1)}</div>
      )}
      <div className="p-5">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {p.category && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-600">{p.category.name}</span>}
          <span>{dshort(p.createdAt)}</span>
          <span className="ml-auto">{`${p.views} ${L("lượt xem")}`}</span>
        </div>
        <h2 className="mt-2 line-clamp-2 font-bold text-slate-900 group-hover:text-brand-700">{p.title}</h2>
        {p.excerpt && <p className="mt-1.5 line-clamp-3 text-sm text-slate-500">{p.excerpt}</p>}
      </div>
    </Link>
  );
  return (
    <div>
      <h1 className="text-2xl font-extrabold text-slate-900">{L("Bài viết")}</h1>
      <p className="mt-1.5 text-sm text-slate-500">{L("Tin tức, hướng dẫn sử dụng và chương trình khuyến mãi mới nhất.")}</p>
      {cats.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard/bai-viet" className={`rounded-full px-4 py-2 text-sm font-semibold ${!catId ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{L("Tất cả")}</Link>
          {cats.map((c) => (
            <Link key={c.id} href={`/dashboard/bai-viet?cat=${c.id}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${catId === c.id ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>{c.name} ({c._count.posts})</Link>
          ))}
        </div>
      )}
      <form method="get" className="mt-4 flex max-w-md gap-2">
        {catId ? <input type="hidden" name="cat" value={catId} /> : null}
        <input name="q" defaultValue={q} placeholder={L("Tìm kiếm bài viết...")} className="inp flex-1" />
        <button className="btn-primary !py-2">{L("Tìm")}</button>
      </form>
      {pinned.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-extrabold text-slate-900">{L("Bài viết ghim")}</h2>
          <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">{pinned.map(card)}</div>
        </>
      )}
      {posts.length === 0 && pinned.length === 0 ? (
        <div className="card mt-8 p-12 text-center text-slate-400">{L("Chưa có bài viết nào trong mục này.")}</div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {posts.map(card)}
        </div>
      )}
    </div>
  );
}
