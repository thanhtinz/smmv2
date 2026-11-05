import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash } from "@/components/ui";
import { CategoriesClient, type CategoryDTO } from "@/components/admin-catalog";

export const dynamic = "force-dynamic";

export default async function AdminCategories({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const categories = await prisma.smmCategory.findMany({
    orderBy: [{ platform: "asc" }, { sort: "asc" }, { id: "asc" }],
    include: { _count: { select: { services: true } } },
  });
  const dtos: CategoryDTO[] = categories.map((c) => ({ id: c.id, platform: c.platform, name: c.name, sort: c.sort, active: c.active, serviceCount: c._count.services }));
  return (
    <div>
      <PageHead title="Quản lý Danh mục SMM" desc="Nhóm các dịch vụ theo nền tảng xã hội · Kéo thả để sắp xếp" />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <CategoriesClient categories={dtos} />
    </div>
  );
}
