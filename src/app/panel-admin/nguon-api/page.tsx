import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { num } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Nguồn API của web con — chỉ có MỘT nguồn duy nhất: web chính.
 *  Web con đấu về API của web chính bằng API key tài khoản mẹ đã liên kết;
 *  mọi dịch vụ và đơn hàng đều do web chính xử lý, web con không đấu nguồn ngoài. */
export default async function PanelSourcesPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const s = await getSettings();
  const [serviceCount, linkedUser] = await Promise.all([
    prisma.smmService.count({ where: { active: true, panelId: null } }),
    panel.apiUserId ? prisma.user.findUnique({ where: { id: panel.apiUserId }, select: { username: true } }) : Promise.resolve(null),
  ]);
  const linked = !!panel.apiKey;
  return (
    <div>
      <PageHead title={L("Nguồn API")} desc={L("Nguồn duy nhất của website là web chính — web con đấu về API của web chính, mọi dịch vụ và đơn hàng đều do web chính xử lý.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50 border-b border-slate-200"><tr>
              <th className="th">{L("Tên nguồn")}</th><th className="th">{L("Loại kết nối")}</th><th className="th">{L("Tài khoản liên kết")}</th><th className="th">{L("Dịch vụ khả dụng")}</th><th className="th">{L("Trạng thái")}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="hover:bg-slate-50/60">
                <td className="td"><div className="font-semibold text-slate-800">{s.site_name} {L("(web chính)")}</div><div className="text-xs text-slate-400">{L("API của hệ thống — không qua nguồn ngoài")}</div></td>
                <td className="td text-slate-500">API SMM v2 · /api/v2</td>
                <td className="td text-slate-500">{linkedUser ? `@${linkedUser.username}` : linked ? L("Đã có API key") : "—"}</td>
                <td className="td">{Ld(`${num(serviceCount)} dịch vụ`)}</td>
                <td className="td"><Badge cls={linked ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}>{linked ? L("Đã liên kết") : L("Chưa liên kết")}</Badge></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {!linked && (
        <p className="mt-4 text-sm text-amber-600">{L("Website chưa liên kết API key của tài khoản mẹ — hãy hoàn tất bước")} <b>{L("Kết nối API")}</b> {L("trong phần cấu hình lần đầu (hoặc Cài đặt panel) để nguồn hoạt động.")}</p>
      )}
      <p className="mt-4 text-sm text-slate-400">{L("Muốn bán thêm dịch vụ? Vào mục")} <b className="text-slate-600">{L("Dịch vụ & Giá → Thêm dịch vụ")}</b> {L("và chọn từ danh sách dịch vụ có sẵn của web chính — tất cả đều chạy qua nguồn này.")}</p>
    </div>
  );
}
