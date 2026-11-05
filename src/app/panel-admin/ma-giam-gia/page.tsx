import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { PageHead, Flash } from "@/components/ui";
import { PanelCodesClient, type PanelCodeDTO } from "@/components/panel-features";

export const dynamic = "force-dynamic";

/** Mã giảm giá riêng của panel — chỉ khách mua qua gian hàng này mới dùng được. */
export default async function PanelCodesPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { user, panel } = await requirePanelOwnerPage();
  const rows = await prisma.discountCode.findMany({ where: { panelId: panel.id }, orderBy: { id: "desc" } });
  const dtos: PanelCodeDTO[] = rows.map((c) => ({
    id: c.id, code: c.code, type: c.type, value: c.value, minOrder: c.minOrder, maxDiscount: c.maxDiscount,
    usageLimit: c.usageLimit, usedCount: c.usedCount, scope: c.scope,
    startsAt: c.startsAt ? c.startsAt.toISOString().slice(0, 16) : null,
    endsAt: c.endsAt ? c.endsAt.toISOString().slice(0, 16) : null,
    active: c.active,
  }));
  return (
    <div>
      <PageHead title="Mã giảm giá" desc="Mã riêng của gian hàng — chỉ áp dụng cho đơn mua qua panel của bạn." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <PanelCodesClient codes={dtos} />
    </div>
  );
}
