import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Empty, Badge, Stat, I } from "@/components/ui";
import { toggleLockdownAction, encryptAllPanelSecretsAction } from "@/app/actions/security-center";
import { verifyAuditChain } from "@/lib/audit";
import { PANEL_SECRET_FIELDS, panelHasPlaintextSecrets } from "@/lib/panel-secrets";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

const ACTION_LABEL: Record<string, string> = {
  "balance.adjust": "Cộng/trừ tiền tay",
  "user.update": "Sửa/khoá tài khoản",
  "user.force_logout": "Buộc đăng xuất mọi thiết bị",
  "provider.save": "Lưu nhà cung cấp",
  "provider.delete": "Xoá nhà cung cấp",
  "deposit.approve": "Duyệt nạp tiền",
  "deposit.reject": "Từ chối nạp tiền",
  "deposit.manual": "Nạp tiền tay",
  "settings.update": "Đổi cấu hình hệ thống",
  "settings.methods": "Đổi cấu hình nạp tiền",
  "security.policy": "Đổi chính sách bảo mật",
  "price.bulk": "Đổi giá hàng loạt",
  "apikey.regen": "Tạo lại API key",
  "lockdown.on": "Bật khoá khẩn cấp",
  "lockdown.off": "Tắt khoá khẩn cấp",
  "panel.secrets.encrypt_all": "Mã hoá toàn bộ secret panel",
  "panel.config.smtp": "Panel: lưu SMTP",
  "panel.config.telegram": "Panel: lưu Telegram",
  "panel.config.google": "Panel: lưu Google",
  "panel.config.paypal": "Panel: lưu PayPal",
  "panel.config.sepay": "Panel: lưu SePay",
  "panel.config.stripe": "Panel: lưu Stripe",
  "panel.config.toolapi": "Panel: lưu Tool API key",
  "panel.config.alerts": "Panel: lưu báo tin",
};

export default async function SecurityCenter({ searchParams }: { searchParams: { msg?: string; err?: string; action?: string; actor?: string; page?: string } }) {
  const me = await requireAdminPage();
  const { Ld } = await getServerI18n(null);
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
  const pct2fa = totalUsers > 0 ? Math.round((users2fa / totalUsers) * 100) : 0;
  const lockdownOn = s.emergency_lockdown === "1";
  const totalPages = Math.max(1, Math.ceil(auditTotal / PAGE_SIZE));
  const warnings: string[] = [];
  if (lockdownOn) warnings.push(`Khoá khẩn cấp đang BẬT — khách không đăng nhập/giao dịch được. Lý do: ${s.lockdown_reason || "(không ghi)"}`);
  if (adminsNo2fa.length) warnings.push(`${adminsNo2fa.length} tài khoản quản trị chưa bật 2FA: ${adminsNo2fa.map((u) => u.username).join(", ")}`);
  if (panelsPlain.length) warnings.push(`${panelsPlain.length} website con còn secret lưu dạng rõ trong cơ sở dữ liệu — bấm "Mã hoá toàn bộ secret panel" bên dưới.`);
  if (!chain.ok) warnings.push(`CẢNH BÁO: chuỗi hash của AuditLog bị gãy tại bản ghi #${chain.brokenAt} — nhật ký có thể đã bị can thiệp!`);

  return (
    <div>
      <PageHead title="Trung tâm bảo mật" desc="Tổng quan an ninh toàn hệ thống: đăng nhập, thiết bị, khoá khẩn cấp và nhật ký thao tác bất biến." />
      <Flash msg={searchParams.msg} err={searchParams.err} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Đăng nhập thất bại 24 giờ" value={String(fail24)} icon={I.shield} tone="rose" />
        <Stat label="Đăng nhập thất bại 7 ngày" value={String(fail7)} icon={I.shield} tone="amber" />
        <Stat label="Thiết bị mới 7 ngày" value={String(newDevices7)} icon={I.server} tone="brand" />
        <Stat label="IP đang bị chặn" value={String(ipBans)} icon={I.list} tone="slate" />
        <Stat label="Tài khoản đã bật 2FA" value={`${pct2fa}%`} sub={`${users2fa}/${totalUsers} tài khoản`} icon={I.check} tone="emerald" />
        <Stat label="Quản trị chưa bật 2FA" value={String(adminsNo2fa.length)} sub={adminsNo2fa.length ? adminsNo2fa.map((u) => u.username).join(", ") : "Tất cả quản trị đã bật 2FA"} icon={I.users} tone={adminsNo2fa.length ? "rose" : "emerald"} />
      </div>

      {warnings.length > 0 && (
        <div className="card mt-6 border-rose-200 bg-rose-50 p-5">
          <div className="font-bold text-rose-800">{Ld("Cảnh báo đang hoạt động")}</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">{Ld("Khoá khẩn cấp (Emergency Lockdown)")}</div>
            {lockdownOn ? <Badge cls="bg-rose-100 text-rose-700">ĐANG BẬT</Badge> : <Badge cls="bg-emerald-100 text-emerald-700">Đang tắt</Badge>}
          </div>
          <p className="mt-2 text-sm text-slate-500">Khi bật: khách không đăng nhập mới và không đặt đơn/nạp tiền/mua gói được; tài khoản quản trị và chủ panel vẫn vào quản trị bình thường để xử lý sự cố.</p>
          {lockdownOn ? (
            <form action={toggleLockdownAction} className="mt-4">
              <input type="hidden" name="enable" value="0" />
              <button className="btn-primary w-full">Tắt khoá khẩn cấp — mở lại hệ thống</button>
              <p className="mt-2 text-xs text-slate-400">Thao tác yêu cầu xác thực lại (step-up) và được ghi vào nhật ký bất biến.</p>
            </form>
          ) : (
            <form action={toggleLockdownAction} className="mt-4 space-y-3">
              <input type="hidden" name="enable" value="1" />
              <div>
                <label className="lbl">Lý do khoá (hiện cho khách)</label>
                <input className="inp" name="reason" maxLength={300} placeholder="VD: Bảo trì hệ thống thanh toán" />
              </div>
              <button className="btn-danger w-full">Bật khoá khẩn cấp</button>
              <p className="text-xs text-slate-400">Thao tác yêu cầu xác thực lại (step-up), ghi nhật ký bất biến và gửi cảnh báo cho admin qua các kênh đã cấu hình.</p>
            </form>
          )}
        </div>

        <div className="card p-5">
          <div className="font-bold text-slate-900">{Ld("Mã hoá secret của website con")}</div>
          <p className="mt-2 text-sm text-slate-500">Khoá thanh toán, mật khẩu thư và token báo tin của website con được mã hoá khi lưu. Secret cũ dạng rõ vẫn đọc được và tự mã hoá ở lần lưu kế tiếp — hoặc mã hoá ngay toàn bộ tại đây.</p>
          <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Website con còn secret dạng rõ: <b className="text-slate-900">{panelsPlain.length}</b>
            {panelsPlain.length > 0 && <span className="block truncate text-xs text-slate-400">{panelsPlain.map((p) => p.name).join(", ")}</span>}
          </div>
          <form action={encryptAllPanelSecretsAction} className="mt-4">
            <button className="btn-primary w-full" disabled={panelsPlain.length === 0}>Mã hoá toàn bộ secret panel</button>
            <p className="mt-2 text-xs text-slate-400">Chỉ ADMIN web mẹ, yêu cầu xác thực lại (step-up). Cần đặt khoá APP_ENC_KEY trên máy chủ để mã hoá có hiệu lực.</p>
          </form>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">{Ld("Sự kiện đăng nhập gần nhất")}</div>
        {recentLogins.length === 0 ? <Empty text="Chưa có sự kiện đăng nhập" /> : (
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">Thời gian</th><th className="th">Tài khoản</th><th className="th">Kết quả</th><th className="th">IP</th><th className="th">Thiết bị</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {recentLogins.map((e) => (
                <tr key={e.id}>
                  <td className="td whitespace-nowrap">{dt(e.createdAt)}</td>
                  <td className="td font-medium">{e.username}</td>
                  <td className="td">{e.success ? <Badge cls="bg-emerald-100 text-emerald-700">Thành công</Badge> : <Badge cls="bg-rose-100 text-rose-700">Thất bại</Badge>}{e.reason ? <span className="ml-2 text-xs text-slate-400">{e.reason}</span> : null}</td>
                  <td className="td font-mono text-xs">{e.ip || "—"}</td>
                  <td className="td">{e.isNewDevice ? <Badge cls="bg-amber-100 text-amber-700">Thiết bị mới</Badge> : <span className="text-xs text-slate-400">Đã biết</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="px-5 py-3 text-xs text-slate-400">Xem đầy đủ ở mục <Link className="font-semibold text-sky-600" href="/admin/bao-mat">Bảo mật</Link>.</div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="font-bold text-slate-900">{Ld("Nhật ký thao tác bất biến (Audit Log)")} — {auditTotal} {Ld("dòng")}</div>
          {chain.ok ? <Badge cls="bg-emerald-100 text-emerald-700">Chuỗi hash nguyên vẹn ({chain.count} dòng)</Badge> : <Badge cls="bg-rose-100 text-rose-700">CHUỖI HASH GÃY tại #{chain.brokenAt}</Badge>}
        </div>
        <form className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4" method="get">
          <div><label className="lbl">Lọc theo thao tác</label><input className="inp" name="action" defaultValue={actionFilter} placeholder="VD: deposit" /></div>
          <div><label className="lbl">Người thực hiện</label><input className="inp" name="actor" defaultValue={actorFilter} placeholder="VD: admin" /></div>
          <button className="btn-ghost">Lọc</button>
          {(actionFilter || actorFilter) && <Link className="btn-ghost" href="/admin/trung-tam-bao-mat">Xoá lọc</Link>}
        </form>
        {audits.length === 0 ? <Empty text="Chưa có thao tác nhạy cảm nào được ghi" /> : (
          <table className="w-full min-w-[760px]">
            <thead><tr><th className="th">Thời gian</th><th className="th">Người thực hiện</th><th className="th">Thao tác</th><th className="th">Đối tượng</th><th className="th">Chi tiết</th><th className="th">IP</th><th className="th">Hash</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {audits.map((a) => (
                <tr key={a.id}>
                  <td className="td whitespace-nowrap">{dt(a.createdAt)}</td>
                  <td className="td"><b>{a.actorName}</b> <span className="text-xs text-slate-400">({a.role})</span></td>
                  <td className="td">{ACTION_LABEL[a.action] || a.action}</td>
                  <td className="td text-xs">{a.targetType ? `${a.targetType} #${a.targetId ?? ""}` : "—"}</td>
                  <td className="td max-w-[260px] truncate text-xs" title={a.detail || ""}>{a.detail || "—"}</td>
                  <td className="td font-mono text-xs">{a.ip || "—"}</td>
                  <td className="td font-mono text-[10px] text-slate-400" title={a.hash}>{a.hash.slice(0, 10)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-slate-400">Trang {page}/{totalPages}</span>
            <span className="space-x-2">
              {page > 1 && <Link className="btn-ghost" href={`/admin/trung-tam-bao-mat?page=${page - 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}${actorFilter ? `&actor=${encodeURIComponent(actorFilter)}` : ""}`}>Trước</Link>}
              {page < totalPages && <Link className="btn-ghost" href={`/admin/trung-tam-bao-mat?page=${page + 1}${actionFilter ? `&action=${encodeURIComponent(actionFilter)}` : ""}${actorFilter ? `&actor=${encodeURIComponent(actorFilter)}` : ""}`}>Sau</Link>}
            </span>
          </div>
        )}
        <div className="px-5 py-3 text-xs text-slate-400">Nhật ký chỉ ghi thêm, không có chức năng sửa/xoá. Mỗi dòng chứa hash của dòng trước — sửa hoặc xoá bất kỳ dòng nào sẽ làm gãy chuỗi và bị phát hiện tại đây.</div>
      </div>
    </div>
  );
}
