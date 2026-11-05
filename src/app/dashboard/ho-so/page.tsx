import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { updateProfileAction, changePasswordAction } from "@/app/actions/user";
import { LEVEL_NAME, vnd } from "@/lib/format";

export default async function ProfilePage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  return (
    <div>
      <PageHead title="Hồ sơ của tôi" desc={`Tài khoản ${user.username} · Cấp ${LEVEL_NAME[user.level]} · Số dư ${vnd(user.balance)}`} />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
      <form action={updateProfileAction} className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Thông tin cá nhân</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Họ tên</label><input className="inp" name="fullName" defaultValue={user.fullName || ""} /></div>
          <div><label className="lbl">Số điện thoại</label><input className="inp" name="phone" defaultValue={user.phone || ""} /></div>
        </div>
        <div><label className="lbl">Email</label><input className="inp" value={user.email} disabled /></div>
        <div><label className="lbl">Mã nạp tiền của bạn</label><input className="inp font-mono" value={`SMM ${user.depositCode}`} disabled /></div>
        <div>
          <label className="lbl">Webhook URL — nhận thông báo khi đơn đổi trạng thái (không bắt buộc)</label>
          <input className="inp font-mono" name="webhookUrl" defaultValue={user.webhookUrl || ""} placeholder="https://he-thong-cua-ban.vn/webhook" />
          <p className="text-xs text-slate-400 mt-1.5">Hệ thống POST JSON {"{ event, code, status, note, at }"} tới URL này mỗi khi đơn SMM của bạn chuyển trạng thái.</p>
        </div>
        <button className="btn-primary">Lưu thay đổi</button>
      </form>
      <form action={changePasswordAction} className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Đổi mật khẩu</div>
        <div><label className="lbl">Mật khẩu hiện tại</label><input className="inp" name="oldPassword" type="password" required /></div>
        <div><label className="lbl">Mật khẩu mới</label><input className="inp" name="newPassword" type="password" required minLength={6} /></div>
        <button className="btn-dark">Đổi mật khẩu</button>
      </form>
      </div>
    </div>
  );
}
