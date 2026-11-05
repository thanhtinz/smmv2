import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PublicHeader, SiteFooter } from "@/components/site";
import { getSettings } from "@/lib/settings";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Bài viết trên gian hàng con — chỉ bài của đúng panel này, đã đăng. */
export default async function PanelStorePosts({ params }: { params: { slug: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel) notFound();
  if ((await getSettings()).module_blog === "0" || !panel.moduleBlog) notFound();
  const posts = await prisma.post.findMany({ where: { panelId: panel.id, published: true }, orderBy: { createdAt: "desc" }, take: 60, include: { category: true } });
  return (
    <div data-accent={panel.accent} className="dark pub-dark min-h-screen bg-[#07090d] text-slate-300">
      <PublicHeader panel={{ name: panel.name, slug: panel.slug }} announcement={panel.announcement} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6">
        <h1 className="text-2xl font-extrabold text-white">Bài viết</h1>
        <p className="mt-1 text-sm text-slate-400">Tin tức và hướng dẫn từ {panel.name}.</p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.id} href={`/cua-hang/${panel.slug}/bai-viet/${p.slug}`} className="card group overflow-hidden !p-0">
              {p.coverUrl
                ? <img src={p.coverUrl} alt="" className="h-40 w-full object-cover" />
                : <div className="flex h-40 items-center justify-center bg-slate-800 text-3xl font-black text-slate-600">{p.title.charAt(0)}</div>}
              <div className="p-5">
                {p.category && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300">{p.category.name}</span>}
                <div className="mt-2.5 line-clamp-2 font-bold text-white group-hover:underline">{p.title}</div>
                {p.excerpt && <p className="mt-1.5 line-clamp-2 text-sm text-slate-400">{p.excerpt}</p>}
                <div className="mt-3 text-xs text-slate-500">{dt(p.createdAt)}</div>
              </div>
            </Link>
          ))}
        </div>
        {posts.length === 0 && <div className="card mt-8 p-12 text-center text-slate-400">Gian hàng chưa có bài viết nào.</div>}
      </main>
      <SiteFooter brand={{ slug: panel.slug, name: panel.name, tagline: panel.tagline, zalo: panel.supportZalo, telegram: panel.supportTelegram, facebook: panel.supportFacebook, hotline: panel.supportHotline }} />
    </div>
  );
}
