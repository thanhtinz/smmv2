import { getCurrentUser } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { updateProfileAction, changePasswordAction } from "@/app/actions/user";
import { LEVEL_NAME, vnd } from "@/lib/format";

export default async function ProfilePage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const user = (await getCurrentUser())!;
  return (
    <div className="max-w-2xl">
      <PageHead title="Hồ sơ của tôi" desc={`Tài khoản ${user.username} · Cấp ${LEVEL_NAME[user.level]} · Số dư ${vnd(user.balance)}`} />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form action={updateProfileAction} className="card p-6 space-y-4 mb-6">
        <div className="font-bold text-slate-900">Thông tin cá nhân</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="lbl">Họ tên</label><input className="inp" name="fullName" defaultValue={user.fullName || ""} /></div>
          <div><label className="lbl">Số điện thoại</label><input className="inp" name="phone" defaultValue={user.phone || ""} /></div>
        </div>
        <div><label className="lbl">Email</label><input className="inp" value={user.email} disabled /></div>
        <div><label className="lbl">Mã nạp tiền của bạn</label><input className="inp font-mono" value={`SMM ${user.depositCode}`} disabled /></div>
        <button className="btn-primary">Lưu thay đổi</button>
      </form>
      <form action={changePasswordAction} className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Đổi mật khẩu</div>
        <div><label className="lbl">Mật khẩu hiện tại</label><input className="inp" name="oldPassword" type="password" required /></div>
        <div><label className="lbl">Mật khẩu mới</label><input className="inp" name="newPassword" type="password" required minLength={6} /></div>
        <button className="btn-dark">Đổi mật khẩu</button>
      </form>
    </div>
  );
}
