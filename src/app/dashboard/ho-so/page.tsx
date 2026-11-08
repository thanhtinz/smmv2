import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser, getSession, currentIp } from "@/lib/auth";
import { revokeSessionAction, revokeOtherSessionsAction } from "@/app/actions/sessions";
import { Flash, Stat, I, Badge, DeviceTile, deviceKind } from "@/components/ui";
import { updateProfileAction, changePasswordAction, regenApiKeyAction, saveApiKeyIpsAction, resendEmailVerificationAction, redeemPointsAction } from "@/app/actions/user";
import { logoutAction } from "@/app/actions/auth";
import { CopyBtn, ApiKeyReveal } from "@/components/client";
import { TwoFactorCard } from "@/components/two-factor";
import { PasskeySection } from "@/components/passkey";
import { ProfileTabs } from "@/components/profile-tabs";
import { backupCodesLeft } from "@/lib/twofa";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { LEVEL_NAME, num, dt, dshort, relTime } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Tên thiết bị thân thiện từ userAgent: "Chrome · Windows"; không suy ra được thì null. */
function parseUaLabel(ua?: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  if (browser && os) return `${browser} · ${os}`;
  return browser || os;
}

/** Tài khoản — bố cục theo panel mẫu: đầu trang avatar + huy hiệu, 4 thẻ nhỏ,
 *  3 tab Hồ sơ cá nhân | Kết nối API | Bảo mật & Phiên đăng nhập. */
export default async function ProfilePage({ searchParams }: { searchParams: { msg?: string; err?: string; tab?: string; bat2fa?: string } }) {
  const user = (await getCurrentUser())!;
  const panelLangRaw = user.panelId
    ? ((await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { langConfig: true } }))?.langConfig ?? null)
    : undefined;
  const { L, Ld, M } = await getServerI18n(panelLangRaw);
  const tab = searchParams.tab === "api" ? "api" : searchParams.tab === "security" ? "security" : "profile";
  const s = await getSettings();
  const [preCount, commissionAgg, refCount, loginHistory, mySessions, curSession, myPasskeys] = await Promise.all([
    prisma.premiumOrder.count({ where: { userId: user.id } }),
    prisma.transaction.aggregate({ where: { userId: user.id, type: { in: ["REFERRAL_COMMISSION", "PANEL_COMMISSION"] }, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.user.count({ where: { referredById: user.id } }),
    prisma.loginEvent.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 20 }),
    prisma.userSession.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 20 }),
    getSession(),
    prisma.userPasskey.findMany({ where: { userId: user.id }, orderBy: { id: "desc" } }),
  ]);
  const myIp = currentIp();
  const adminMust2fa = searchParams.bat2fa === "1" || ((user.role === "ADMIN" || user.role === "STAFF") && s.admin_2fa_required !== "0");
  const initials = (user.fullName || user.username).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const endpoint = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/api/v2`;
  const passwordForm = (
    <form action={changePasswordAction} className="card space-y-4 p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30">{I.lock}</span>
        <div className="font-bold text-slate-900">{L("Đổi mật khẩu")}</div>
      </div>
      <div><label className="lbl">{L("Mật khẩu hiện tại")}</label><input className="inp" name="oldPassword" type="password" required /></div>
      <div><label className="lbl">{L("Mật khẩu mới")}</label><input className="inp" name="newPassword" type="password" required minLength={6} /></div>
      <div><label className="lbl">{L("Xác nhận mật khẩu mới")}</label><input className="inp" name="newPassword2" type="password" required minLength={6} /></div>
      <div className="border-t border-slate-100 pt-4">
        <div className="text-sm font-bold text-slate-800">{L("Yêu cầu mật khẩu mới")}</div>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-500">
          <li className="flex gap-2"><span className="shrink-0 text-emerald-500 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{`${L("Ít nhất ")}${s.password_min_length || 8}${L(" ký tự")}`}</li>
          {s.pw_require_upper === "1" && <li className="flex gap-2"><span className="shrink-0 text-emerald-500 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Có ít nhất 1 chữ hoa (A–Z)")}</li>}
          {s.pw_require_number === "1" && <li className="flex gap-2"><span className="shrink-0 text-emerald-500 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Có ít nhất 1 chữ số (0–9)")}</li>}
          {s.pw_require_special === "1" && <li className="flex gap-2"><span className="shrink-0 text-emerald-500 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Có ít nhất 1 ký tự đặc biệt (vd: !@#$%)")}</li>}
          <li className="flex gap-2"><span className="shrink-0 text-emerald-500 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Sau khi đổi, mọi phiên đăng nhập khác sẽ tự đăng xuất")}</li>
          <li className="flex gap-2"><span className="shrink-0 text-emerald-500 [&_svg]:h-4 [&_svg]:w-4">{I.check}</span>{L("Mật khẩu được lưu dạng mã hoá một chiều, hệ thống không xem được mật khẩu gốc")}</li>
        </ul>
      </div>
      <button className="btn-dark">{L("Cập nhật mật khẩu")}</button>
    </form>
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-lg font-black text-white">{initials}</span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{user.fullName || user.username}</h1>
            <Badge cls="bg-violet-100 text-violet-700">{L(LEVEL_NAME[user.level])}</Badge>
            <Badge cls="bg-emerald-100 text-emerald-700">{L("Tài khoản: Đang hoạt động")}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{L("Đây là trang tài khoản cá nhân của bạn · @")}{user.username}</p>
        </div>
      </div>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label={L("Đơn Premium")} value={num(preCount)} icon={I.gem} />
        <Stat label={L("Hoa hồng")} value={M(commissionAgg._sum.amount || 0)} icon={I.money} />
        <Stat label={L("Số dư")} value={M(user.balance)} icon={I.wallet} />
        <Stat label={L("Cấp bậc")} value={L(LEVEL_NAME[user.level])} icon={I.users} />
      </div>

      <ProfileTabs
        initial={tab}
        labels={{ profile: L("Hồ sơ cá nhân"), api: L("Kết nối API"), security: L("Bảo mật & Phiên đăng nhập") }}
        profile={(
        <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          <form action={updateProfileAction} className="card space-y-4 p-6 xl:col-span-2">
            <div className="font-bold text-slate-900">{L("Hồ sơ cá nhân")}</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="lbl">{L("Tên của bạn")}</label><input className="inp" name="fullName" defaultValue={user.fullName || ""} /></div>
              <div><label className="lbl">{L("Số điện thoại")}</label><input className="inp" name="phone" defaultValue={user.phone || ""} /></div>
            </div>
            <div>
              <label className="lbl">Email</label>
              <input className="inp" name="email" type="email" defaultValue={user.email} />
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {user.emailVerified
                  ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Email đã xác thực")}</Badge>
                  : <><Badge cls="bg-amber-100 text-amber-800">{L("Email chưa xác thực")}</Badge>
                      <form action={resendEmailVerificationAction}><button className="btn-ghost btn-sm">{L("Gửi lại email xác thực")}</button></form></>}
                <span className="text-xs text-slate-400">{L("Đổi email sẽ cần xác thực lại email mới.")}</span>
              </div>
            </div>
            <div><label className="lbl">{L("Mã nạp tiền của bạn")}</label><input className="inp font-mono" value={`SMM ${user.depositCode}`} disabled /></div>
            <div>
              <label className="lbl">{L("Webhook URL — nhận thông báo khi đơn đổi trạng thái (không bắt buộc)")}</label>
              <input className="inp font-mono" name="webhookUrl" defaultValue={user.webhookUrl || ""} placeholder="https://he-thong-cua-ban.vn/webhook" />
              <p className="mt-1.5 text-xs text-slate-400">{L("Hệ thống POST JSON { event, code, status, note, at } tới URL này mỗi khi đơn SMM của bạn chuyển trạng thái.")}</p>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <div className="font-bold text-slate-900">{L("Thông tin đăng nhập")}</div>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className="lbl">{L("Tên đăng nhập")}</label><input className="inp font-mono" value={user.username} disabled /></div>
                <div><label className="lbl">{L("Ngày tham gia")}</label><input className="inp" value={dshort(user.createdAt)} disabled /></div>
              </div>
              <p className="mt-2 text-xs text-slate-400">{L("Đăng nhập gần nhất:")} {loginHistory[0] ? `${dt(loginHistory[0].createdAt)} · IP ${loginHistory[0].ip}` : L("chưa ghi nhận")} — {L("chi tiết ở tab Bảo mật & Phiên đăng nhập.")}</p>
            </div>
            <button className="btn-primary">{L("Lưu thay đổi")}</button>
          </form>
          <div className="space-y-6">
            <div className="card p-6">
              <div className="font-bold text-slate-900">{L("Cấp bậc & ưu đãi")}</div>
              <div className="mt-3 space-y-1.5 text-sm text-slate-500">
                <div className="flex justify-between"><span>{L("Cấp bậc hiện tại")}</span><b className="text-slate-800">{L(LEVEL_NAME[user.level])}</b></div>
                <div className="flex justify-between"><span>{L("Tổng chi tiêu tích lũy")}</span><b className="text-slate-800">{M(user.totalSpent)}</b></div>
                <div className="flex justify-between"><span>{L("Giảm giá theo cấp bậc")}</span><b className="text-brand-700">{levelDiscountFromSettings(s, user.level)}%</b></div>
              </div>
            </div>
            <div className="card p-6">
              <div className="font-bold text-slate-900">{L("Điểm tích luỹ")}</div>
              <div className="mt-3 space-y-1.5 text-sm text-slate-500">
                <div className="flex justify-between"><span>{L("Điểm hiện có")}</span><b className="text-slate-800">{`${num(user.points)} ${L("điểm")}`}</b></div>
                <div className="flex justify-between"><span>{L("Giá trị quy đổi")}</span><b className="text-slate-800">{M(user.points * (parseInt(s.points_value_vnd || "100") || 100))}</b></div>
                <div className="flex justify-between"><span>{L("Nhận điểm")}</span><b className="text-slate-800">{`${s.points_per_100k} ${L("điểm / 100.000đ đơn hoàn thành")}`}</b></div>
              </div>
              <form action={redeemPointsAction} className="mt-4 flex gap-2">
                <input className="inp" name="points" type="number" min={parseInt(s.points_min_redeem || "10") || 10} placeholder={`${L("Từ")} ${s.points_min_redeem} ${L("điểm")}`} />
                <button className="btn-primary whitespace-nowrap">{L("Đổi ra số dư")}</button>
              </form>
              <p className="mt-2 text-xs text-slate-400">{L("Điểm cộng tự động khi đơn hoàn thành, đổi ra số dư ví ngay tại đây.")}</p>
            </div>
            <div className="card p-6">
              <div className="font-bold text-slate-900">{L("Giới thiệu bạn bè")}</div>
              <p className="mt-2 text-sm text-slate-500">{L("Bạn đã giới thiệu")} <b className="text-slate-800">{num(refCount)}</b> {L("người tham gia.")}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{L("Hoa hồng")} <b className="text-slate-800">{s.affiliate_percent}%</b> {L("trên mỗi đơn mua của người được giới thiệu.")}</p>
              <Link href="/dashboard/kiem-tien" className="btn-ghost btn-sm mt-3">{L("Lấy link giới thiệu")}</Link>
            </div>
          </div>
        </div>
        )}

        api={(
        <div className="card mt-6 space-y-5 p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30">{I.key}</span>
            <div className="font-bold text-slate-900">{L("API kết nối tài khoản")}</div>
          </div>
          <div>
            <label className="lbl">API Endpoint</label>
            <div className="flex gap-2"><input className="inp font-mono" readOnly value={endpoint} /><CopyBtn text={endpoint} /></div>
          </div>
          <div>
            <label className="lbl">{L("API Key của tôi")}</label>
            <div className="flex flex-wrap gap-2">
              <ApiKeyReveal value={user.apiKey} />
              <form action={regenApiKeyAction}><button className="btn-danger btn-sm whitespace-nowrap !py-2.5">{L("Tạo mới khóa API")}</button></form>
            </div>
            <p className="mt-2 text-xs text-slate-400">{L("Trạng thái: Đang hoạt động. Giữ key bí mật như mật khẩu — tạo key mới sẽ làm key cũ hết hiệu lực ngay.")}</p>
          </div>
          <form action={saveApiKeyIpsAction} className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">{I.shield}</span>
              <div className="font-bold text-slate-900">{L("Whitelist IP cho API key")}</div>
            </div>
            <p className="mt-1.5 text-sm text-slate-500">{L("Chỉ các địa chỉ IP trong danh sách này mới gọi được API bằng key của bạn.")}</p>
            <div className="mt-3">
              <label className="lbl">{L("Mỗi IP hoặc dải CIDR một dòng (để trống = không giới hạn)")}</label>
              <textarea className="inp font-mono" name="apiKeyIps" rows={4} defaultValue={user.apiKeyIps || ""} placeholder={"203.0.113.25\n203.0.113.0/24"} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{L("IP hiện tại của bạn:")} <span className="inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 font-mono text-xs text-slate-700 ring-1 ring-slate-200">{myIp}<CopyBtn text={myIp} /></span> {L("— thêm IP này vào danh sách nếu bạn gọi API từ chính kết nối hiện tại.")}</p>
            <button className="btn-primary mt-3">{L("Lưu whitelist IP")}</button>
          </form>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <b className="text-slate-800">{L("Hướng dẫn sử dụng API:")}</b> {L("xem tài liệu đầy đủ kèm ví dụ cURL/PHP/Python tại")}{" "}
            <Link href="/dashboard/api-docs" className="font-semibold text-brand-600">{L("Tài liệu API")}</Link>. {L("Dùng key này để đặt đơn, tra trạng thái và số dư tự động qua endpoint phía trên.")}
          </div>
        </div>
        )}

        security={(
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
            {passwordForm}
            <div className="space-y-6">
              <TwoFactorCard enabled={user.totpEnabled} backupLeft={backupCodesLeft(user.backupCodes)} required={adminMust2fa && !user.totpEnabled} />
              {s.passkeys_enabled !== "0" && (
                <PasskeySection passkeys={myPasskeys.map((p) => ({ id: p.id, deviceName: p.deviceName, createdAt: dt(p.createdAt), lastUsedAt: p.lastUsedAt ? dt(p.lastUsedAt) : null }))} />
              )}
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30">{I.shield}</span>
              <div className="font-bold text-slate-900">{L("Tổng quan bảo mật")}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
              <div>
                <div className="text-xs font-semibold text-slate-400">{L("Xác thực hai lớp (2FA)")}</div>
                <div className="mt-1.5">{user.totpEnabled ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Đang bật")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Chưa bật")}</Badge>}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-400">Passkey</div>
                <div className="mt-1.5 text-sm font-semibold text-slate-800">{myPasskeys.length > 0 ? `${myPasskeys.length} ${L("thiết bị")}` : L("Chưa có")}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-400">{L("Phiên đang hoạt động")}</div>
                <div className="mt-1.5 text-sm font-semibold text-slate-800">{`${mySessions.filter((x) => !x.revokedAt).length} ${L("phiên")}`}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-400">Email</div>
                <div className="mt-1.5">{user.emailVerified ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Đã xác thực")}</Badge> : <Badge cls="bg-amber-100 text-amber-700">{L("Chưa xác thực")}</Badge>}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-400">{L("Đăng nhập gần nhất")}</div>
                <div className="mt-1.5 text-sm font-semibold text-slate-800">{loginHistory[0] ? <>{Ld(relTime(loginHistory[0].createdAt))} · IP {loginHistory[0].ip}</> : L("Chưa ghi nhận")}</div>
              </div>
            </div>
          </div>
            <div className="card space-y-4 p-6">
              <div className="font-bold text-slate-900">{L("Phiên đăng nhập")}</div>
              <p className="text-sm text-slate-500">{L("Các thiết bị đang đăng nhập tài khoản của bạn. Thấy thiết bị lạ? Đăng xuất thiết bị đó ngay và đổi mật khẩu.")}</p>
              <div className="grid gap-2 xl:grid-cols-2">
                {mySessions.length === 0 ? (
                  <p className="text-sm text-slate-400">{L("Chưa có phiên nào được ghi nhận (phiên tạo trước bản cập nhật bảo mật sẽ xuất hiện ở lần đăng nhập tới).")}</p>
                ) : mySessions.slice(0, 8).map((sess) => {
                  const isCurrent = !!curSession?.sid && sess.sid === curSession.sid;
                  return (
                    <div key={sess.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                      <DeviceTile ua={sess.userAgent} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800" title={sess.userAgent || undefined}>{parseUaLabel(sess.userAgent) || sess.userAgent || L("Thiết bị không rõ")}</div>
                        <div className="text-xs text-slate-400">{`IP ${sess.ip}${L(" · Đăng nhập ")}${dt(sess.createdAt)}${L(" · Hoạt động gần nhất ")}${relTime(sess.lastSeenAt)}`}</div>
                      </div>
                      {sess.revokedAt ? <Badge cls="bg-slate-200 text-slate-500">{L("Đã đăng xuất")}</Badge> : isCurrent ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Thiết bị này")}</Badge> : (
                        <form action={revokeSessionAction}><input type="hidden" name="id" value={sess.id} /><button className="btn-ghost btn-sm !text-rose-600">{L("Đăng xuất")}</button></form>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={logoutAction}><button className="btn-ghost">{L("Đăng xuất khỏi thiết bị này")}</button></form>
                <form action={revokeOtherSessionsAction}><button className="btn-ghost !text-rose-600">{L("Đăng xuất tất cả thiết bị khác")}</button></form>
              </div>
            </div>
          <div className="card overflow-x-auto">
            <div className="border-b border-slate-100 px-5 py-4 font-bold text-slate-900">{L("Lịch sử đăng nhập của bạn")}</div>
            {loginHistory.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">{L("Chưa có lần đăng nhập nào được ghi nhận.")}</p>
            ) : (
              <table className="w-full min-w-[640px]">
                <thead><tr><th className="th">{L("Kết quả")}</th><th className="th">IP</th><th className="th">{L("Thiết bị / trình duyệt")}</th><th className="th">{L("Chi tiết")}</th><th className="th">{L("Thời gian")}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {loginHistory.map((ev, i) => (
                    <tr key={ev.id} className={i % 2 === 1 ? "bg-slate-50" : undefined}>
                      <td className="td">{ev.success ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Thành công")}</Badge> : <Badge cls="bg-rose-100 text-rose-700">{L("Thất bại")}</Badge>}</td>
                      <td className="td font-mono text-[13px]">{ev.ip}{ev.isNewDevice ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{L("Thiết bị mới")}</span> : null}</td>
                      <td className="td max-w-[280px] truncate text-slate-500" title={ev.userAgent || undefined}><span className="mr-1.5 inline-flex align-middle text-slate-400 [&_svg]:h-4 [&_svg]:w-4">{deviceKind(ev.userAgent) === "phone" ? I.phone : I.monitor}</span>{ev.userAgent || "—"}</td>
                      <td className="td text-slate-500">{ev.reason ? Ld(ev.reason) : "—"}</td>
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
