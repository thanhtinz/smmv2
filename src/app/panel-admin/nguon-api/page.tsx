import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash, Badge } from "@/components/ui";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Nguồn API — các nguồn dịch vụ có sẵn của web mẹ. Panel chỉ XEM:
 *  nguồn do web chính quản lý, không thêm nguồn mới tại đây, không hiện key.
 *  Khi thêm dịch vụ, chủ panel chọn từ các dịch vụ chạy trên những nguồn này. */
export default async function PanelSourcesPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  const providers = await prisma.provider.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true, name: true, kind: true, active: true,
      _count: { select: { services: { where: { panelId: null } } } },
    },
  });
  return (
    <div>
      <PageHead title="Nguồn API" desc="Các nguồn dịch vụ có sẵn của web chính. Nguồn do web chính quản lý — khi thêm dịch vụ vào gian hàng, bạn chọn dịch vụ chạy trên các nguồn này." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Tên nguồn</th><th className="th">Loại</th><th className="th">Dịch vụ trên web chính</th><th className="th">Trạng thái</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {providers.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="td font-semibold text-slate-800">{p.name}</td>
                  <td className="td text-slate-500">{p.kind === "PREMIUM" ? "Sản phẩm / Premium" : p.kind === "SMM" ? "Dịch vụ SMM" : "SMM + Premium"}</td>
                  <td className="td">{num(p._count.services)} dịch vụ</td>
                  <td className="td"><Badge cls={p.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}>{p.active ? "Đang chạy" : "Tạm dừng"}</Badge></td>
                </tr>
              ))}
              {providers.length === 0 && <tr><td className="td text-slate-400" colSpan={4}>Web chính chưa đấu nguồn nào.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-400">Muốn bán thêm dịch vụ? Vào mục <b className="text-slate-600">Dịch vụ & Giá → Thêm dịch vụ</b> và chọn nguồn từ danh sách dịch vụ có sẵn của web chính.</p>
    </div>
  );
}
