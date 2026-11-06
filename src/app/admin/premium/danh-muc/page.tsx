import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { PremiumCategoriesClient } from "@/components/admin-premium";

export const dynamic = "force-dynamic";

export default async function AdminPremiumCategories({ searchParams }: { searchParams: { q?: string; status?: string; msg?: string; err?: string } }) {
  await requireAdminPage();
  const where: any = {};
  if (searchParams.q) where.OR = [{ name: { contains: searchParams.q, mode: "insensitive" } }, { slug: { contains: searchParams.q.toLowerCase(), mode: "insensitive" } }];
  if (searchParams.status === "on") where.active = true;
  if (searchParams.status === "off") where.active = false;
  const cats = await prisma.premiumCategory.findMany({ where, orderBy: [{ sort: "asc" }, { id: "asc" }], include: { _count: { select: { products: true } } } });
  const dtos = cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, icon: c.icon, sort: c.sort, active: c.active, productCount: c._count.products }));
  return (
    <div>
      <PageHead title="Quản lý Danh mục Premium" desc="Quản lý các danh mục sản phẩm Premium" />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form method="get" className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <input name="q" defaultValue={searchParams.q || ""} className="inp min-w-[220px] flex-1" placeholder="Tìm theo tên danh mục hoặc slug..." />
        <select name="status" defaultValue={searchParams.status || ""} className="inp !w-44">
          <option value="">Tất cả trạng thái</option>
          <option value="on">Đang hoạt động</option>
          <option value="off">Tạm dừng</option>
        </select>
        <button className="btn-primary btn-sm !px-4 !py-2.5">Tìm kiếm</button>
      </form>
      <PremiumCategoriesClient categories={dtos} />
    </div>
  );
}
