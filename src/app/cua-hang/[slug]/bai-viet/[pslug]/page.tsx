import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PublicHeader, SiteFooter } from "@/components/site";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Chi tiết bài viết của gian hàng con. */
export default async function PanelStorePostDetail({ params }: { params: { slug: string; pslug: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel) notFound();
  const post = await prisma.post.findFirst({ where: { slug: params.pslug, panelId: panel.id, published: true }, include: { category: true } });
  if (!post) notFound();
  await prisma.post.update({ where: { id: post.id }, data: { views: { increment: 1 } } });
  const related = await prisma.post.findMany({ where: { panelId: panel.id, published: true, id: { not: post.id } }, orderBy: { createdAt: "desc" }, take: 3 });
  return (
    <div data-accent={panel.accent} className="dark pub-dark min-h-screen bg-[#07090d] text-slate-300">
      <PublicHeader panel={{ name: panel.name, slug: panel.slug }} announcement={panel.announcement} />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-6">
        <Link href={`/cua-hang/${panel.slug}/bai-viet`} className="text-sm font-semibold text-slate-400 hover:text-white">← Tất cả bài viết</Link>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight text-white">{post.title}</h1>
        <div className="mt-2 text-sm text-slate-500">{dt(post.createdAt)}{post.category ? ` · ${post.category.name}` : ""}</div>
        {post.coverUrl && <img src={post.coverUrl} alt="" className="mt-6 w-full rounded-2xl object-cover" />}
        <div className="mt-8 space-y-4 leading-relaxed text-slate-300">
          {post.content.split(/\n+/).filter(Boolean).map((line, i) =>
            line.startsWith("## ")
              ? <h2 key={i} className="pt-3 text-xl font-bold text-white">{line.slice(3)}</h2>
              : <p key={i}>{line}</p>
          )}
        </div>
        {related.length > 0 && (
          <div className="mt-12 border-t border-white/10 pt-8">
            <div className="mb-4 font-bold text-white">Bài viết khác</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {related.map((p) => (
                <Link key={p.id} href={`/cua-hang/${panel.slug}/bai-viet/${p.slug}`} className="card !p-4">
                  <div className="line-clamp-2 font-bold text-white">{p.title}</div>
                  <div className="mt-2 text-xs text-slate-500">{dt(p.createdAt)}</div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
      <SiteFooter brand={{ slug: panel.slug, name: panel.name, tagline: panel.tagline, zalo: panel.supportZalo, telegram: panel.supportTelegram, facebook: panel.supportFacebook, hotline: panel.supportHotline }} />
    </div>
  );
}
