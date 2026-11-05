import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter, PublicHeader } from "@/components/site";
import { ServicesExplorer, ServiceDTO } from "@/components/client";
import { getSession } from "@/lib/auth";
import { avgTimesFromRecentOrders } from "@/lib/avg-time";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  if ((await (await import("@/lib/settings")).getSettings()).module_smm === "0") {
    return (
      <div className="dark pub-dark bg-[#07090d] text-slate-300 flex min-h-screen flex-col">
        <PublicHeader />
        <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-12">
          <div className="card max-w-md p-8 text-center">
            <div className="text-lg font-bold text-slate-900">Mảng dịch vụ SMM đang tạm ngưng</div>
            <p className="mt-2 text-sm text-slate-500">Khu vực dịch vụ SMM hiện không mở bán. Vui lòng quay lại sau hoặc xem mảng Premium.</p>
            <Link href="/premium" className="btn-primary mt-5 inline-block">Xem Premium</Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }
  const session = await getSession();
  const services = await prisma.smmService.findMany({
    where: { active: true, panelId: null },
    include: { category: true },
    orderBy: [{ categoryId: "asc" }, { sort: "asc" }, { id: "asc" }],
  });
  const avgMap = await avgTimesFromRecentOrders(services.map((s) => s.id));
  const dto: ServiceDTO[] = services.map((s) => ({
    id: s.id, name: s.name, description: s.description, rate: s.rate, min: s.min, max: s.max,
    avgTime: avgMap.get(s.id) ?? s.avgTime, refill: s.refill, dripfeed: s.dripfeed, categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  return (
    <div className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-7xl mx-auto px-4 py-12 w-full">
        <h1 className="text-3xl font-extrabold text-slate-900">Bảng giá dịch vụ SMM</h1>
        <p className="text-slate-500 mt-2 mb-8">Giá tính trên 1000 lượt. {session ? "Bạn đã đăng nhập — bấm Đặt ngay để vào form đặt đơn." : "Đăng ký miễn phí để đặt đơn; cấp đại lý được chiết khấu thêm."}</p>
        <ServicesExplorer services={dto} orderMode={!!session} />
      </main>
      <SiteFooter />
    </div>
  );
}
