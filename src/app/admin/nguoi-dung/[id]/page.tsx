import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireAdminPage } from "@/lib/auth";
import { BackLink, Flash, Badge, Stat, I, CardHead, RiskBar } from "@/components/ui";
import { getSettings } from "@/lib/settings";
import { adminAdjustBalance, adminUpdateUser, adminForceLogoutAction } from "@/app/actions/admin";
import { riskRecalcAction, riskReviewAction } from "@/app/actions/security-center";
import { isRiskRestricted, RISK_LEVEL_LABEL, riskFactorText, riskDetailText, type RiskFactor } from "@/lib/risk";
import { num, LEVEL_NAME, dt, SMM_STATUS, PRE_STATUS } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";
const TX_LABEL: Record<string, string> = { DEPOSIT: "Nạp tiền", SMM_ORDER: "Đặt đơn SMM", PREMIUM_ORDER: "Mua Premium", REFUND: "Hoàn tiền", ADJUST: "Admin điều chỉnh", BONUS: "Thưởng", PANEL_COMMISSION: "Hoa hồng panel con", REFERRAL_COMMISSION: "Hoa hồng giới thiệu" };

export default async function AdminUserDetail({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld, M } = await getServerI18n(null);
  const me = (await getCurrentUser())!;
  const u = await prisma.user.findUnique({
    where: { id: parseInt(params.id) },
    include: { panel: { select: { name: true } }, referredBy: { select: { username: true } }, _count: { select: { referrals: true } } },
  });
  if (!u) notFound();
  // Tài khoản thuộc site con: web mẹ không xem được account này (kể cả số dư) — coi như không tồn tại
  const [txs, smmAgg, preAgg, recentSmm, recentPre, tickets, deposits, settings] = await Promise.all([
    prisma.transaction.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 30 }),
    prisma.smmOrder.aggregate({ where: { userId: u.id, status: { notIn: ["REFUNDED"] } }, _sum: { charge: true }, _count: true }),
    prisma.premiumOrder.aggregate({ where: { userId: u.id, status: { notIn: ["REFUNDED", "CANCELED"] } }, _sum: { total: true }, _count: true }),
    prisma.smmOrder.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 8, include: { service: true } }),
    prisma.premiumOrder.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 5, include: { variant: { include: { product: true } } } }),
    prisma.ticket.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 5 }),
    prisma.deposit.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 5 }),
    getSettings(),
  ]);
  const riskTh = { watch: parseInt(settings.risk_watch) || 40, restrict: parseInt(settings.risk_restrict) || 70, critical: parseInt(settings.risk_critical) || 90 };
  const userSessions = await prisma.userSession.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 10 });
  // GĐ3: điểm rủi ro + sự kiện rủi ro gần nhất của tài khoản này
  const riskEvents = await prisma.riskEvent.findMany({ where: { userId: u.id }, orderBy: { id: "desc" }, take: 5 });
  const riskRestrictedNow = await isRiskRestricted(u.id);
  const riskFactors = ((u.riskFactors as RiskFactor[] | null) || []);
  return (
    <div>
      <BackLink href="/admin/nguoi-dung">{L("Danh sách người dùng")}</BackLink>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={L("Số dư hiện tại")} value={M(u.balance)} icon={I.wallet} tone="blue" />
        <Stat label={L("Tổng đã nạp")} value={M(u.totalDeposited)} icon={I.db} tone="emerald" />
        <Stat label={L("Tổng chi SMM")} value={M(smmAgg._sum.charge || 0)} icon={I.cart} tone="violet" sub={<>{num(smmAgg._count)} {L("đơn")}</>} />
        <Stat label={L("Tổng chi Premium")} value={M(preAgg._sum.total || 0)} icon={I.gem} tone="rose" sub={<>{num(preAgg._count)} {L("đơn")}</>} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-900">{u.username}</h1>
              <Badge cls={u.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>{u.status === "ACTIVE" ? L("Hoạt động") : L("Đã khoá")}</Badge>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              {[["Email", u.email], ["Họ tên", u.fullName || "—"], ["SĐT", u.phone || "—"], ["Cấp bậc", L(LEVEL_NAME[u.level])], ["Panel", u.panel?.name || L("Web chính")], ["Được giới thiệu bởi", u.referredBy?.username || "—"], ["Đã giới thiệu", u._count.referrals + " " + L("người")], ["Mã nạp tiền", `SMM ${u.depositCode}`], ["API key", u.apiKey], ["Đăng ký", dt(u.createdAt)], ["Đăng nhập gần nhất", u.lastLoginAt ? dt(u.lastLoginAt) : "—"]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4"><dt className="text-slate-500">{L(k)}</dt><dd className="font-medium text-right break-all">{v}</dd></div>
              ))}
            </dl>
          </div>
          <form action={adminAdjustBalance} className="card p-6 space-y-3">
            <input type="hidden" name="userId" value={u.id} />
            <div className="font-bold text-slate-900">{L("Cộng / trừ số dư")}</div>
            <div><label className="lbl">{L("Số tiền (âm = trừ)")}</label><input className="inp" name="amount" type="number" required placeholder={L("Vd: 100000 hoặc -50000")} /></div>
            <div><label className="lbl">{L("Lý do")}</label><input className="inp" name="note" placeholder={L("Vd: hoàn tiền sự cố, khuyến mãi...")} /></div>
            <button className="btn-primary w-full">{L("Thực hiện điều chỉnh")}</button>
          </form>
          <form action={adminUpdateUser} className="card p-6 space-y-3">
            <input type="hidden" name="userId" value={u.id} />
            <div className="font-bold text-slate-900">{L("Cấp bậc & trạng thái")}</div>
            <div>
              <label className="lbl">{L("Cấp khách (chiết khấu SMM)")}</label>
              <select className="inp" name="level" defaultValue={u.level}>
                {Object.entries(LEVEL_NAME).map(([k, v]) => <option key={k} value={k}>{L(v)}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">{L("Trạng thái")}</label>
              <select className="inp" name="status" defaultValue={u.status}><option value="ACTIVE">{L("Hoạt động")}</option><option value="BANNED">{L("Khoá tài khoản")}</option></select>
            </div>
            {me.role === "ADMIN" && (
              <div>
                <label className="lbl">{L("Vai trò")}</label>
                <select className="inp" name="role" defaultValue={u.role}><option value="USER">{L("Người dùng")}</option><option value="STAFF">{L("Nhân viên")}</option><option value="ADMIN">{L("Admin")}</option></select>
              </div>
            )}
            <button className="btn-dark w-full">{L("Lưu thay đổi")}</button>
          </form>
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">{L("Ticket & nạp gần nhất")}</div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={"t" + t.id}>
                  <td className="td"><Link href={`/admin/ticket/${t.id}`} className="font-medium text-brand-700">{Ld(`Ticket: ${t.subject}`)}</Link><div className="text-xs text-slate-400">{dt(t.createdAt)}</div></td>
                  <td className="td text-right"><Badge cls={t.status === "OPEN" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"}>{t.status === "OPEN" ? Ld("Đang mở") : Ld("Đã đóng")}</Badge></td>
                </tr>
              ))}
              {deposits.map((d) => (
                <tr key={"d" + d.id}>
                  <td className="td"><span className="font-medium">{L("Nạp")} {d.code}</span><div className="text-xs text-slate-400">{d.method} · {dt(d.createdAt)}</div></td>
                  <td className="td text-right font-semibold">{M(d.amount)}</td>
                </tr>
              ))}
              {tickets.length === 0 && deposits.length === 0 && <tr><td className="td text-slate-400">{L("Chưa có ticket / lượt nạp nào")}</td></tr>}
            </tbody></table>
          </div>
        <div className="card overflow-hidden">
            <CardHead icon={I.shield} tone={u.riskLevel === "CRITICAL" ? "rose" : u.riskLevel === "HIGH" ? "orange" : u.riskLevel === "MEDIUM" ? "amber" : "slate"} title={Ld("Điểm rủi ro gian lận")}>
              <Badge cls={u.riskLevel === "CRITICAL" ? "bg-rose-100 text-rose-700" : u.riskLevel === "HIGH" ? "bg-orange-100 text-orange-700" : u.riskLevel === "MEDIUM" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}>{Ld(RISK_LEVEL_LABEL[u.riskLevel] || u.riskLevel)}</Badge>
            </CardHead>
            <div className="space-y-3 p-6 pt-4">
            <div className="flex items-center gap-3">
              <RiskBar score={u.riskScore} watch={riskTh.watch} restrict={riskTh.restrict} critical={riskTh.critical} className="flex-1" />
              <span className="text-xl font-black text-slate-900">{u.riskScore}<span className="text-sm font-semibold text-slate-400">/100</span></span>
            </div>
            {riskRestrictedNow ? <p className="text-sm font-semibold text-rose-600">{L("Tài khoản đang bị hạn chế tạo đơn/nạp mới.")}</p> : u.riskReviewedAt ? <p className="text-sm text-emerald-600">{L("Đã được duyệt lúc")} {dt(u.riskReviewedAt)} {L("— chỉ hạn chế lại khi có tín hiệu mới.")}</p> : null}
            {riskFactors.length === 0 ? <p className="text-sm text-slate-400">{L("Chưa ghi nhận yếu tố rủi ro nào.")}</p> : (
              <ul className="space-y-1.5">
                {riskFactors.map((f) => (
                  <li key={f.key} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-600">{riskFactorText(f, Ld)}</span><Badge cls={f.points >= 20 ? "bg-rose-100 text-rose-700 font-mono" : f.points >= 10 ? "bg-amber-100 text-amber-700 font-mono" : "bg-slate-100 text-slate-600 font-mono"}>+{f.points} {L("điểm")}</Badge></li>
                ))}
              </ul>
            )}
            {riskEvents.length > 0 && (
              <div className="space-y-1 border-t border-slate-100 pt-3">
                {riskEvents.map((ev) => (
                  <div key={ev.id} className="text-xs text-slate-400">{dt(ev.createdAt)} · {ev.kind === "restricted" ? Ld("Bị hạn chế") : ev.kind === "reviewed" ? Ld("Đã duyệt") : Ld("Tín hiệu")} — {ev.detail ? riskDetailText(ev.detail, Ld) : ""} ({Ld("điểm")} {ev.score})</div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400">{L("Cập nhật:")} {u.riskUpdatedAt ? dt(u.riskUpdatedAt) : L("chưa tính")} {L("· Điểm tự tính lại khi đăng nhập, duyệt nạp, tạo đơn và mỗi vòng cron.")}</p>
            <div className="flex gap-2">
              <form action={riskRecalcAction} className="flex-1"><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="next" value={`/admin/nguoi-dung/${u.id}`} /><button className="btn-ghost w-full">{L("Tính lại điểm")}</button></form>
              <form action={riskReviewAction} className="flex-1"><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="next" value={`/admin/nguoi-dung/${u.id}`} /><button className="btn-primary w-full">{L("Đánh dấu đã duyệt")}</button></form>
            </div>
            </div>
          </div>
        <div className="card p-6 space-y-3">
            <div className="font-bold text-slate-900">{`${Ld("Phiên đăng nhập")} (${userSessions.filter((x) => !x.revokedAt).length} ${Ld("đang hoạt động")})`}</div>
            {userSessions.length === 0 ? <p className="text-sm text-slate-400">{L("Chưa có phiên nào được ghi nhận.")}</p> : (
              <ul className="space-y-2">
                {userSessions.map((ss) => (
                  <li key={ss.id} className="rounded-xl border border-slate-100 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-600">{ss.ip || "—"}</span>
                      {ss.revokedAt ? <Badge cls="bg-slate-100 text-slate-500">{L("Đã đăng xuất")}</Badge> : <Badge cls="bg-emerald-100 text-emerald-700">{L("Đang hoạt động")}</Badge>}
                    </div>
                    <div className="mt-1 line-clamp-2 text-slate-400">{ss.userAgent || "—"}</div>
                    <div className="mt-1 text-slate-400">{`${Ld("Đăng nhập")} ${dt(ss.createdAt)} · ${Ld("Hoạt động gần nhất")} ${dt(ss.lastSeenAt)}`}</div>
                  </li>
                ))}
              </ul>
            )}
            <form action={adminForceLogoutAction}>
              <input type="hidden" name="userId" value={u.id} />
              <button className="btn-danger w-full">{L("Buộc đăng xuất mọi thiết bị")}</button>
            </form>
          </div>
          </div>
        <div className="lg:col-span-3 space-y-6">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">{L("Đơn SMM gần nhất")}</div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {recentSmm.map((o) => (
                <tr key={o.id}>
                  <td className="td"><Link href={`/admin/don-smm/${o.id}`} className="font-mono text-xs font-semibold text-brand-700">{o.code}</Link><div className="max-w-[260px] truncate text-xs text-slate-400">{o.service.name}</div></td>
                  <td className="td font-semibold">{M(o.charge)}</td>
                  <td className="td"><Badge cls={SMM_STATUS[o.status].cls}>{L(SMM_STATUS[o.status].label)}</Badge></td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(o.createdAt)}</td>
                </tr>
              ))}
              {recentSmm.length === 0 && <tr><td className="td text-slate-400">{L("Chưa có đơn SMM")}</td></tr>}
            </tbody></table>
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">{L("Đơn Premium gần nhất")}</div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {recentPre.map((o) => (
                <tr key={o.id}>
                  <td className="td"><span className="font-mono text-xs font-semibold">{o.code}</span><div className="max-w-[260px] truncate text-xs text-slate-400">{o.variant.product.name} — {o.variant.name}</div></td>
                  <td className="td font-semibold">{M(o.total)}</td>
                  <td className="td"><Badge cls={PRE_STATUS[o.status].cls}>{L(PRE_STATUS[o.status].label)}</Badge></td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(o.createdAt)}</td>
                </tr>
              ))}
              {recentPre.length === 0 && <tr><td className="td text-slate-400">{L("Chưa có đơn Premium")}</td></tr>}
            </tbody></table>
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 font-bold text-slate-900">{L("Sổ giao dịch gần nhất")}</div>
            <table className="w-full"><tbody className="divide-y divide-slate-100">
              {txs.map((t) => (
                <tr key={t.id}>
                  <td className="td text-xs text-slate-500">{dt(t.createdAt)}</td>
                  <td className="td font-medium">{L(TX_LABEL[t.type] || t.type)}<div className="text-xs text-slate-400 font-normal">{t.note || ""}{t.ref ? ` · ${t.ref}` : ""}</div></td>
                  <td className={`td font-bold text-right ${t.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.amount >= 0 ? "+" : ""}{M(t.amount)}</td>
                  <td className="td text-right text-slate-500">{M(t.balanceAfter)}</td>
                </tr>
              ))}
              {txs.length === 0 && <tr><td className="td text-slate-400">{L("Chưa có giao dịch")}</td></tr>}
            </tbody></table>
          </div>
        </div>
      </div>
    </div>
  );
}
