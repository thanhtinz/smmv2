import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { dshort } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function DashPostDetail({ params }: { params: { slug: string } }) {
  const user = (await getCurrentUser())!;
  const panelLangRaw = user.panelId
    ? ((await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { langConfig: true } }))?.langConfig ?? null)
    : undefined;
  const { L, Ld } = await getServerI18n(panelLangRaw);
  if (!(await moduleOn("blog", user.panelId))) redirect("/dashboard");
  const post = await prisma.post.findUnique({ where: { slug: params.slug }, include: { category: true } });
  if (!post || !post.published) notFound();
  if (post.panelId !== null && post.panelId !== user.panelId) notFound();
  await prisma.post.update({ where: { id: post.id }, data: { views: { increment: 1 } } });
  const related = await prisma.post.findMany({
    where: { published: true, panelId: post.panelId, id: { not: post.id }, ...(post.categoryId ? { categoryId: post.categoryId } : {}) },
    orderBy: { id: "desc" }, take: 3,
  });
  const blocks = post.content.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Link href="/dashboard/bai-viet" className="text-sm font-medium text-brand-600">{L("← Tất cả bài viết")}</Link>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
        {post.category && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-600">{post.category.name}</span>}
        <span>{dshort(post.createdAt)}</span><span>·</span><span>{Ld(`${post.views + 1} lượt xem`)}</span>
      </div>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight text-slate-900">{post.title}</h1>
      {post.excerpt && <p className="mt-3 text-lg text-slate-500">{post.excerpt}</p>}
      {post.coverUrl && <img src={post.coverUrl} alt="" className="mt-6 w-full rounded-2xl object-cover" />}
      <article className="mt-8 space-y-4">
        {blocks.map((b, i) =>
          b.startsWith("## ") ? (
            <h2 key={i} className="pt-3 text-xl font-bold text-slate-900">{b.slice(3)}</h2>
          ) : (
            <p key={i} className="leading-relaxed text-slate-700">{b}</p>
          )
        )}
      </article>
      {related.length > 0 && (
        <div className="mt-12 border-t border-slate-100 pt-6">
          <div className="mb-4 font-bold text-slate-900">{L("Bài viết liên quan")}</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {related.map((r) => (
              <Link key={r.id} href={`/dashboard/bai-viet/${r.slug}`} className="card p-4 transition hover:shadow-md">
                <div className="line-clamp-2 font-semibold text-slate-800">{r.title}</div>
                <div className="mt-1 text-xs text-slate-400">{dshort(r.createdAt)}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
