import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { OrderForm, ServiceDTO } from "@/components/client";
import { LEVEL_DISCOUNT } from "@/lib/format";
import { placeSmmOrderAction } from "@/app/actions/user";

export const dynamic = "force-dynamic";

export default async function OrderPage({ searchParams }: { searchParams: { service?: string; msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  const [services, categories] = await Promise.all([
    prisma.smmService.findMany({ where: { active: true }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }] }),
    prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
  ]);
  const dto: ServiceDTO[] = services.map((s) => ({
    id: s.id, name: s.name, description: s.description, rate: s.rate, min: s.min, max: s.max,
    avgTime: s.avgTime, refill: s.refill, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  const cats = categories.filter((c) => services.some((s) => s.categoryId === c.id)).map((c) => ({ id: c.id, name: c.name, platform: c.platform }));
  return (
    <div>
      <PageHead title="Đặt đơn SMM" desc="Chọn dịch vụ, dán link công khai và nhập số lượng — hệ thống tự đẩy qua nhà cung cấp hoặc hàng đợi xử lý tay tuỳ dịch vụ." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <OrderForm services={dto} categories={cats} discount={LEVEL_DISCOUNT[user.level] || 0} preselect={searchParams.service ? parseInt(searchParams.service) : undefined} action={placeSmmOrderAction} />
    </div>
  );
}
