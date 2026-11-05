import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { PanelServicesClient, type PanelServiceDTO } from "@/components/panel-admin-client";
import { PanelPremiumTable, PanelAddedServicesClient, type PanelPremiumRowDTO, type PanelAddedServiceDTO, type PanelSourceServiceDTO, type PanelCategoryDTO } from "@/components/panel-features";
import { updatePanelAction } from "@/app/actions/user";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Dịch vụ & Giá — dịch vụ đồng bộ từ web mẹ (chủ panel chỉnh giá bán) cộng với
 *  các dịch vụ chủ panel thêm vào gian hàng, nguồn lấy từ dịch vụ có sẵn của web mẹ. */
export default async function PanelServicesPage({ searchParams }: { searchParams: { msg?: string; err?: string; q?: string } }) {
  const { user, panel } = await requirePanelOwnerPage();
  const q = (searchParams.q || "").trim();
  const [services, overrides, totalServices, premiumVariants, premiumOverrides] = await Promise.all([
    prisma.smmService.findMany({
      where: { active: true, panelId: null, ...(q ? { name: { contains: q } } : {}) },
      orderBy: { id: "asc" }, take: 200,
      select: { id: true, name: true, rate: true, min: true, max: true, category: { select: { name: true } } },
    }),
    prisma.panelServicePrice.findMany({ where: { panelId: panel.id }, orderBy: { id: "asc" } }),
    prisma.smmService.count({ where: { active: true, panelId: null } }),
    prisma.premiumVariant.findMany({ where: { active: true, product: { active: true } }, orderBy: [{ productId: "asc" }, { sort: "asc" }], include: { product: { select: { name: true } } } }),
    prisma.panelPremiumPrice.findMany({ where: { panelId: panel.id } }),
  ]);
  const preOvMap = new Map(premiumOverrides.map((o) => [o.variantId, o.price]));
  const premiumRows: PanelPremiumRowDTO[] = premiumVariants.map((v) => {
    const memberUnit = Math.round(v.price * (1 + panel.markup / 100));
    const memberFinal = Math.max(1, Math.round(memberUnit * (1 - panel.discountMember / 100)));
    return { variantId: v.id, productName: v.product.name, variantName: v.name, motherPrice: v.price, panelPrice: memberFinal, override: preOvMap.get(v.id) ?? null };
  });
  const [addedRows, sourceRows, categoryRows] = await Promise.all([
    prisma.smmService.findMany({
      where: { panelId: panel.id },
      include: { category: true, _count: { select: { orders: true } } },
      orderBy: { id: "desc" },
    }),
    prisma.smmService.findMany({
      where: { active: true, panelId: null },
      orderBy: { id: "asc" }, take: 300,
      select: { id: true, name: true, rate: true, providerId: true, providerServiceId: true, category: { select: { name: true } } },
    }),
    prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
  ]);
  const srcByKey = new Map(sourceRows.filter((x) => x.providerId && x.providerServiceId).map((x) => [`${x.providerId}:${x.providerServiceId}`, x]));
  const addedDtos: PanelAddedServiceDTO[] = addedRows.map((sv) => {
    const src = sv.providerId && sv.providerServiceId ? srcByKey.get(`${sv.providerId}:${sv.providerServiceId}`) : undefined;
    return {
      id: sv.id, name: sv.name, rate: sv.rate, min: sv.min, max: sv.max, description: sv.description, active: sv.active,
      categoryName: sv.category.name, sourceName: sv.fulfillment === "MANUAL" && !sv.providerId ? null : (src?.name || "Nguồn API web mẹ"),
      sourceRate: src ? src.rate : (sv.costRate > 0 ? sv.costRate : null), fulfillment: sv.fulfillment, orderCount: sv._count.orders,
    };
  });
  const sourceDtos: PanelSourceServiceDTO[] = sourceRows.map((x) => ({ id: x.id, name: x.name, rate: x.rate, categoryName: x.category.name }));
  const categoryDtos: PanelCategoryDTO[] = categoryRows.map((c) => ({ id: c.id, name: c.name, platform: c.platform }));
  const panelRate = (r: number) => Math.round(r * (1 + panel.markup / 100));
  const discountOf: Record<string, number> = { MEMBER: panel.discountMember, RESELLER: panel.discountReseller, AGENCY: panel.discountAgency, VIP: panel.discountVip };
  const ovByService = new Map<number, Record<string, number>>();
  for (const o of overrides) {
    const rec = ovByService.get(o.serviceId) || {};
    rec[o.level] = o.price;
    ovByService.set(o.serviceId, rec);
  }
  const dtos: PanelServiceDTO[] = services.map((s) => {
    const base = panelRate(s.rate);
    const suggested: Record<string, number> = {};
    for (const lv of Object.keys(discountOf)) suggested[lv] = Math.round(base * (1 - discountOf[lv] / 100));
    return { id: s.id, name: s.name, categoryName: s.category?.name || "—", min: s.min, max: s.max, motherRate: s.rate, panelRate: base, suggested, overrides: ovByService.get(s.id) || {} };
  });
  return (
    <div>
      <PageHead title="Dịch vụ & Giá" desc={`Dịch vụ đồng bộ từ web mẹ — chỉnh giá bán tại đây. Đang có ${num(totalServices)} dịch vụ của web mẹ.`} />
      <Flash msg={searchParams.msg} err={searchParams.err} />

      <div className="card mb-6 p-6">
        <div className="font-bold text-slate-900">Giá chung của panel</div>
        <form action={updatePanelAction} className="mt-4 grid grid-cols-2 items-end gap-4 lg:grid-cols-5">
          <input type="hidden" name="back" value="/panel-admin/dich-vu" />
          <div><label className="lbl">Phụ phí (%)</label><input className="inp" name="markup" type="number" min={0} max={200} defaultValue={panel.markup} /></div>
          <div><label className="lbl">Giảm — Thành viên (%)</label><input className="inp" name="discountMember" type="number" min={0} max={90} defaultValue={panel.discountMember} /></div>
          <div><label className="lbl">Giảm — Đại lý (%)</label><input className="inp" name="discountReseller" type="number" min={0} max={90} defaultValue={panel.discountReseller} /></div>
          <div><label className="lbl">Giảm — Tổng đại lý (%)</label><input className="inp" name="discountAgency" type="number" min={0} max={90} defaultValue={panel.discountAgency} /></div>
          <div className="flex items-end gap-3">
            <div className="flex-1"><label className="lbl">Giảm — VIP (%)</label><input className="inp" name="discountVip" type="number" min={0} max={90} defaultValue={panel.discountVip} /></div>
            <button className="btn-primary shrink-0 !py-2.5">Lưu giá</button>
          </div>
        </form>
      </div>

      <form method="get" className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <input name="q" defaultValue={q} className="inp min-w-[220px] flex-1" placeholder="Tìm dịch vụ..." />
        <button className="btn-primary btn-sm !px-4 !py-2.5">Tìm kiếm</button>
        {totalServices > services.length && <span className="text-xs text-slate-400">Đang hiển thị {services.length}/{num(totalServices)} dịch vụ — dùng ô tìm kiếm để thu hẹp.</span>}
      </form>

      <PanelServicesClient services={dtos} />

      <div className="mb-4 mt-10 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-extrabold text-slate-900">Dịch vụ đã thêm</h2>
        <span className="text-sm text-slate-400">Thêm dịch vụ vào gian hàng của bạn — nguồn lấy từ dịch vụ có sẵn của web mẹ, hoặc dịch vụ thủ công do bạn tự xử lý đơn.</span>
      </div>
      <PanelAddedServicesClient services={addedDtos} sources={sourceDtos} categories={categoryDtos} />

      <div className="mb-4 mt-10 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-extrabold text-slate-900">Giá gói Premium</h2>
        <span className="text-sm text-slate-400">Giá công thức = giá mẹ + phụ phí, trừ % giảm của khách Thành viên. Đặt giá riêng thì giá riêng là giá cuối cho mọi bậc.</span>
      </div>
      <PanelPremiumTable rows={premiumRows} />
    </div>
  );
}
