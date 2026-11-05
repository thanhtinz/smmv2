import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { PanelPostsClient, type PanelPostDTO } from "@/components/panel-features";

export const dynamic = "force-dynamic";

/** Bài viết riêng của gian hàng — hiện ở mục Bài viết trên storefront của panel. */
export default async function PanelPostsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const panel = (await prisma.childPanel.findUnique({ where: { ownerId: user.id } }))!;
  const [posts, categories] = await Promise.all([
    prisma.post.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" } }),
    prisma.postCategory.findMany({ where: { active: true }, orderBy: { id: "asc" }, select: { id: true, name: true } }),
  ]);
  const dtos: PanelPostDTO[] = posts.map((p) => ({ id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.content, coverUrl: p.coverUrl, categoryId: p.categoryId, published: p.published, views: p.views, createdAt: p.createdAt }));
  return (
    <div>
      <PageHead title="Bài viết gian hàng" desc="Tin tức, hướng dẫn, khuyến mãi hiển thị trên gian hàng của bạn." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <PanelPostsClient posts={dtos} categories={categories} />
    </div>
  );
}
