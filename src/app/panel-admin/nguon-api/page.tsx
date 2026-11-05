import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Nguồn API của web con — chỉ có MỘT nguồn duy nhất: web chính.
 *  Web con đấu về API của web chính bằng API key tài khoản mẹ đã liên kết;
 *  mọi dịch vụ và đơn hàng đều do web chính xử lý, web con không đấu nguồn ngoài. */
export default async function PanelSourcesPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { user, panel } = await requirePanelOwnerPage();
  const s = await getSettings();
  const [serviceCount, linkedUser] = await Promise.all([
    prisma.smmService.count({ where: { active: true, panelId: null } }),
    panel.apiUserId ? prisma.user.findUnique({ where: { id: panel.apiUserId }, select: { username: true } }) : Promise.resolve(null),
  ]);
  const linked = !!panel.apiKey;
  return (
    <div>
      <PageHead title="Nguồn API" desc="Nguồn duy nhất của gian hàng là web chính — web con đấu về API của web chính, mọi dịch vụ và đơn hàng đều do web chính xử lý." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">Tên nguồn</th><th className="th">Loại kết nối</th><th className="th">Tài khoản liên kết</th><th className="th">Dịch vụ khả dụng</th><th className="th">Trạng thái</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50/60">
                <td className="td"><div className="font-semibold text-slate-800">{s.site_name} (web chính)</div><div className="text-xs text-slate-400">API của hệ thống — không qua nguồn ngoài</div></td>
                <td className="td text-slate-500">API SMM v2 · /api/v2</td>
                <td className="td text-slate-500">{linkedUser ? `@${linkedUser.username}` : linked ? "Đã có API key" : "—"}</td>
                <td className="td">{num(serviceCount)} dịch vụ</td>
                <td className="td"><Badge cls={linked ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}>{linked ? "Đã liên kết" : "Chưa liên kết"}</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {!linked && (
        <p className="mt-4 text-sm text-amber-600">Gian hàng chưa liên kết API key của tài khoản mẹ — hãy hoàn tất bước <b>Kết nối API</b> trong phần cấu hình lần đầu (hoặc Cài đặt panel) để nguồn hoạt động.</p>
      )}
      <p className="mt-4 text-sm text-slate-400">Muốn bán thêm dịch vụ? Vào mục <b className="text-slate-600">Dịch vụ & Giá → Thêm dịch vụ</b> và chọn từ danh sách dịch vụ có sẵn của web chính — tất cả đều chạy qua nguồn này.</p>
    </div>
  );
}
