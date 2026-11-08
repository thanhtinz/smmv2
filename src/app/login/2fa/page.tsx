import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getPending2fa } from "@/lib/auth";
import { authCardCls, authSwitchCardCls } from "@/lib/auth-ui";
import { TwofaVerifyForm } from "@/components/twofa-verify";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Bước 2 đăng nhập cho tài khoản đã bật 2FA: chỉ vào được khi có cookie chờ
 *  (JWT purpose="2fa", hạn 5 phút) do bước mật khẩu cấp. Không có -> về /login. */
export default async function LoginTwofaPage() {
  const pending = await getPending2fa();
  if (!pending) redirect("/login");
  const { L } = await getServerI18n();
  return (
    <AuthShell
      switchCard={
        <div className={authSwitchCardCls}>
          {L("Không phải bạn?")}{" "}
          <Link href="/login" className="font-bold text-brand-600">
            {L("Quay lại đăng nhập")}
          </Link>
        </div>
      }
    >
      <div className={authCardCls}>
        <h1 className="text-center text-2xl font-extrabold text-slate-900">{L("Xác thực hai lớp")}</h1>
        <p className="mb-7 mt-2 text-center text-sm text-slate-500">
          {L("Tài khoản")} <b className="text-slate-800">@{pending!.username}</b> {L("đã bật 2FA. Nhập mã 6 số trong ứng dụng Authenticator, hoặc một mã dự phòng đã lưu.")}
        </p>
        <TwofaVerifyForm />
      </div>
    </AuthShell>
  );
}
