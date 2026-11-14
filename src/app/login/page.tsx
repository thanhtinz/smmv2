import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Flash } from "@/components/ui";
import { loginAction } from "@/app/actions/auth";
import { getSettings } from "@/lib/settings";
import { RecaptchaWidget } from "@/components/recaptcha";
import { PasskeyLoginButton } from "@/components/passkey";
import { authCardCls, authSwitchCardCls, authInpCls, authBtnCls } from "@/lib/auth-ui";
import { getServerI18n } from "@/lib/lang-server";

export default async function LoginPage( { searchParams: searchParamsPromise }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const searchParams = await searchParamsPromise;
  const settings = await getSettings().catch(() => null);
  const googleOn = settings?.google_enabled === "1" && !!settings?.google_client_id;
  const passkeyOn = settings?.passkeys_enabled !== "0";
  const { L, Ld } = await getServerI18n();
  const outlineBtn =
    "flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50";
  return (
    <AuthShell
      switchCard={
        <div className={authSwitchCardCls}>
          {L("Bạn chưa có tài khoản?")}{" "}
          <Link href="/register" className="font-bold text-brand-600">
            {L("Đăng Ký Ngay")}
          </Link>
        </div>
      }
    >
      <div className={authCardCls}>
        <h1 className="text-center text-2xl font-extrabold capitalize text-slate-900">{L("Đăng nhập")}</h1>
        <p className="mb-7 mt-2 text-center text-sm text-slate-500">{L("Vui lòng nhập thông tin đăng nhập")}</p>
        <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
        <form action={loginAction} className="space-y-4">
          <input className={authInpCls} name="login" required autoComplete="username" placeholder={L("Vui lòng nhập username")} aria-label={L("Vui lòng nhập username")} />
          <input className={authInpCls} name="password" type="password" required autoComplete="current-password" placeholder={L("Vui lòng nhập mật khẩu")} aria-label={L("Vui lòng nhập mật khẩu")} />
          {settings?.recaptcha_enabled === "1" && settings?.recaptcha_login === "1" && settings?.recaptcha_site_key ? <RecaptchaWidget siteKey={settings.recaptcha_site_key} /> : null}
          <button className={authBtnCls}>{L("Đăng nhập")}</button>
        </form>
        <div className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="font-semibold text-brand-600 hover:underline">
            {L("Quên mật khẩu?")}
          </Link>
        </div>
        {(googleOn || passkeyOn) && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              {L("hoặc")}
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="space-y-3">
              {googleOn && (
                <a href="/api/auth/google" className={outlineBtn}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2.1 3.7-5.1 3.7-9.8Z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5l-3.9 3C2.3 21.3 6.8 24 12 24Z"/><path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-3.9-3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l3.9-3Z"/><path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 6.8 0 2.3 2.7 1.3 6.6l3.9 3c.9-2.8 3.6-4.9 6.8-4.9Z"/></svg>
                  {L("Đăng nhập bằng Google")}
                </a>
              )}
              {passkeyOn && <PasskeyLoginButton />}
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
