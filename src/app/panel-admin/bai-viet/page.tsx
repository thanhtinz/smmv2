import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { PanelPostsClient, type PanelPostDTO } from "@/components/panel-features";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Bài viết riêng của website — hiện ở mục Bài viết trên storefront của panel. */
export default async function PanelPostsPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const [posts, categories] = await Promise.all([
    prisma.post.findMany({ where: { panelId: panel.id }, orderBy: { createdAt: "desc" } }),
    prisma.postCategory.findMany({ where: { active: true }, orderBy: { id: "asc" }, select: { id: true, name: true } }),
  ]);
  const dtos: PanelPostDTO[] = posts.map((p) => ({ id: p.id, title: p.title, slug: p.slug, excerpt: p.excerpt, content: p.content, coverUrl: p.coverUrl, categoryId: p.categoryId, published: p.published, views: p.views, createdAt: p.createdAt }));
  return (
    <div>
      <PageHead title={L("Bài viết website")} desc={L("Tin tức, hướng dẫn, khuyến mãi hiển thị trên website của bạn.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <PanelPostsClient posts={dtos} categories={categories} />
    </div>
  );
}
