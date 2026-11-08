import Link from "next/link";
import { cookies } from "next/headers";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Empty, Badge, Stat, I, CardHead, RiskBar, deviceKind } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { toggleLockdownAction, encryptAllPanelSecretsAction, riskRecalcAction, riskReviewAction, riskSaveSettingsAction, rotateSessionSecretAction, rotateCronSecretAction, clearCronSecretOnceAction } from "@/app/actions/security-center";
import { verifyAuditChain, ACTION_LABEL } from "@/lib/audit";
import { isRiskRestricted, RISK_LEVEL_LABEL, riskFactorText, type RiskFactor } from "@/lib/risk";
import { PANEL_SECRET_FIELDS, panelHasPlaintextSecrets } from "@/lib/panel-secrets";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

const LEVEL_BADGE: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-rose-100 text-rose-700",
};

function actionBadgeCls(action: string): string {
  if (action === "balance.adjust" || action.startsWith("deposit.")) return "bg-sky-100 text-sky-700";
  if (action.startsWith("security.") || action.startsWith("lockdown.") || action.startsWith("secret.") || action.startsWith("apikey.")) return "bg-violet-100 text-violet-700";
  if (action.startsWith("risk.")) return "bg-amber-100 text-amber-700";
  if (action.startsWith("user.")) return "bg-blue-100 text-blue-700";
  if (action.startsWith("panel.")) return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

export default async function SecurityCenter({ searchParams }: { searchParams: { msg?: string; err?: string; action?: string; actor?: string; page?: string } }) {
  const me = await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const now = Date.now();
  const d1 = new Date(now - 24 * 3600 * 1000);
  const d7 = new Date(now - 7 * 24 * 3600 * 1000);
  const page = Math.max(1, parseInt(searchParams.page || "1") || 1);
  const actionFilter = (searchParams.action || "").trim();
  const actorFilter = (searchParams.actor || "").trim();
  const auditWhere: any = { scope: "mother" };
  if (actionFilter) auditWhere.action = { contains: actionFilter };
  if (actorFilter) auditWhere.actorName = { contains: actorFilter };

  const [s, fail24, fail7, newDevices7, ipBans, totalUsers, users2fa, adminsNo2fa, recentLogins, auditTotal, audits, chain, panelsRaw] = await Promise.all([
    getSettings(),
    prisma.loginEvent.count({ where: { success: false, createdAt: { gte: d1 } } }),
    prisma.loginEvent.count({ where: { success: false, createdAt: { gte: d7 } } }),
    prisma.loginEvent.count({ where: { isNewDevice: true, createdAt: { gte: d7 } } }),
    prisma.ipBan.count(),
    prisma.user.count(),
    prisma.user.count({ where: { totpEnabled: true } }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] }, totpEnabled: false }, select: { username: true, role: true }, take: 20 }),
    prisma.loginEvent.findMany({ orderBy: { id: "desc" }, take: 12 }),
    prisma.auditLog.count({ where: auditWhere }),
    prisma.auditLog.findMany({ where: auditWhere, orderBy: { id: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    verifyAuditChain(),
    prisma.childPanel.findMany({ select: { id: true, name: true, ...Object.fromEntries(PANEL_SECRET_FIELDS.map((f) => [f, true])) } as any }),
  ]);
  const panelsPlain = (panelsRaw as any[]).filter((p) => panelHasPlaintextSecrets(p));
  // GĐ3: rủi ro & gian lận + xoay vòng khoá
  const riskTh = { watch: parseInt(s.risk_watch) || 40, restrict: parseInt(s.risk_restrict) || 70, critical: parseInt(s.risk_critical) || 90 };
  const [topRiskRaw, riskWatchCount, riskRestrictedCount] = await Promise.all([
    prisma.user.findMany({ where: { riskScore: { gt: 0 } }, orderBy: { riskScore: "desc" }, take: 15, select: { id: true, username: true, role: true, panelId: true, riskScore: true, riskLevel: true, riskFactors: true, riskUpdatedAt: true, riskReviewedAt: true } }),
    prisma.user.count({ where: { riskScore: { gte: riskTh.watch } } }),
    prisma.user.count({ where: { riskScore: { gte: riskTh.restrict } } }),
  ]);
  const topRisk = await Promise.all(topRiskRaw.map(async (u) => ({ ...u, restrictedNow: await isRiskRestricted(u.id) })));
  const cronOnce = cookies().get("smmv2_cron_once")?.value || "";
  const sessionRotatedAt = parseInt(s.session_secret_rotated_at || "") || 0;
  const pct2fa = totalUsers > 0 ? Math.round((users2fa / totalUsers) * 100) : 0;
  const lockdownOn = s.emergency_lockdown === "1";
  const totalPages = Math.max(1, Math.ceil(auditTotal / PAGE_SIZE));
  const warnings: string[] = [];
  if (lockdownOn) warnings.push(Ld(`Khoá khẩn cấp đang BẬT — khách không đăng nhập/giao dịch được. Lý do: ${s.lockdown_reason || Ld("(không ghi)")}`));
  if (adminsNo2fa.length) warnings.push(Ld(`${adminsNo2fa.length} tài khoản quản trị chưa bật 2FA: ${adminsNo2fa.map((u) => u.username).join(", ")}`));
  if (panelsPlain.length) warnings.push(Ld(`${panelsPlain.length} website con còn secret lưu dạng rõ trong cơ sở dữ liệu — bấm "Mã hoá toàn bộ secret panel" bên dưới.`));
  if (!chain.ok) warnings.push(Ld(`CẢNH BÁO: chuỗi hash của AuditLog bị gãy tại bản ghi #${chain.brokenAt} — nhật ký có thể đã bị can thiệp!`));

  return (
    <div>
      <PageHead title={L("Trung tâm bảo mật")} desc={L("Tổng quan an ninh toàn hệ thống: đăng nhập, thiết bị, khoá khẩn cấp và nhật ký thao tác bất biến.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label={L("Đăng nhập thất bại 24 giờ")} value={String(fail24)} icon={I.shield} tone="rose" />
        <Stat label={L("Đăng nhập thất bại 7 ngày")} value={String(fail7)} icon={I.shield} tone="amber" />
        <Stat label={L("Thiết bị mới 7 ngày")} value={String(newDevices7)} icon={I.server} tone="brand" />
        <Stat label={L("IP đang bị chặn")} value={String(ipBans)} icon={I.list} tone="slate" />
        <Stat label={L("Tài khoản đã bật 2FA")} value={`${pct2fa}%`} sub={Ld(`${users2fa}/${totalUsers} tài khoản`)} icon={I.check} tone="emerald" />
        <Stat label={L("Quản trị chưa bật 2FA")} value={String(adminsNo2fa.length)} sub={adminsNo2fa.length ? adminsNo2fa.map((u) => u.username).join(", ") : L("Tất cả quản trị đã bật 2FA")} icon={I.users} tone={adminsNo2fa.length ? "rose" : "emerald"} />
      </div>

      {warnings.length > 0 && (
        <div className="card mt-6 border-rose-200 bg-rose-50 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30">{I.alert}</span>
            <div className="font-bold text-rose-800">{Ld("Cảnh báo đang hoạt động")}</div>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <CardHead icon={I.lock} tone={lockdownOn ? "rose" : "slate"} title={Ld("Khoá khẩn cấp (Emergency Lockdown)")}>
            {lockdownOn ? <Badge cls="bg-rose-100 text-rose-700">{L("ĐANG BẬT")}</Badge> : <Badge cls="bg-emerald-100 text-emerald-700">{L("Đang tắt")}</Badge>}
          </CardHead>
          <div className="p-5 pt-4">
          <p className="text-sm text-slate-500">{L("Khi bật: khách không đăng nhập mới và không đặt đơn/nạp tiền/mua gói được; tài khoản quản trị và chủ panel vẫn vào quản trị bình thường để xử lý sự cố.")}</p>
          {lockdownOn && s.lockdown_reason ? <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{Ld(`Trạng thái hiện tại: Đang bật — ${s.lockdown_reason}`)}</div> : null}
          {lockdownOn ? (
            <form action={toggleLockdownAction} className="mt-4">
              <input type="hidden" name="enable" value="0" />
              <button className="btn-primary w-full">{L("Tắt khoá khẩn cấp — mở lại hệ thống")}</button>
              <p className="mt-2 text-xs text-slate-400">{L("Thao tác yêu cầu xác thực lại (step-up) và được ghi vào nhật ký bất biến.")}</p>
            </form>
          ) : (
            <form action={toggleLockdownAction} className="mt-4 space-y-3">
              <input type="hidden" name="enable" value="1" />
              <div>
                <label className="lbl">{L("Lý do khoá (hiện cho khách)")}</label>
                <input className="inp" name="reason" maxLength={300} placeholder={L("VD: Bảo trì hệ thống thanh toán")} />
              </div>
              <button className="btn-danger w-full">{L("Bật khoá khẩn cấp")}</button>
              <p className="text-xs text-slate-400">{L("Thao tác yêu cầu xác thực lại (step-up), ghi nhật ký bất biến và gửi cảnh báo cho admin qua các kênh đã cấu hình.")}</p>
            </form>
          )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <CardHead icon={I.key} tone="violet" title={Ld("Mã hoá secret của website con")} />
          <div className="p-5 pt-4">
          <p className="text-sm text-slate-500">{L("Khoá thanh toán, mật khẩu thư và token báo tin của website con được mã hoá khi lưu. Secret cũ dạng rõ vẫn đọc được và tự mã hoá ở lần lưu kế tiếp — hoặc mã hoá ngay toàn bộ tại đây.")}</p>
          <div className="mt-3 rounded-xl bg-slate-50 px-4 py-2 text-sm text-slate-600">
            {Ld("Website con còn secret dạng rõ:")} <b className="text-slate-900">{panelsPlain.length}</b>
            {panelsPlain.length > 0 && <span className="block truncate text-xs text-slate-400">{panelsPlain.map((p) => p.name).join(", ")}</span>}
            <span className="mt-1.5 block text-xs text-slate-400">{Ld(`Tổng số website con: ${panelsRaw.length} · Đã mã hoá toàn bộ: ${panelsRaw.length - panelsPlain.length}`)}<br />{Ld("Khoá mã hoá APP_ENC_KEY trên máy chủ này:")} <b className="text-slate-600">{process.env.APP_ENC_KEY ? Ld("Đã đặt") : Ld("Chưa đặt")}</b></span>
          </div>
          <form action={encryptAllPanelSecretsAction} className="mt-4">
            <button className="btn-primary w-full" disabled={panelsPlain.length === 0}>{L("Mã hoá toàn bộ secret panel")}</button>
            <p className="mt-2 text-xs text-slate-400">{L("Chỉ ADMIN web mẹ, yêu cầu xác thực lại (step-up). Cần đặt khoá APP_ENC_KEY trên máy chủ để mã hoá có hiệu lực.")}</p>
          </form>
          </div>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <CardHead icon={I.chart} tone="amber" title={Ld("Rủi ro & gian lận")}>
          <Badge cls="bg-amber-100 text-amber-700">{Ld(`${riskWatchCount} tài khoản cần theo dõi`)}</Badge>
          <Badge cls="bg-rose-100 text-rose-700">{Ld(`${riskRestrictedCount} tài khoản điểm cao`)}</Badge>
        </CardHead>
        <p className="border-b border-slate-100 px-5 py-3 text-sm text-slate-500">{Ld(`Điểm rủi ro 0–100 tự tính từ hành vi đăng nhập, nạp tiền, đơn hàng và API. Từ ${riskTh.restrict} điểm hệ thống tự chặn tạo đơn/nạp mới cho tới khi được duyệt; từ ${riskTh.critical} điểm là cấp nghiêm trọng chờ duyệt — hệ thống không tự khoá tiền hay khoá tài khoản.`)}</p>
        {topRisk.length === 0 ? <Empty text={L("Chưa có tài khoản nào có điểm rủi ro")} /> : (
          <table className="w-full min-w-[820px]">
            <thead><tr><th className="th">{L("Tài khoản")}</th><th className="th">{L("Điểm rủi ro")}</th><th className="th">{L("Yếu tố chính")}</th><th className="th">{L("Trạng thái")}</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {topRisk.map((u, i) => {
                const fs = ((u.riskFactors as RiskFactor[] | null) || []).slice(0, 3);
                return (
                  <tr key={u.id} className={i % 2 ? "bg-slate-50/60" : undefined}>
                    <td className="td"><Link className="font-semibold text-sky-600" href={`/admin/nguoi-dung/${u.id}`}>{u.username}</Link><span className="block text-xs text-slate-400">{u.panelId ? Ld(`Khách website con #${u.panelId}`) : L("Khách web mẹ")}{u.riskUpdatedAt ? Ld(` · tính lúc ${dt(u.riskUpdatedAt)}`) : ""}</span></td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <RiskBar score={u.riskScore} watch={riskTh.watch} restrict={riskTh.restrict} critical={riskTh.critical} className="w-28" />
                        <b>{u.riskScore}</b>
                        <Badge cls={LEVEL_BADGE[u.riskLevel] || LEVEL_BADGE.LOW}>{Ld(RISK_LEVEL_LABEL[u.riskLevel] || u.riskLevel)}</Badge>
                      </div>
                    </td>
                    <td className="td max-w-[300px] text-xs text-slate-500">{fs.length ? fs.map((f) => `${riskFactorText(f, Ld)} (+${f.points})`).join("; ") : "—"}</td>
                    <td className="td">{u.restrictedNow ? <Badge cls="bg-rose-100 text-rose-700">{L("Đang bị hạn chế")}</Badge> : u.riskReviewedAt ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Đã duyệt")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Bình thường")}</Badge>}</td>
                    <td className="td whitespace-nowrap text-right">
                      <span className="inline-flex gap-2">
                        <form action={riskRecalcAction}><input type="hidden" name="userId" value={u.id} /><button className="btn-ghost btn-sm">{L("Tính lại")}</button></form>
                        <form action={riskReviewAction}><input type="hidden" name="userId" value={u.id} /><button className="btn-ghost btn-sm">{L("Đánh dấu đã duyệt")}</button></form>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="border-t border-slate-100 px-5 pt-4 text-sm font-bold text-slate-800">{L("Cấu hình trọng số & ngưỡng")}</div>
        <form action={riskSaveSettingsAction} className="grid grid-cols-2 gap-3 px-5 pb-4 pt-3 md:grid-cols-4">
          <div><label className="lbl">{L("Ngưỡng theo dõi")}</label><input className="inp" name="risk_watch" type="number" min={0} max={100} defaultValue={s.risk_watch} /></div>
          <div><label className="lbl">{L("Ngưỡng hạn chế")}</label><input className="inp" name="risk_restrict" type="number" min={0} max={100} defaultValue={s.risk_restrict} /></div>
          <div><label className="lbl">{L("Ngưỡng nghiêm trọng")}</label><input className="inp" name="risk_critical" type="number" min={0} max={100} defaultValue={s.risk_critical} /></div>
          <div><label className="lbl">{L("Điểm / tài khoản dùng chung IP")}</label><input className="inp" name="risk_w_shared" type="number" min={0} max={100} defaultValue={s.risk_w_shared} /></div>
          <div><label className="lbl">{L("Điểm / lần đăng nhập sai (7 ngày)")}</label><input className="inp" name="risk_w_faillogin" type="number" min={0} max={100} defaultValue={s.risk_w_faillogin} /></div>
          <div><label className="lbl">{L("Điểm khi IP bị cấm")}</label><input className="inp" name="risk_w_ipban" type="number" min={0} max={100} defaultValue={s.risk_w_ipban} /></div>
          <div><label className="lbl">{L("Điểm tỉ lệ nạp bị từ chối")}</label><input className="inp" name="risk_w_deposit_reject" type="number" min={0} max={100} defaultValue={s.risk_w_deposit_reject} /></div>
          <div><label className="lbl">{L("Điểm spam lệnh nạp 24 giờ")}</label><input className="inp" name="risk_w_deposit_velocity" type="number" min={0} max={100} defaultValue={s.risk_w_deposit_velocity} /></div>
          <div><label className="lbl">{L("Ngưỡng lệnh nạp / 24 giờ")}</label><input className="inp" name="risk_deposit_velocity_count" type="number" min={1} defaultValue={s.risk_deposit_velocity_count} /></div>
          <div><label className="lbl">{L("Điểm spam đơn 1 giờ")}</label><input className="inp" name="risk_w_order_burst" type="number" min={0} max={100} defaultValue={s.risk_w_order_burst} /></div>
          <div><label className="lbl">{L("Ngưỡng đơn / 1 giờ")}</label><input className="inp" name="risk_order_burst_count" type="number" min={1} defaultValue={s.risk_order_burst_count} /></div>
          <div><label className="lbl">{L("Điểm tỉ lệ đơn huỷ/hoàn")}</label><input className="inp" name="risk_w_cancel_ratio" type="number" min={0} max={100} defaultValue={s.risk_w_cancel_ratio} /></div>
          <div><label className="lbl">{L("Điểm lạm dụng hoàn tiền")}</label><input className="inp" name="risk_w_refunds" type="number" min={0} max={100} defaultValue={s.risk_w_refunds} /></div>
          <div><label className="lbl">{L("Điểm lạm dụng API")}</label><input className="inp" name="risk_w_api_errors" type="number" min={0} max={100} defaultValue={s.risk_w_api_errors} /></div>
          <div><label className="lbl">{L("Ngưỡng lỗi API / 24 giờ")}</label><input className="inp" name="risk_api_error_count" type="number" min={1} defaultValue={s.risk_api_error_count} /></div>
          <div className="flex items-end"><button className="btn-primary w-full">{L("Lưu cấu hình rủi ro")}</button></div>
          <input type="hidden" name="risk_w_login_locked" value={s.risk_w_login_locked} />
          <input type="hidden" name="risk_w_young_big" value={s.risk_w_young_big} />
          <input type="hidden" name="risk_young_days" value={s.risk_young_days} />
          <input type="hidden" name="risk_big_deposit_vnd" value={s.risk_big_deposit_vnd} />
        </form>
      </div>

      <div className="card mt-6 overflow-hidden">
        <CardHead icon={I.refresh} tone="brand" title={Ld("Xoay vòng khoá bí mật")} />
        <div className="p-5 pt-4">
        <p className="text-sm text-slate-500">{L("Xoay vòng định kỳ khoá ký phiên và khoá cron để giảm thiểu rủi ro khi khoá cũ bị lộ.")}</p>
        {cronOnce && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-sm font-bold text-amber-800">{L("Khoá cron mới của bạn (chỉ hiện một lần — sao chép ngay)")}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-800">{cronOnce}</code>
              <form action={clearCronSecretOnceAction}><button className="btn-ghost btn-sm">{L("Đã sao chép — ẩn đi")}</button></form>
            </div>
            <p className="mt-2 text-xs text-amber-700">{L("Cập nhật khoá mới này vào nơi gọi cron của bạn; hệ thống vẫn nhận cả khoá cũ trong biến môi trường nên cron hiện tại không bị gián đoạn.")}</p>
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><span className="text-slate-400">{I.key}</span>{L("Khoá ký phiên đăng nhập")}</div>
            <div className="mt-1.5 space-y-1 text-sm text-slate-500">
              <div>{L("Đang dùng:")} <b className="text-slate-800">{s.session_secret ? L("Khoá trong cơ sở dữ liệu") : L("Khoá từ biến môi trường AUTH_SECRET")}</b></div>
              <div>{L("Lần xoay gần nhất:")} <b className="text-slate-800">{sessionRotatedAt ? dt(new Date(sessionRotatedAt)) : L("Chưa từng xoay")}</b></div>
            </div>
            <form action={rotateSessionSecretAction} className="mt-auto pt-3">
              <button className="btn-primary w-full">{L("Xoay vòng khoá phiên")}</button>
              <p className="mt-2 text-xs text-slate-400">{L("Yêu cầu xác thực lại (step-up). Khoá cũ còn hiệu lực 7 ngày nên không ai đang đăng nhập bị văng.")}</p>
            </form>
          </div>
          <div className="flex flex-col rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><span className="text-slate-400">{I.key}</span>{L("Khoá gọi cron đồng bộ")}</div>
            <div className="mt-1.5 space-y-1 text-sm text-slate-500">
              <div>{L("Khoá biến môi trường:")} <b className="text-slate-800">{process.env.CRON_SECRET ? L("Đã đặt") : L("Chưa đặt")}</b></div>
              <div>{L("Khoá cơ sở dữ liệu:")} <b className="text-slate-800">{s.cron_secret ? `••••••••${String(s.cron_secret).slice(-4)}` : L("Chưa đặt")}</b></div>
            </div>
            <form action={rotateCronSecretAction} className="mt-auto pt-3">
              <button className="btn-primary w-full">{L("Xoay vòng khoá cron")}</button>
              <p className="mt-2 text-xs text-slate-400">{L("Yêu cầu xác thực lại (step-up). Hệ thống nhận cả khoá môi trường lẫn khoá cơ sở dữ liệu.")}</p>
            </form>
          </div>
        </div>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <CardHead icon={I.history} tone="blue" title={Ld("Sự kiện đăng nhập gần nhất")} />
        {recentLogins.length === 0 ? <Empty text={L("Chưa có sự kiện đăng nhập")} /> : (
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">{L("Thời gian")}</th><th className="th">{L("Tài khoản")}</th><th className="th">{L("Kết quả")}</th><th className="th">IP</th><th className="th">{L("Thiết bị")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {recentLogins.map((e, i) => (
                <tr key={e.id} className={i % 2 ? "bg-slate-50/60" : undefined}>
                  <td className="td whitespace-nowrap">{dt(e.createdAt)}</td>
                  <td className="td font-medium">{e.username}</td>
                  <td className="td">{e.success ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Thành công")}</Badge> : <Badge cls="bg-rose-100 text-rose-700">{L("Thất bại")}</Badge>}{e.reason ? <span className="ml-2 text-xs text-slate-400">{Ld(e.reason)}</span> : null}</td>
                  <td className="td font-mono text-xs">{e.ip || "—"}</td>
                  <td className="td"><span className="flex items-center gap-2"><span className="text-slate-400">{deviceKind(e.userAgent) === "phone" ? I.phone : I.monitor}</span>{e.isNewDevice ? <Badge cls="bg-amber-100 text-amber-700">{L("Thiết bị mới")}</Badge> : <span className="text-xs text-slate-400">{L("Đã biết")}</span>}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="px-5 py-3 text-xs text-slate-400">{L("Xem đầy đủ ở mục")} <Link className="font-semibold text-sky-600" href="/admin/bao-mat">{L("Bảo mật")}</Link>.</div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <CardHead icon={I.file} tone="violet" title={<>{Ld("Nhật ký thao tác bất biến (Audit Log)")} — {auditTotal} {Ld("dòng")}</>}>
          {chain.ok ? <Badge cls="bg-emerald-100 text-emerald-700">{Ld(`Chuỗi hash nguyên vẹn (${chain.count} dòng)`)}</Badge> : <Badge cls="bg-rose-100 text-rose-700">{Ld(`CHUỖI HASH GÃY tại #${chain.brokenAt}`)}</Badge>}
        </CardHead>
        <form className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4" method="get">
          <div><label className="lbl">{L("Lọc theo thao tác")}</label><input className="inp" name="action" defaultValue={actionFilter} placeholder="VD: deposit" /></div>
          <div><label className="lbl">{L("Người thực hiện")}</label><input className="inp" name="actor" defaultValue={actorFilter} placeholder="VD: admin" /></div>
          <button className="btn-ghost">{L("Lọc")}</button>
          {(actionFilter || actorFilter) && <Link className="btn-ghost" href="/admin/trung-tam-bao-mat">{L("Xoá lọc")}</Link>}
        </form>
        {audits.length === 0 ? <Empty text={L("Chưa có thao tác nhạy cảm nào được ghi")} /> : (
          <table className="w-full min-w-[760px]">
            <thead><tr><th className="th">{L("Thời gian")}</th><th className="th">{L("Người thực hiện")}</th><th className="th">{L("Thao tác")}</th><th className="th">{L("Đối tượng")}</th><th className="th">{L("Chi tiết")}</th><th className="th">IP</th><th className="th">Hash</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {audits.map((a, i) => (
                <tr key={a.id} className={i % 2 ? "bg-slate-50/60" : undefined}>
                  <td className="td whitespace-nowrap">{dt(a.createdAt)}</td>
                  <td className="td"><b>{a.actorName}</b> <span className="text-xs text-slate-400">({a.role})</span></td>
                  <td className="td"><Badge cls={actionBadgeCls(a.action)}>{ACTION_LABEL[a.action] || a.action}</Badge></td>
                  <td className="td text-xs">{a.targetType ? `${a.targetType} #${a.targetId ?? ""}` : "—"}</td>
                  <td className="td max-w-[260px] truncate text-xs" title={a.detail || ""}>{a.detail || "—"}</td>
                  <td className="td font-mono text-xs">{a.ip || "—"}</td>
                  <td className="td"><span className="flex items-center gap-1.5"><span className="font-mono text-[10px] text-slate-400" title={a.hash}>{a.hash.slice(0, 10)}…</span><CopyBtn text={a.hash} label={L("Sao chép mã băm")} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-slate-400">{Ld(`Trang ${page}/${totalPages}`)}</span>
            <span className="space-x-2">
              {page > 1 && <Link className="btn-ghost" href={`/admin/trung-tam-bao-mat?page=${page - 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}${actorFilter ? `&actor=${encodeURIComponent(actorFilter)}` : ""}`}>{L("Trước")}</Link>}
              {page < totalPages && <Link className="btn-ghost" href={`/admin/trung-tam-bao-mat?page=${page + 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}${actorFilter ? `&actor=${encodeURIComponent(actorFilter)}` : ""}`}>{L("Sau")}</Link>}
            </span>
          </div>
        )}
        <div className="px-5 py-3 text-xs text-slate-400">{L("Nhật ký chỉ ghi thêm, không có chức năng sửa/xoá. Mỗi dòng chứa hash của dòng trước — sửa hoặc xoá bất kỳ dòng nào sẽ làm gãy chuỗi và bị phát hiện tại đây.")}</div>
      </div>
    </div>
  );
}
