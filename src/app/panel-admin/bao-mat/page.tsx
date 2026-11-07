import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { panelOrderCodes } from "@/lib/panel-orders";
import { PageHead, Flash, Badge, Empty, I } from "@/components/ui";
import { dt } from "@/lib/format";
import { panelBanIpAction, panelUnbanIpAction } from "@/app/actions/panel";

export const dynamic = "force-dynamic";

/** Bảo mật nâng cao — như web mẹ nhưng phạm vi panel: cấm IP riêng của panel
 *  (chặn đăng ký + đăng nhập của khách panel từ IP đó) + nhật ký hoạt động gần đây. */
export default async function PanelSecurity({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const [bans, globalCount, codes, logins] = await Promise.all([
    prisma.ipBan.findMany({ where: { panelId: panel.id }, orderBy: { id: "desc" }, take: 200 }),
    prisma.ipBan.count({ where: { panelId: null } }),
    panelOrderCodes(panel.id),
    prisma.loginEvent.findMany({ where: { panelId: panel.id }, orderBy: { id: "desc" }, take: 30 }),
  ]);
  const panelAudits = await prisma.auditLog.findMany({ where: { scope: "panel", panelId: panel.id }, orderBy: { id: "desc" }, take: 15 });
  const activity = await prisma.apiLog.findMany({
    where: { OR: [{ ref: { in: codes } }, { ref: panel.slug }] },
    orderBy: { id: "desc" },
    take: 15,
  });
  return (
    <div>
      <PageHead title="Bảo mật nâng cao" desc="Cấm IP trong phạm vi website của bạn và xem hoạt động gần đây liên quan tới panel." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-rose-600 text-white">{I.shield}</span>
              <span className="font-bold text-slate-900">IP bị cấm trong panel này</span>
              <span className="ml-auto rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">{bans.length} IP</span>
            </div>
            {bans.length === 0 ? <Empty text="Chưa cấm IP nào trong panel" /> : (
              <table className="w-full">
                <thead><tr><th className="th">IP</th><th className="th">Lý do</th><th className="th">Ngày cấm</th><th className="th"></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {bans.map((b) => (
                    <tr key={b.id}>
                      <td className="td font-mono text-[13px] font-semibold">{b.ip}</td>
                      <td className="td text-slate-500">{b.reason || "—"}</td>
                      <td className="td whitespace-nowrap text-slate-500">{dt(b.createdAt)}</td>
                      <td className="td text-right">
                        <form action={panelUnbanIpAction}>
                          <input type="hidden" name="id" value={b.id} />
                          <button className="btn-ghost btn-sm">Bỏ cấm</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">Ngoài ra hệ thống đang áp {globalCount} IP cấm toàn hệ thống do web mẹ đặt — các IP đó cũng bị chặn ở website của bạn.</p>
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Lịch sử đăng nhập của khách panel</div>
            {logins.length === 0 ? <Empty text="Chưa có lần đăng nhập nào của khách panel" /> : (
              <div className="divide-y divide-slate-50">
                {logins.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    {ev.success ? <Badge cls="bg-emerald-100 text-emerald-700">Thành công</Badge> : <Badge cls="bg-rose-100 text-rose-700">Thất bại</Badge>}
                    <span className="font-medium">@{ev.username}</span>
                    <span className="font-mono text-xs text-slate-400">{ev.ip}</span>
                    {ev.isNewDevice ? <Badge cls="bg-amber-100 text-amber-700">Thiết bị mới</Badge> : null}
                    <span className="min-w-0 flex-1 truncate text-slate-500">{ev.reason || "—"}</span>
                    <span className="whitespace-nowrap text-xs text-slate-400">{dt(ev.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Hoạt động gần đây của panel</div>
            {activity.length === 0 ? <Empty text="Chưa có hoạt động nào" /> : (
              <div className="divide-y divide-slate-50">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    {a.ok ? <Badge cls="bg-emerald-100 text-emerald-700">OK</Badge> : <Badge cls="bg-rose-100 text-rose-700">Lỗi</Badge>}
                    <span className="font-mono text-xs text-slate-400">{a.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-600">{a.detail || a.ref || "—"}</span>
                    <span className="whitespace-nowrap text-xs text-slate-400">{dt(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-slate-100 px-5 py-3 text-right">
              <Link href="/panel-admin/nhat-ky" className="text-sm font-semibold text-brand-600 hover:underline">Xem toàn bộ nhật ký API →</Link>
            </div>
          </div>
        </div>

        <form action={panelBanIpAction} className="card space-y-4 p-6 lg:sticky lg:top-24">
          <div className="font-bold text-slate-900">Cấm IP mới</div>
          <div>
            <label className="lbl">Địa chỉ IP</label>
            <input name="ip" className="inp" placeholder="VD: 203.0.113.25" required />
          </div>
          <div>
            <label className="lbl">Lý do (tuỳ chọn)</label>
            <input name="reason" className="inp" placeholder="VD: spam đơn, phá hoại..." />
          </div>
          <p className="text-xs leading-relaxed text-slate-400">IP bị cấm sẽ không đăng ký được tài khoản mới tại website và khách của panel dùng IP đó sẽ không đăng nhập được. Cấm này chỉ áp trong panel của bạn — cấm toàn hệ thống là quyền của web mẹ.</p>
          <button className="btn-primary w-full !py-2.5">Cấm IP này</button>
        </form>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Nhật ký thao tác nhạy cảm của panel (chỉ ghi, không sửa/xoá được)</div>
        {panelAudits.length === 0 ? <Empty text="Chưa có thao tác nhạy cảm nào" /> : (
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">Thời gian</th><th className="th">Người thực hiện</th><th className="th">Thao tác</th><th className="th">Chi tiết</th><th className="th">IP</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {panelAudits.map((a) => (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap">{dt(a.createdAt)}</td>
                  <td className="td font-medium">{a.actorName}</td>
                  <td className="td">{a.action}</td>
                  <td className="td max-w-[280px] truncate text-xs" title={a.detail || ""}>{a.detail || "—"}</td>
                  <td className="td font-mono text-xs">{a.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
