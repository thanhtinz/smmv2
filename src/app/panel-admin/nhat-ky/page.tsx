import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { panelOrderCodes } from "@/app/actions/panel";
import { PageHead, Badge, Empty } from "@/components/ui";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  provider_out: "Đẩy qua web mẹ",
  reseller_in: "API khách gọi vào",
  webhook: "Webhook",
  panel_commission: "Hoa hồng panel",
  bulk_price: "Giá thông minh",
  price_change: "Đổi giá",
};

/** Nhật ký API — như web mẹ nhưng chỉ các dòng liên quan tới đơn của panel này. */
export default async function PanelApiLog({ searchParams }: { searchParams: { kind?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const codes = await panelOrderCodes(panel.id);
  const where: any = { OR: [{ ref: { in: codes } }, { ref: panel.slug }] };
  if (searchParams.kind) where.AND = [{ kind: searchParams.kind }];
  const rows = await prisma.apiLog.findMany({ where, orderBy: { id: "desc" }, take: 100 });
  const kinds = Object.keys(KIND_LABEL);
  return (
    <div>
      <PageHead title="Nhật ký API" desc="Các dòng nhật ký hệ thống liên quan tới đơn hàng và thao tác của panel này: đẩy đơn qua web mẹ, khách gọi API, hoa hồng, đổi giá hàng loạt." />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/panel-admin/nhat-ky" className={!searchParams.kind ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>Tất cả</Link>
        {kinds.map((k) => (
          <Link key={k} href={`/panel-admin/nhat-ky?kind=${k}`} className={searchParams.kind === k ? "btn-primary btn-sm" : "btn-ghost btn-sm"}>{KIND_LABEL[k]}</Link>
        ))}
      </div>
      {rows.length === 0 ? <Empty text="Chưa có nhật ký nào liên quan tới panel" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr><th className="th">ID</th><th className="th">Loại</th><th className="th">Tham chiếu</th><th className="th">Chi tiết</th><th className="th">Kết quả</th><th className="th">Thời gian</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="td font-mono text-xs text-slate-400">#{l.id}</td>
                  <td className="td"><Badge cls="bg-slate-100 text-slate-600">{KIND_LABEL[l.kind] || l.kind}</Badge></td>
                  <td className="td font-mono text-xs">{l.ref || "—"}</td>
                  <td className="td max-w-[380px] truncate text-slate-500">{l.detail || "—"}</td>
                  <td className="td">{l.ok ? <Badge cls="bg-emerald-100 text-emerald-700">OK</Badge> : <Badge cls="bg-rose-100 text-rose-700">Lỗi</Badge>}</td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
