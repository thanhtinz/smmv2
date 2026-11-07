import Link from "next/link";
import { requireAdminPage, currentIp } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Empty, Badge } from "@/components/ui";
import { saveIpBanAction, deleteIpBanAction, saveSecurityPolicyAction } from "@/app/actions/admin-features";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminSecurity({ searchParams }: { searchParams: { msg?: string; err?: string; fail?: string } }) {
  await requireAdminPage();
  const { Ld } = await getServerI18n(null);
  const onlyFail = searchParams.fail === "1";
  const [bans, s, activity, logins] = await Promise.all([
    prisma.ipBan.findMany({ orderBy: { id: "desc" }, take: 200 }),
    getSettings(),
    prisma.apiLog.findMany({ where: { kind: { in: ["bulk_price", "email_marketing", "cleanup", "price_change"] } }, orderBy: { id: "desc" }, take: 15 }),
    prisma.loginEvent.findMany({ where: onlyFail ? { success: false } : {}, orderBy: { id: "desc" }, take: 50 }),
  ]);
  const myIp = currentIp();
  const KIND_LABEL: Record<string, string> = { bulk_price: "Chỉnh giá hàng loạt", email_marketing: "Gửi email marketing", cleanup: "Dọn dẹp hệ thống", price_change: "Nguồn đổi giá vốn" };
  return (
    <div>
      <PageHead title="Bảo mật nâng cao" desc="Chặn IP lạm dụng và chính sách mật khẩu. IP bị chặn sẽ không đăng nhập / đăng ký được." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form action={saveSecurityPolicyAction} className="card mb-6 space-y-4 p-5">
        <div className="font-bold text-slate-900">Bảo mật khu quản trị (2FA + IP được phép)</div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="lbl">Bắt buộc tài khoản quản trị bật xác thực hai lớp (2FA)</label>
            <select className="inp" name="admin_2fa_required" defaultValue={s.admin_2fa_required === "0" ? "0" : "1"}>
              <option value="1">{Ld("Bật — Admin/Staff chưa bật 2FA chưa vào được khu quản trị")}</option>
              <option value="0">{Ld("Tắt — không bắt buộc")}</option>
            </select>
            <p className="mt-1.5 text-xs text-slate-400">Áp cho Admin/Staff web mẹ và chủ/Admin của panel con. Người chưa bật 2FA được dẫn tới Hồ sơ → Bảo mật để thiết lập, không bị khoá tài khoản.</p>
          </div>
          <div>
            <label className="lbl">IP được phép vào khu quản trị (mỗi dòng 1 IP, để trống = không giới hạn)</label>
            <textarea className="inp font-mono" name="admin_ip_whitelist" rows={3} defaultValue={s.admin_ip_whitelist} placeholder={"VD:\n203.0.113.10"} />
            <p className="mt-1.5 text-xs text-slate-400">{Ld("IP hiện tại của bạn:")} <b className="font-mono text-slate-700">{myIp}</b> {Ld("— hãy thêm IP này trước khi lưu danh sách, tránh tự khoá mình khỏi khu quản trị.")}</p>
          </div>
        </div>
        <button className="btn-primary">Lưu bảo mật khu quản trị</button>
      </form>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <form action={saveIpBanAction} className="card space-y-4 p-5">
            <div className="font-bold text-slate-900">Chặn một IP</div>
            <div><label className="lbl">Địa chỉ IP</label><input className="inp" name="ip" required placeholder="VD: 203.0.113.10" /></div>
            <div><label className="lbl">Lý do</label><textarea className="inp" name="reason" rows={2} placeholder="Spam đăng ký, dò mật khẩu..." /></div>
            <button className="btn-primary">Thêm vào danh sách chặn</button>
          </form>
        </div>
        <div className="card overflow-x-auto">
          <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Danh sách IP bị chặn ({bans.length})</div>
          {bans.length === 0 ? <Empty text="Chưa chặn IP nào" /> : (
            <table className="w-full min-w-[480px]">
              <thead><tr><th className="th">IP</th><th className="th">Lý do</th><th className="th">Thời gian chặn</th><th className="th"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {bans.map((b) => (
                  <tr key={b.id}>
                    <td className="td font-mono text-sm font-semibold">{b.ip}</td>
                    <td className="td text-slate-500">{b.reason || "—"}</td>
                    <td className="td whitespace-nowrap text-slate-500">{dt(b.createdAt)}</td>
                    <td className="td"><form action={deleteIpBanAction}><input type="hidden" name="id" value={b.id} /><button className="btn-ghost btn-sm !text-rose-600">Bỏ chặn</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <form action={saveSecurityPolicyAction} className="card space-y-4 p-5">
          <div className="font-bold text-slate-900">Chính sách mật khẩu</div>
          <div><label className="lbl">Độ dài tối thiểu (ký tự)</label><input className="inp" name="password_min_length" type="number" min={4} max={32} defaultValue={s.password_min_length} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="lbl">Chữ hoa</label>
              <select className="inp" name="pw_require_upper" defaultValue={s.pw_require_upper === "1" ? "1" : "0"}><option value="0">{Ld("Không bắt")}</option><option value="1">{Ld("Bắt buộc")}</option></select></div>
            <div><label className="lbl">Chữ số</label>
              <select className="inp" name="pw_require_number" defaultValue={s.pw_require_number === "1" ? "1" : "0"}><option value="0">{Ld("Không bắt")}</option><option value="1">{Ld("Bắt buộc")}</option></select></div>
            <div><label className="lbl">Ký tự đặc biệt</label>
              <select className="inp" name="pw_require_special" defaultValue={s.pw_require_special === "1" ? "1" : "0"}><option value="0">{Ld("Không bắt")}</option><option value="1">{Ld("Bắt buộc")}</option></select></div>
          </div>
          <div className="border-t border-slate-100 pt-4 font-bold text-slate-900">Phòng chống Brute Force</div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="lbl">Trạng thái</label>
              <select className="inp" name="bf_enabled" defaultValue={s.bf_enabled === "0" ? "0" : "1"}><option value="1">Bật</option><option value="0">Tắt</option></select></div>
            <div><label className="lbl">Sai tối đa (lần)</label><input className="inp" name="bf_max_attempts" type="number" min={3} max={100} defaultValue={s.bf_max_attempts} /></div>
            <div><label className="lbl">Khoá (giây)</label><input className="inp" name="bf_lock_seconds" type="number" min={30} max={86400} defaultValue={s.bf_lock_seconds} /></div>
          </div>
          <button className="btn-primary">Lưu cấu hình bảo mật</button>
        </form>
        <form action={saveSecurityPolicyAction} className="card space-y-4 p-5">
          <div className="font-bold text-slate-900">Bảo mật đăng ký</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Honeypot chống bot</label>
              <select className="inp" name="reg_honeypot" defaultValue={s.reg_honeypot === "0" ? "0" : "1"}><option value="1">Bật</option><option value="0">Tắt</option></select></div>
            <div><label className="lbl">Chặn email dùng 1 lần</label>
              <select className="inp" name="reg_block_disposable" defaultValue={s.reg_block_disposable === "1" ? "1" : "0"}><option value="0">Tắt</option><option value="1">Bật</option></select></div>
          </div>
          <div><label className="lbl">Số lần đăng ký tối đa / IP / giờ (0 = không giới hạn)</label><input className="inp" name="reg_max_per_ip_hour" type="number" min={0} max={1000} defaultValue={s.reg_max_per_ip_hour} /></div>
          <div><label className="lbl">Danh sách tên miền email bị cấm (mỗi dòng 1 tên miền)</label><textarea className="inp font-mono" name="reg_banned_domains" rows={5} defaultValue={s.reg_banned_domains} /></div>
          <button className="btn-primary">Lưu bảo mật đăng ký</button>
        </form>
      </div>
      <div className="card mt-6 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="font-bold text-slate-900">Lịch sử đăng nhập gần đây</span>
          <span className="ml-auto flex gap-2 text-sm font-semibold">
            <Link href="/admin/bao-mat" className={!onlyFail ? "text-brand-700" : "text-slate-400 hover:text-slate-700"}>Tất cả</Link>
            <span className="text-slate-300">|</span>
            <Link href="/admin/bao-mat?fail=1" className={onlyFail ? "text-rose-600" : "text-slate-400 hover:text-slate-700"}>Chỉ lần thất bại</Link>
          </span>
        </div>
        {logins.length === 0 ? <Empty text="Chưa có lần đăng nhập nào được ghi nhận" /> : (
          <table className="w-full min-w-[720px]">
            <thead><tr><th className="th">Tài khoản</th><th className="th">Kết quả</th><th className="th">IP</th><th className="th">Chi tiết</th><th className="th">Thời gian</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {logins.map((ev) => (
                <tr key={ev.id}>
                  <td className="td font-medium">@{ev.username}{ev.panelId ? <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700">Panel #{ev.panelId}</span> : null}</td>
                  <td className="td">{ev.success ? <Badge cls="bg-emerald-100 text-emerald-700">Thành công</Badge> : <Badge cls="bg-rose-100 text-rose-700">Thất bại</Badge>}{ev.isNewDevice ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">Thiết bị mới</span> : null}</td>
                  <td className="td font-mono text-[13px]">{ev.ip}</td>
                  <td className="td max-w-[260px] truncate text-slate-500" title={ev.userAgent || ""}>{ev.reason || "—"}</td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(ev.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card mt-6 overflow-x-auto">
        <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Nhật ký hoạt động hệ thống</div>
        {activity.length === 0 ? <Empty text="Chưa có hoạt động nào được ghi" /> : (
          <table className="w-full min-w-[560px]">
            <thead><tr><th className="th">Loại</th><th className="th">Chi tiết</th><th className="th">Thời gian</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {activity.map((a) => (
                <tr key={a.id}>
                  <td className="td font-medium">{KIND_LABEL[a.kind] || a.kind}</td>
                  <td className="td"><span className="text-slate-500">{a.detail || a.ref || "—"}</span></td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
