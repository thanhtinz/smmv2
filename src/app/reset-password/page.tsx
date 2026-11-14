import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Flash } from "@/components/ui";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { authCardCls, authSwitchCardCls } from "@/lib/auth-ui";
import { checkPasswordResetToken } from "@/lib/password-reset";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage( { searchParams: searchParamsPromise }: { searchParams: Promise<{ token?: string; msg?: string; err?: string }> }) {
  const searchParams = await searchParamsPromise;
  const { L, Ld } = await getServerI18n();
  const token = searchParams.token || "";
  // Chỉ KIỂM TRA (không tiêu thụ) khi render — token chỉ bị dùng khi gửi form.
  const chk = await checkPasswordResetToken(token);
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
      {chk.state === "ok" ? (
        <div className={authCardCls}>
          <h1 className="text-center text-2xl font-extrabold text-slate-900">{L("Đặt lại mật khẩu")}</h1>
          <p className="mb-7 mt-2 text-center text-sm text-slate-500">{L("Nhập mật khẩu mới cho tài khoản của bạn")}</p>
          <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
          <ResetPasswordForm token={token} />
        </div>
      ) : (
        <div className={`${authCardCls} text-center`}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-600">!</div>
          <h1 className="text-2xl font-extrabold text-slate-900">{chk.state === "expired" ? L("Liên kết đã hết hạn") : L("Liên kết không hợp lệ")}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {chk.state === "expired" ? L("Liên kết đặt lại mật khẩu đã hết hạn. Hãy yêu cầu liên kết mới.") : L("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng.")}
          </p>
          <Link href="/forgot-password" className="btn-primary mt-6 inline-flex">{L("Yêu cầu liên kết mới")}</Link>
        </div>
      )}
    </AuthShell>
  );
}
