import Link from "next/link";
import { requireAdminPage, currentIp } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Empty, Badge, CardHead, I } from "@/components/ui";
import { saveIpBanAction, deleteIpBanAction, saveSecurityPolicyAction } from "@/app/actions/admin-features";
import { dt } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminSecurity({ searchParams }: { searchParams: { msg?: string; err?: string; fail?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
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
      <PageHead title={L("Bảo mật nâng cao")} desc={L("Chặn IP lạm dụng và chính sách mật khẩu. IP bị chặn sẽ không đăng nhập / đăng ký được.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form action={saveSecurityPolicyAction} className="card mb-6 overflow-hidden">
        <CardHead icon={I.shield} tone="brand" title={L("Bảo mật khu quản trị (2FA + IP được phép)")} />
        <div className="space-y-4 p-5 pt-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="lbl">{L("Bắt buộc tài khoản quản trị bật xác thực hai lớp (2FA)")}</label>
            <select className="inp" name="admin_2fa_required" defaultValue={s.admin_2fa_required === "0" ? "0" : "1"}>
              <option value="1">{Ld("Bật — Admin/Staff chưa bật 2FA chưa vào được khu quản trị")}</option>
              <option value="0">{Ld("Tắt — không bắt buộc")}</option>
            </select>
            <p className="mt-1.5 text-xs text-slate-400">{L("Áp cho Admin/Staff web mẹ và chủ/Admin của panel con. Người chưa bật 2FA được dẫn tới Hồ sơ → Bảo mật để thiết lập, không bị khoá tài khoản.")}</p>
          </div>
          <div>
            <label className="lbl">{L("IP được phép vào khu quản trị (mỗi dòng 1 IP, để trống = không giới hạn)")}</label>
            <textarea className="inp font-mono" name="admin_ip_whitelist" rows={3} defaultValue={s.admin_ip_whitelist} placeholder={"VD:\n203.0.113.10"} />
            <p className="mt-1.5 text-xs text-slate-400">{Ld("IP hiện tại của bạn:")} <b className="font-mono text-slate-700">{myIp}</b> {Ld("— hãy thêm IP này trước khi lưu danh sách, tránh tự khoá mình khỏi khu quản trị.")}</p>
          </div>
        </div>
        <button className="btn-primary">{L("Lưu bảo mật khu quản trị")}</button>
        </div>
      </form>
      <form action={saveIpBanAction} className="card overflow-hidden">
        <CardHead icon={I.ban} tone="rose" title={L("Chặn một IP")} />
        <div className="p-5 pt-4">
        <div className="grid grid-cols-1 items-end gap-4 lg:grid-cols-[1fr_1.5fr_auto]">
          <div><label className="lbl">{L("Địa chỉ IP")}</label><input className="inp" name="ip" required placeholder="VD: 203.0.113.10" /></div>
          <div><label className="lbl">{L("Lý do")}</label><input className="inp" name="reason" placeholder={L("Spam đăng ký, dò mật khẩu...")} /></div>
          <button className="btn-primary whitespace-nowrap">{L("Thêm vào danh sách chặn")}</button>
        </div>
        </div>
      </form>
      <div className="card mt-6 overflow-x-auto">
          <CardHead icon={I.ban} tone="slate" title={L("Danh sách IP bị chặn")}>
            <Badge cls="bg-slate-100 text-slate-600">{Ld(`${bans.length} IP`)}</Badge>
          </CardHead>
          {bans.length === 0 ? <Empty text={L("Chưa chặn IP nào")} /> : (
            <table className="w-full min-w-[480px]">
              <thead><tr><th className="th">IP</th><th className="th">{L("Lý do")}</th><th className="th">{L("Thời gian chặn")}</th><th className="th"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {bans.map((b, i) => (
                  <tr key={b.id} className={i % 2 ? "bg-slate-50/60" : undefined}>
                    <td className="td font-mono text-sm font-semibold">{b.ip}</td>
                    <td className="td text-slate-500">{b.reason || "—"}</td>
                    <td className="td whitespace-nowrap text-slate-500">{dt(b.createdAt)}</td>
                    <td className="td"><form action={deleteIpBanAction}><input type="hidden" name="id" value={b.id} /><button className="btn-ghost btn-sm !text-rose-600">{L("Bỏ chặn")}</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <form action={saveSecurityPolicyAction} className="card overflow-hidden">
          <CardHead icon={I.lock} tone="violet" title={L("Chính sách mật khẩu")} />
          <div className="space-y-4 p-5 pt-4">
          <div><label className="lbl">{L("Độ dài tối thiểu (ký tự)")}</label><input className="inp" name="password_min_length" type="number" min={4} max={32} defaultValue={s.password_min_length} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="lbl">{L("Chữ hoa")}</label>
              <select className="inp" name="pw_require_upper" defaultValue={s.pw_require_upper === "1" ? "1" : "0"}><option value="0">{Ld("Không bắt")}</option><option value="1">{Ld("Bắt buộc")}</option></select></div>
            <div><label className="lbl">{L("Chữ số")}</label>
              <select className="inp" name="pw_require_number" defaultValue={s.pw_require_number === "1" ? "1" : "0"}><option value="0">{Ld("Không bắt")}</option><option value="1">{Ld("Bắt buộc")}</option></select></div>
            <div><label className="lbl">{L("Ký tự đặc biệt")}</label>
              <select className="inp" name="pw_require_special" defaultValue={s.pw_require_special === "1" ? "1" : "0"}><option value="0">{Ld("Không bắt")}</option><option value="1">{Ld("Bắt buộc")}</option></select></div>
          </div>
          <div className="border-t border-slate-100 pt-4 font-bold text-slate-900">{L("Phòng chống Brute Force")}</div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="lbl">{L("Trạng thái")}</label>
              <select className="inp" name="bf_enabled" defaultValue={s.bf_enabled === "0" ? "0" : "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt")}</option></select></div>
            <div><label className="lbl">{L("Sai tối đa (lần)")}</label><input className="inp" name="bf_max_attempts" type="number" min={3} max={100} defaultValue={s.bf_max_attempts} /></div>
            <div><label className="lbl">{L("Khoá (giây)")}</label><input className="inp" name="bf_lock_seconds" type="number" min={30} max={86400} defaultValue={s.bf_lock_seconds} /></div>
          </div>
          <button className="btn-primary">{L("Lưu cấu hình bảo mật")}</button>
          </div>
        </form>
        <form action={saveSecurityPolicyAction} className="card overflow-hidden">
          <CardHead icon={I.users} tone="brand" title={L("Bảo mật đăng ký")} />
          <div className="space-y-4 p-5 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">{L("Honeypot chống bot")}</label>
              <select className="inp" name="reg_honeypot" defaultValue={s.reg_honeypot === "0" ? "0" : "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt")}</option></select></div>
            <div><label className="lbl">{L("Chặn email dùng 1 lần")}</label>
              <select className="inp" name="reg_block_disposable" defaultValue={s.reg_block_disposable === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select></div>
          </div>
          <div><label className="lbl">{L("Số lần đăng ký tối đa / IP / giờ (0 = không giới hạn)")}</label><input className="inp" name="reg_max_per_ip_hour" type="number" min={0} max={1000} defaultValue={s.reg_max_per_ip_hour} /></div>
          <div><label className="lbl">{L("Danh sách tên miền email bị cấm (mỗi dòng 1 tên miền)")}</label><textarea className="inp font-mono" name="reg_banned_domains" rows={4} defaultValue={s.reg_banned_domains} /></div>
          <button className="btn-primary">{L("Lưu bảo mật đăng ký")}</button>
          </div>
        </form>
      </div>
      <div className="card mt-6 overflow-x-auto">
        <CardHead icon={I.history} tone="blue" title={L("Lịch sử đăng nhập gần đây")}>
          <span className="flex gap-2 text-sm font-semibold">
            <Link href="/admin/bao-mat" className={!onlyFail ? "text-brand-700" : "text-slate-400 hover:text-slate-700"}>{L("Tất cả")}</Link>
            <span className="text-slate-300">|</span>
            <Link href="/admin/bao-mat?fail=1" className={onlyFail ? "text-rose-600" : "text-slate-400 hover:text-slate-700"}>{L("Chỉ lần thất bại")}</Link>
          </span>
        </CardHead>
        {logins.length === 0 ? <Empty text={L("Chưa có lần đăng nhập nào được ghi nhận")} /> : (
          <table className="w-full min-w-[720px]">
            <thead><tr><th className="th">{L("Tài khoản")}</th><th className="th">{L("Kết quả")}</th><th className="th">IP</th><th className="th">{L("Chi tiết")}</th><th className="th">{L("Thời gian")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {logins.map((ev, i) => (
                <tr key={ev.id} className={i % 2 ? "bg-slate-50/60" : undefined}>
                  <td className="td font-medium">@{ev.username}</td>
                  <td className="td">{ev.success ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Thành công")}</Badge> : <Badge cls="bg-rose-100 text-rose-700">{L("Thất bại")}</Badge>}{ev.isNewDevice ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{L("Thiết bị mới")}</span> : null}</td>
                  <td className="td font-mono text-[13px]">{ev.ip}</td>
                  <td className="td max-w-[260px] truncate text-slate-500" title={ev.userAgent || ""}>{ev.reason ? Ld(ev.reason) : "—"}</td>
                  <td className="td whitespace-nowrap text-slate-500">{dt(ev.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card mt-6 overflow-x-auto">
        <CardHead icon={I.list} tone="slate" title={L("Nhật ký hoạt động hệ thống")} />
        {activity.length === 0 ? <Empty text={L("Chưa có hoạt động nào được ghi")} /> : (
          <table className="w-full min-w-[560px]">
            <thead><tr><th className="th">{L("Loại")}</th><th className="th">{L("Chi tiết")}</th><th className="th">{L("Thời gian")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {activity.map((a, i) => (
                <tr key={a.id} className={i % 2 ? "bg-slate-50/60" : undefined}>
                  <td className="td"><Badge cls="bg-slate-100 text-slate-600">{L(KIND_LABEL[a.kind] || a.kind)}</Badge></td>
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
