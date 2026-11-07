import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Flash, Stat, I, Badge } from "@/components/ui";
import { updateProfileAction, changePasswordAction, regenApiKeyAction, resendEmailVerificationAction, redeemPointsAction } from "@/app/actions/user";
import { logoutAction } from "@/app/actions/auth";
import { CopyBtn } from "@/components/client";
import { TwoFactorCard } from "@/components/two-factor";
import { ProfileTabs } from "@/components/profile-tabs";
import { backupCodesLeft } from "@/lib/twofa";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { LEVEL_NAME, vnd, num, dt, dshort } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import { trd } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** Tài khoản — bố cục theo panel mẫu: đầu trang avatar + huy hiệu, 4 thẻ nhỏ,
 *  3 tab Hồ sơ cá nhân | Kết nối API | Bảo mật & Phiên đăng nhập. */
export default async function ProfilePage({ searchParams }: { searchParams: { msg?: string; err?: string; tab?: string; bat2fa?: string } }) {
  const user = (await getCurrentUser())!;
  const panelLangRaw = user.panelId
    ? ((await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { langConfig: true } }))?.langConfig ?? null)
    : undefined;
  const { lang } = await getServerI18n(panelLangRaw);
  const tab = searchParams.tab === "api" ? "api" : searchParams.tab === "security" ? "security" : "profile";
  const s = await getSettings();
  const [preCount, commissionAgg, refCount, loginHistory] = await Promise.all([
    prisma.premiumOrder.count({ where: { userId: user.id } }),
    prisma.transaction.aggregate({ where: { userId: user.id, type: { in: ["REFERRAL_COMMISSION", "PANEL_COMMISSION"] }, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.user.count({ where: { referredById: user.id } }),
    prisma.loginEvent.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 20 }),
  ]);
  const adminMust2fa = searchParams.bat2fa === "1" || ((user.role === "ADMIN" || user.role === "STAFF") && s.admin_2fa_required !== "0");
  const initials = (user.fullName || user.username).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const endpoint = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/api/v2`;
  const passwordForm = (
    <form action={changePasswordAction} className="card space-y-4 p-6">
      <div className="font-bold text-slate-900">Đổi mật khẩu</div>
      <div><label className="lbl">Mật khẩu hiện tại</label><input className="inp" name="oldPassword" type="password" required /></div>
      <div><label className="lbl">Mật khẩu mới</label><input className="inp" name="newPassword" type="password" required minLength={6} /></div>
      <div><label className="lbl">Xác nhận mật khẩu mới</label><input className="inp" name="newPassword2" type="password" required minLength={6} /></div>
      <div className="border-t border-slate-100 pt-4">
        <div className="text-sm font-bold text-slate-800">Yêu cầu mật khẩu mới</div>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-500">
          <li className="flex gap-2"><span className="text-emerald-600">•</span>Ít nhất {s.password_min_length || 8} ký tự</li>
          {s.pw_require_upper === "1" && <li className="flex gap-2"><span className="text-emerald-600">•</span>Có ít nhất 1 chữ hoa (A–Z)</li>}
          {s.pw_require_number === "1" && <li className="flex gap-2"><span className="text-emerald-600">•</span>Có ít nhất 1 chữ số (0–9)</li>}
          {s.pw_require_special === "1" && <li className="flex gap-2"><span className="text-emerald-600">•</span>Có ít nhất 1 ký tự đặc biệt (vd: !@#$%)</li>}
          <li className="flex gap-2"><span className="text-emerald-600">•</span>Sau khi đổi, mọi phiên đăng nhập khác sẽ tự đăng xuất</li>
          <li className="flex gap-2"><span className="text-emerald-600">•</span>Mật khẩu được lưu dạng mã hoá một chiều, hệ thống không xem được mật khẩu gốc</li>
        </ul>
      </div>
      <button className="btn-dark">Cập nhật mật khẩu</button>
    </form>
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-lg font-black text-white">{initials}</span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{user.fullName || user.username}</h1>
            <Badge cls="bg-violet-100 text-violet-700">{LEVEL_NAME[user.level]}</Badge>
            <Badge cls="bg-emerald-100 text-emerald-700">Tài khoản: Đang hoạt động</Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">Đây là trang tài khoản cá nhân của bạn · @{user.username}</p>
        </div>
      </div>
      <Flash msg={searchParams.msg} err={searchParams.err} />

      <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Đơn Premium" value={num(preCount)} icon={I.gem} />
        <Stat label="Hoa hồng" value={vnd(commissionAgg._sum.amount || 0)} icon={I.money} />
        <Stat label="Số dư" value={vnd(user.balance)} icon={I.wallet} />
        <Stat label="Cấp bậc" value={LEVEL_NAME[user.level]} icon={I.users} />
      </div>

      <ProfileTabs
        initial={tab}
        labels={{ profile: "Hồ sơ cá nhân", api: "Kết nối API", security: "Bảo mật & Phiên đăng nhập" }}
        profile={(
        <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          <form action={updateProfileAction} className="card space-y-4 p-6 xl:col-span-2">
            <div className="font-bold text-slate-900">Hồ sơ cá nhân</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="lbl">Tên của bạn</label><input className="inp" name="fullName" defaultValue={user.fullName || ""} /></div>
              <div><label className="lbl">Số điện thoại</label><input className="inp" name="phone" defaultValue={user.phone || ""} /></div>
            </div>
            <div>
              <label className="lbl">Email</label>
              <input className="inp" name="email" type="email" defaultValue={user.email} />
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {user.emailVerified
                  ? <Badge cls="bg-emerald-100 text-emerald-700">Email đã xác thực</Badge>
                  : <><Badge cls="bg-amber-100 text-amber-800">Email chưa xác thực</Badge>
                      <form action={resendEmailVerificationAction}><button className="btn-ghost btn-sm">Gửi lại email xác thực</button></form></>}
                <span className="text-xs text-slate-400">Đổi email sẽ cần xác thực lại email mới.</span>
              </div>
            </div>
            <div><label className="lbl">Mã nạp tiền của bạn</label><input className="inp font-mono" value={`SMM ${user.depositCode}`} disabled /></div>
            <div>
              <label className="lbl">Webhook URL — nhận thông báo khi đơn đổi trạng thái (không bắt buộc)</label>
              <input className="inp font-mono" name="webhookUrl" defaultValue={user.webhookUrl || ""} placeholder="https://he-thong-cua-ban.vn/webhook" />
              <p className="mt-1.5 text-xs text-slate-400">Hệ thống POST JSON {"{ event, code, status, note, at }"} tới URL này mỗi khi đơn SMM của bạn chuyển trạng thái.</p>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <div className="font-bold text-slate-900">Thông tin đăng nhập</div>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="lbl">Tên đăng nhập</label><input className="inp font-mono" value={user.username} disabled /></div>
                <div><label className="lbl">Ngày tham gia</label><input className="inp" value={dshort(user.createdAt)} disabled /></div>
              </div>
              <p className="mt-2 text-xs text-slate-400">Đăng nhập gần nhất: {loginHistory[0] ? `${dt(loginHistory[0].createdAt)} · IP ${loginHistory[0].ip}` : "chưa ghi nhận"} — chi tiết ở tab Bảo mật &amp; Phiên đăng nhập.</p>
            </div>
            <button className="btn-primary">Lưu thay đổi</button>
          </form>
          <div className="space-y-6">
            <div className="card p-6">
              <div className="font-bold text-slate-900">Cấp bậc &amp; ưu đãi</div>
              <div className="mt-3 space-y-1.5 text-sm text-slate-500">
                <div className="flex justify-between"><span>Cấp bậc hiện tại</span><b className="text-slate-800">{LEVEL_NAME[user.level]}</b></div>
                <div className="flex justify-between"><span>Tổng chi tiêu tích lũy</span><b className="text-slate-800">{vnd(user.totalSpent)}</b></div>
                <div className="flex justify-between"><span>Giảm giá theo cấp bậc</span><b className="text-brand-700">{levelDiscountFromSettings(s, user.level)}%</b></div>
              </div>
            </div>
            <div className="card p-6">
              <div className="font-bold text-slate-900">Điểm tích luỹ</div>
              <div className="mt-3 space-y-1.5 text-sm text-slate-500">
                <div className="flex justify-between"><span>Điểm hiện có</span><b className="text-slate-800">{`${num(user.points)} ${trd(lang, "điểm")}`}</b></div>
                <div className="flex justify-between"><span>Giá trị quy đổi</span><b className="text-slate-800">{vnd(user.points * (parseInt(s.points_value_vnd || "100") || 100))}</b></div>
                <div className="flex justify-between"><span>Nhận điểm</span><b className="text-slate-800">{s.points_per_100k} điểm / 100.000đ đơn hoàn thành</b></div>
              </div>
              <form action={redeemPointsAction} className="mt-4 flex gap-2">
                <input className="inp" name="points" type="number" min={parseInt(s.points_min_redeem || "10") || 10} placeholder={`${trd(lang, "Từ")} ${s.points_min_redeem} ${trd(lang, "điểm")}`} />
                <button className="btn-primary whitespace-nowrap">Đổi ra số dư</button>
              </form>
              <p className="mt-2 text-xs text-slate-400">Điểm cộng tự động khi đơn hoàn thành, đổi ra số dư ví ngay tại đây.</p>
            </div>
            <div className="card p-6">
              <div className="font-bold text-slate-900">Giới thiệu bạn bè</div>
              <p className="mt-2 text-sm text-slate-500">Bạn đã giới thiệu <b className="text-slate-800">{num(refCount)}</b> người tham gia.</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">Hoa hồng <b className="text-slate-800">{s.affiliate_percent}%</b> trên mỗi đơn mua của người được giới thiệu.</p>
              <Link href="/dashboard/kiem-tien" className="btn-ghost btn-sm mt-3">Lấy link giới thiệu</Link>
            </div>
          </div>
        </div>
        )}

        api={(
        <div className="card mt-6 space-y-5 p-6">
          <div className="font-bold text-slate-900">API kết nối tài khoản</div>
          <div>
            <label className="lbl">API Endpoint</label>
            <div className="flex gap-2"><input className="inp font-mono" readOnly value={endpoint} /><CopyBtn text={endpoint} /></div>
          </div>
          <div>
            <label className="lbl">API Key của tôi</label>
            <div className="flex flex-wrap gap-2">
              <input className="inp min-w-[260px] flex-1 font-mono" readOnly value={user.apiKey} />
              <CopyBtn text={user.apiKey} />
              <form action={regenApiKeyAction}><button className="btn-danger btn-sm whitespace-nowrap !py-2.5">Tạo mới khóa API</button></form>
            </div>
            <p className="mt-2 text-xs text-slate-400">Trạng thái: Đang hoạt động. Giữ key bí mật như mật khẩu — tạo key mới sẽ làm key cũ hết hiệu lực ngay.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <b className="text-slate-800">{trd(lang, "Hướng dẫn sử dụng API:")}</b> {trd(lang, "xem tài liệu đầy đủ kèm ví dụ cURL/PHP/Python tại")}{" "}
            <Link href="/dashboard/api-docs" className="font-semibold text-brand-600">Tài liệu API</Link>. {trd(lang, "Dùng key này để đặt đơn, tra trạng thái và số dư tự động qua endpoint phía trên.")}
          </div>
        </div>
        )}

        security={(
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
            {passwordForm}
            <div className="space-y-6">
              <TwoFactorCard enabled={user.totpEnabled} backupLeft={backupCodesLeft(user.backupCodes)} required={adminMust2fa && !user.totpEnabled} />
              <div className="card space-y-4 p-6">
                <div className="font-bold text-slate-900">Phiên đăng nhập</div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Trình duyệt hiện tại</div>
                    <div className="text-xs text-slate-400">Phiên đăng nhập của bạn trên thiết bị này</div>
                  </div>
                  <Badge cls="bg-emerald-100 text-emerald-700">Đang online</Badge>
                </div>
                <p className="text-sm text-slate-500">Khi đăng nhập ở trình duyệt hoặc thiết bị khác, hãy giữ mật khẩu và API key bí mật. Đăng xuất sẽ kết thúc phiên hiện tại.</p>
                <div className="text-sm text-slate-500">
                  <div className="flex justify-between gap-3"><span>Đăng nhập gần nhất</span><b className="text-slate-700">{loginHistory[0] ? dt(loginHistory[0].createdAt) : "—"}</b></div>
                </div>
                <form action={logoutAction}><button className="btn-ghost">Đăng xuất khỏi thiết bị này</button></form>
              </div>
            </div>
          </div>
          <div className="card overflow-x-auto">
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">Lịch sử đăng nhập của bạn</div>
            {loginHistory.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">Chưa có lần đăng nhập nào được ghi nhận.</p>
            ) : (
              <table className="w-full min-w-[640px]">
                <thead><tr><th className="th">Kết quả</th><th className="th">IP</th><th className="th">Thiết bị / trình duyệt</th><th className="th">Chi tiết</th><th className="th">Thời gian</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {loginHistory.map((ev) => (
                    <tr key={ev.id}>
                      <td className="td">{ev.success ? <Badge cls="bg-emerald-100 text-emerald-700">Thành công</Badge> : <Badge cls="bg-rose-100 text-rose-700">Thất bại</Badge>}</td>
                      <td className="td font-mono text-[13px]">{ev.ip}{ev.isNewDevice ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">Thiết bị mới</span> : null}</td>
                      <td className="td max-w-[280px] truncate text-slate-500">{ev.userAgent || "—"}</td>
                      <td className="td text-slate-500">{ev.reason || "—"}</td>
                      <td className="td whitespace-nowrap text-slate-500">{dt(ev.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      />
    </div>
  );
}
