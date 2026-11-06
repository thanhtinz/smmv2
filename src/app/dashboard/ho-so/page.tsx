import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Flash, Stat, I, Badge } from "@/components/ui";
import { updateProfileAction, changePasswordAction, regenApiKeyAction } from "@/app/actions/user";
import { logoutAction } from "@/app/actions/auth";
import { CopyBtn } from "@/components/client";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { LEVEL_NAME, vnd, num } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Tài khoản — bố cục theo panel mẫu: đầu trang avatar + huy hiệu, 4 thẻ nhỏ,
 *  3 tab Hồ sơ cá nhân | Kết nối API | Bảo mật & Phiên đăng nhập. */
export default async function ProfilePage({ searchParams }: { searchParams: { msg?: string; err?: string; tab?: string } }) {
  const user = (await getCurrentUser())!;
  const tab = searchParams.tab === "api" ? "api" : searchParams.tab === "security" ? "security" : "profile";
  const s = await getSettings();
  const [preCount, commissionAgg, refCount] = await Promise.all([
    prisma.premiumOrder.count({ where: { userId: user.id } }),
    prisma.transaction.aggregate({ where: { userId: user.id, type: { in: ["REFERRAL_COMMISSION", "PANEL_COMMISSION"] }, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.user.count({ where: { referredById: user.id } }),
  ]);
  const initials = (user.fullName || user.username).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const endpoint = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/api/v2`;
  const tabs = [
    { id: "profile", label: "Hồ sơ cá nhân" },
    { id: "api", label: "Kết nối API" },
    { id: "security", label: "Bảo mật & Phiên đăng nhập" },
  ] as const;
  const passwordForm = (
    <form action={changePasswordAction} className="card space-y-4 p-6">
      <div className="font-bold text-slate-900">Đổi mật khẩu</div>
      <div><label className="lbl">Mật khẩu hiện tại</label><input className="inp" name="oldPassword" type="password" required /></div>
      <div><label className="lbl">Mật khẩu mới</label><input className="inp" name="newPassword" type="password" required minLength={6} /></div>
      <div><label className="lbl">Xác nhận mật khẩu mới</label><input className="inp" name="newPassword2" type="password" required minLength={6} /></div>
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

      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <Link key={t.id} href={`/dashboard/ho-so${t.id === "profile" ? "" : `?tab=${t.id}`}`} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{t.label}</Link>
        ))}
      </div>

      {tab === "profile" && (
        <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          <form action={updateProfileAction} className="card space-y-4 p-6 xl:col-span-2">
            <div className="font-bold text-slate-900">Hồ sơ cá nhân</div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="lbl">Tên của bạn</label><input className="inp" name="fullName" defaultValue={user.fullName || ""} /></div>
              <div><label className="lbl">Số điện thoại</label><input className="inp" name="phone" defaultValue={user.phone || ""} /></div>
            </div>
            <div><label className="lbl">Email</label><input className="inp" value={user.email} disabled /></div>
            <div><label className="lbl">Mã nạp tiền của bạn</label><input className="inp font-mono" value={`SMM ${user.depositCode}`} disabled /></div>
            <div>
              <label className="lbl">Webhook URL — nhận thông báo khi đơn đổi trạng thái (không bắt buộc)</label>
              <input className="inp font-mono" name="webhookUrl" defaultValue={user.webhookUrl || ""} placeholder="https://he-thong-cua-ban.vn/webhook" />
              <p className="mt-1.5 text-xs text-slate-400">Hệ thống POST JSON {"{ event, code, status, note, at }"} tới URL này mỗi khi đơn SMM của bạn chuyển trạng thái.</p>
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
              <div className="font-bold text-slate-900">Giới thiệu bạn bè</div>
              <p className="mt-2 text-sm text-slate-500">Bạn đã giới thiệu <b className="text-slate-800">{num(refCount)}</b> người tham gia.</p>
              <Link href="/dashboard/kiem-tien" className="btn-ghost btn-sm mt-3">Lấy link giới thiệu</Link>
            </div>
          </div>
        </div>
      )}

      {tab === "api" && (
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
            <b className="text-slate-800">Hướng dẫn sử dụng API:</b> xem tài liệu đầy đủ kèm ví dụ cURL/PHP/Python tại{" "}
            <Link href="/api-docs" className="font-semibold text-brand-600">Tài liệu API</Link>. Dùng key này để đặt đơn, tra trạng thái và số dư tự động qua endpoint phía trên.
          </div>
        </div>
      )}

      {tab === "security" && (
        <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          {passwordForm}
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
            <form action={logoutAction}><button className="btn-ghost">Đăng xuất khỏi thiết bị này</button></form>
          </div>
        </div>
      )}
    </div>
  );
}
