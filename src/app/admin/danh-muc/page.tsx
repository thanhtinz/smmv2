import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHead, Flash } from "@/components/ui";
import { CategoriesClient, type CategoryDTO } from "@/components/admin-catalog";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminCategories({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const categories = await prisma.smmCategory.findMany({
    orderBy: [{ platform: "asc" }, { sort: "asc" }, { id: "asc" }],
    include: { _count: { select: { services: true } } },
  });
  const dtos: CategoryDTO[] = categories.map((c) => ({ id: c.id, platform: c.platform, name: c.name, sort: c.sort, active: c.active, serviceCount: c._count.services }));
  return (
    <div>
      <PageHead title={L("Quản lý Danh mục SMM")} desc={L("Nhóm các dịch vụ theo nền tảng xã hội · Kéo thả để sắp xếp")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <CategoriesClient categories={dtos} />
    </div>
  );
}
