import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Flash } from "@/components/ui";
import { forgotPasswordAction } from "@/app/actions/password-reset";
import { authCardCls, authSwitchCardCls, authInpCls, authBtnCls } from "@/lib/auth-ui";
import { getServerI18n } from "@/lib/lang-server";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { L, Ld } = await getServerI18n();
  return (
    <AuthShell
      switchCard={
        <div className={authSwitchCardCls}>
          {L("Bạn đã có tài khoản?")}{" "}
          <Link href="/login" className="font-bold text-brand-600">
            {L("Đăng nhập")}
          </Link>
        </div>
      }
    >
      <div className={authCardCls}>
        <h1 className="text-center text-2xl font-extrabold text-slate-900">{L("Quên mật khẩu")}</h1>
        <p className="mb-7 mt-2 text-center text-sm text-slate-500">{L("Nhập email để nhận liên kết đặt lại mật khẩu")}</p>
        <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
        <form action={forgotPasswordAction} className="space-y-4">
          <input className={authInpCls} name="email" type="email" required autoComplete="email" placeholder={L("Địa chỉ Email")} aria-label={L("Địa chỉ Email")} />
          <button className={authBtnCls}>{L("Gửi liên kết đặt lại")}</button>
        </form>
      </div>
    </AuthShell>
  );
}
