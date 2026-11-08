import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { authCardCls, authBtnCls } from "@/lib/auth-ui";
import { lockdownState } from "@/lib/lockdown";
import { I, AuthBadge } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Trang thông báo khoá khẩn cấp (GĐ2): khách thường bị dẫn tới đây khi hệ thống
 *  đang khoá. Quản trị vẫn đăng nhập được bình thường qua /login. */
export default async function LockedPage() {
  const ld = await lockdownState();
  const { L } = await getServerI18n();
  return (
    <AuthShell>
      <div className={authCardCls}>
        {ld.on ? <AuthBadge icon={I.lock} cls="bg-rose-50 text-rose-600 ring-rose-100" /> : <AuthBadge icon={I.check} cls="bg-emerald-50 text-emerald-600 ring-emerald-200" />}
        <h1 className="text-center text-2xl font-extrabold text-slate-900">{L("Hệ thống đang tạm khoá")}</h1>
        <p className="mt-2 mb-7 text-center text-sm text-slate-500">
          {ld.on
            ? <>{L("Để bảo vệ an toàn cho tài khoản và số dư của khách hàng, hệ thống đang tạm khoá khẩn cấp")}{ld.reason ? <>: <b className="text-slate-800">{ld.reason}</b></> : null}{L(". Đăng nhập mới, đặt đơn, nạp tiền và mua hàng đang tạm dừng. Vui lòng quay lại sau.")}</>
            : <>{L("Hệ thống hiện không còn ở trạng thái khoá. Bạn có thể đăng nhập và sử dụng bình thường.")}</>}
        </p>
        <Link href="/login" className={authBtnCls}>{L("Về trang đăng nhập")}</Link>
      </div>
    </AuthShell>
  );
}
