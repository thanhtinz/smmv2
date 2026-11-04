import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter } from "@/components/site";
import { ServicesExplorer, ServiceDTO } from "@/components/client";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const session = await getSession();
  const services = await prisma.smmService.findMany({
    where: { active: true },
    include: { category: true },
    orderBy: [{ categoryId: "asc" }, { sort: "asc" }, { id: "asc" }],
  });
  const dto: ServiceDTO[] = services.map((s) => ({
    id: s.id, name: s.name, description: s.description, rate: s.rate, min: s.min, max: s.max,
    avgTime: s.avgTime, refill: s.refill, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-12 w-full">
        <h1 className="text-3xl font-extrabold text-slate-900">Bảng giá dịch vụ SMM</h1>
        <p className="text-slate-500 mt-2 mb-8">Giá tính trên 1000 lượt. {session ? "Bạn đã đăng nhập — bấm Đặt ngay để vào form đặt đơn." : "Đăng ký miễn phí để đặt đơn; cấp đại lý được chiết khấu thêm."}</p>
        <ServicesExplorer services={dto} orderMode={!!session} />
      </main>
      <SiteFooter />
    </div>
  );
}
