import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePanelOwnerPage } from "@/lib/panel-access";
import { panelOrderCodes } from "@/lib/panel-orders";
import { PageHead, Flash, Badge, Empty, I, CardHead, RiskBar } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { dt } from "@/lib/format";
import { panelBanIpAction, panelUnbanIpAction, panelRiskReviewAction } from "@/app/actions/panel";
import { isRiskRestricted, RISK_LEVEL_LABEL, riskFactorText, type RiskFactor } from "@/lib/risk";
import { ACTION_LABEL } from "@/lib/audit";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Bảo mật nâng cao — như web mẹ nhưng phạm vi panel: cấm IP riêng của panel
 *  (chặn đăng ký + đăng nhập của khách panel từ IP đó) + nhật ký hoạt động gần đây. */
export default async function PanelSecurity({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const [bans, globalCount, codes, logins, s] = await Promise.all([
    prisma.ipBan.findMany({ where: { panelId: panel.id }, orderBy: { id: "desc" }, take: 200 }),
    prisma.ipBan.count({ where: { panelId: null } }),
    panelOrderCodes(panel.id),
    prisma.loginEvent.findMany({ where: { panelId: panel.id }, orderBy: { id: "desc" }, take: 30 }),
    getSettings(),
  ]);
  const riskTh = { watch: parseInt(s.risk_watch) || 40, restrict: parseInt(s.risk_restrict) || 70, critical: parseInt(s.risk_critical) || 90 };
  const panelAudits = await prisma.auditLog.findMany({ where: { scope: "panel", panelId: panel.id }, orderBy: { id: "desc" }, take: 15 });
  // GĐ3: khách của panel có điểm rủi ro cao nhất (chỉ xem + duyệt trong phạm vi panel)
  const riskRaw = await prisma.user.findMany({ where: { panelId: panel.id, riskScore: { gt: 0 } }, orderBy: { riskScore: "desc" }, take: 10, select: { id: true, username: true, riskScore: true, riskLevel: true, riskFactors: true, riskReviewedAt: true } });
  const riskMembers = await Promise.all(riskRaw.map(async (u) => ({ ...u, restrictedNow: await isRiskRestricted(u.id) })));
  const activity = await prisma.apiLog.findMany({
    where: { OR: [{ ref: { in: codes } }, { ref: panel.slug }] },
    orderBy: { id: "desc" },
    take: 15,
  });
  return (
    <div>
      <PageHead title={L("Bảo mật nâng cao")} desc={L("Cấm IP trong phạm vi website của bạn và xem hoạt động gần đây liên quan tới panel.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <CardHead icon={I.shield} tone="rose" title={L("IP bị cấm trong panel này")}>
              <Badge cls="bg-rose-100 text-rose-700">{Ld(`${bans.length} IP`)}</Badge>
            </CardHead>
            {bans.length === 0 ? <Empty text={L("Chưa cấm IP nào trong panel")} /> : (
              <table className="w-full">
                <thead><tr><th className="th">IP</th><th className="th">{L("Lý do")}</th><th className="th">{L("Ngày cấm")}</th><th className="th"></th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {bans.map((b) => (
                    <tr key={b.id}>
                      <td className="td font-mono text-[13px] font-semibold">{b.ip}</td>
                      <td className="td text-slate-500">{b.reason || "—"}</td>
                      <td className="td whitespace-nowrap text-slate-500">{dt(b.createdAt)}</td>
                      <td className="td text-right">
                        <form action={panelUnbanIpAction}>
                          <input type="hidden" name="id" value={b.id} />
                          <button className="btn-ghost btn-sm">{L("Bỏ cấm")}</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">{Ld(`Ngoài ra hệ thống đang áp ${globalCount} IP cấm toàn hệ thống do web mẹ đặt — các IP đó cũng bị chặn ở website của bạn.`)}</p>
          </div>

          <div className="card overflow-hidden">
            <CardHead icon={I.history} tone="blue" title={L("Lịch sử đăng nhập của khách panel")} />
            {logins.length === 0 ? <Empty text={L("Chưa có lần đăng nhập nào của khách panel")} /> : (
              <div className="divide-y divide-slate-50">
                {logins.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    {ev.success ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Thành công")}</Badge> : <Badge cls="bg-rose-100 text-rose-700">{L("Thất bại")}</Badge>}
                    <span className="font-medium">@{ev.username}</span>
                    <span className="font-mono text-xs text-slate-400">{ev.ip}</span>
                    {ev.isNewDevice ? <Badge cls="bg-amber-100 text-amber-700">{L("Thiết bị mới")}</Badge> : null}
                    <span className="min-w-0 flex-1 truncate text-slate-500">{ev.reason ? Ld(ev.reason) : "—"}</span>
                    <span className="whitespace-nowrap text-xs text-slate-400">{dt(ev.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <CardHead icon={I.list} tone="slate" title={L("Hoạt động gần đây của panel")} />
            {activity.length === 0 ? <Empty text={L("Chưa có hoạt động nào")} /> : (
              <div className="divide-y divide-slate-50">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    {a.ok ? <Badge cls="bg-emerald-100 text-emerald-700">OK</Badge> : <Badge cls="bg-rose-100 text-rose-700">{L("Lỗi")}</Badge>}
                    <span className="font-mono text-xs text-slate-400">{a.kind}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-600">{a.detail || a.ref || "—"}</span>
                    <span className="whitespace-nowrap text-xs text-slate-400">{dt(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-slate-100 px-5 py-3 text-right">
              <Link href="/panel-admin/nhat-ky" className="text-sm font-semibold text-brand-600 hover:underline">{L("Xem toàn bộ nhật ký API →")}</Link>
            </div>
          </div>
        </div>

        <form action={panelBanIpAction} className="card space-y-4 p-6 lg:sticky lg:top-24">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30">{I.ban}</span>
            <div className="font-bold text-slate-900">{L("Cấm IP mới")}</div>
          </div>
          <div>
            <label className="lbl">{L("Địa chỉ IP")}</label>
            <input name="ip" className="inp" placeholder={L("VD: 203.0.113.25")} required />
          </div>
          <div>
            <label className="lbl">{L("Lý do (tuỳ chọn)")}</label>
            <input name="reason" className="inp" placeholder={L("VD: spam đơn, phá hoại...")} />
          </div>
          <p className="text-xs leading-relaxed text-slate-400">{L("IP bị cấm sẽ không đăng ký được tài khoản mới tại website và khách của panel dùng IP đó sẽ không đăng nhập được. Cấm này chỉ áp trong panel của bạn — cấm toàn hệ thống là quyền của web mẹ.")}</p>
          <button className="btn-primary w-full !py-2.5">{L("Cấm IP này")}</button>
        </form>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <CardHead icon={I.shield} tone="amber" title={Ld("Điểm rủi ro của khách website này")} />
        <p className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500">{L("Hệ thống tự chấm điểm rủi ro 0–100 cho mỗi khách; khách điểm cao bị hạn chế tạo đơn/nạp sẽ được gỡ hạn chế khi bạn đánh dấu đã duyệt.")}</p>
        {riskMembers.length === 0 ? <Empty text={L("Chưa có khách nào có điểm rủi ro")} /> : (
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">{L("Khách")}</th><th className="th">{Ld("Điểm")}</th><th className="th">{L("Yếu tố chính")}</th><th className="th">{L("Trạng thái")}</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {riskMembers.map((u, i) => (
                <tr key={u.id} className={i % 2 ? "bg-slate-50/60" : undefined}>
                  <td className="td font-medium">{u.username}</td>
                  <td className="td"><div className="flex items-center gap-2"><b>{u.riskScore}</b><RiskBar score={u.riskScore} watch={riskTh.watch} restrict={riskTh.restrict} critical={riskTh.critical} className="w-20" /><Badge cls={u.riskLevel === "CRITICAL" ? "bg-rose-100 text-rose-700" : u.riskLevel === "HIGH" ? "bg-orange-100 text-orange-700" : u.riskLevel === "MEDIUM" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}>{Ld(RISK_LEVEL_LABEL[u.riskLevel] || u.riskLevel)}</Badge></div></td>
                  <td className="td max-w-[280px] text-xs text-slate-500">{(((u.riskFactors as RiskFactor[] | null) || []).slice(0, 3).map((f) => `${riskFactorText(f, Ld)} (+${f.points})`).join("; ")) || "—"}</td>
                  <td className="td">{u.restrictedNow ? <Badge cls="bg-rose-100 text-rose-700">{L("Đang bị hạn chế")}</Badge> : u.riskReviewedAt ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Đã duyệt")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Bình thường")}</Badge>}</td>
                  <td className="td text-right"><form action={panelRiskReviewAction}><input type="hidden" name="userId" value={u.id} /><button className="btn-ghost btn-sm">{L("Đánh dấu đã duyệt")}</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card mt-6 overflow-x-auto">
        <CardHead icon={I.file} tone="violet" title={Ld("Nhật ký thao tác nhạy cảm của panel (chỉ ghi, không sửa/xoá được)")} />
        {panelAudits.length === 0 ? <Empty text={L("Chưa có thao tác nhạy cảm nào")} /> : (
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">{L("Thời gian")}</th><th className="th">{L("Người thực hiện")}</th><th className="th">{L("Thao tác")}</th><th className="th">{L("Chi tiết")}</th><th className="th">IP</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {panelAudits.map((a) => (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap">{dt(a.createdAt)}</td>
                  <td className="td font-medium">{a.actorName}</td>
                  <td className="td">{L(ACTION_LABEL[a.action] || a.action)}</td>
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
