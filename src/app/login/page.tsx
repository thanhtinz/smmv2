import Link from "next/link";
import { SiteHeader, SiteFooter, PublicHeader } from "@/components/site";
import { Flash } from "@/components/ui";
import { loginAction } from "@/app/actions/auth";
import { getSettings } from "@/lib/settings";
import { panelByHost } from "@/lib/panel-host";
import { RecaptchaWidget } from "@/components/recaptcha";
import { authCardClass } from "@/lib/auth-style";

export default async function LoginPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const settings = await getSettings().catch(() => null);
  // Ở tên miền panel con: kiểu khung đăng nhập + nút Google theo cấu hình riêng của panel.
  const panel = await panelByHost().catch(() => null);
  const googleOn = panel ? !!panel.googleClientId : settings?.google_enabled === "1" && !!settings?.google_client_id;
  return (
    <div className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-14">
        <div className={authCardClass(panel?.authStyle || settings?.auth_style)}>
          <h1 className="text-2xl font-extrabold text-slate-900">Đăng nhập</h1>
          <p className="text-sm text-slate-500 mt-1.5 mb-6">Vào bảng điều khiển để đặt đơn và quản lý số dư.</p>
          <Flash msg={searchParams.msg} err={searchParams.err} />
          {googleOn && (
            <>
              <a href="/api/auth/google" className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2.1 3.7-5.1 3.7-9.8Z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5l-3.9 3C2.3 21.3 6.8 24 12 24Z"/><path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-3.9-3C.5 8.2 0 10 0 12s.5 3.8 1.3 5.4l3.9-3Z"/><path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 6.8 0 2.3 2.7 1.3 6.6l3.9 3c.9-2.8 3.6-4.9 6.8-4.9Z"/></svg>
                Đăng nhập bằng Google
              </a>
              <div className="mb-4 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />hoặc dùng tài khoản<span className="h-px flex-1 bg-slate-200" /></div>
            </>
          )}
          <form action={loginAction} className="space-y-4">
            <div>
              <label className="lbl">Tên đăng nhập hoặc email</label>
              <input className="inp" name="login" required autoComplete="username" />
            </div>
            <div>
              <label className="lbl">Mật khẩu</label>
              <input className="inp" name="password" type="password" required autoComplete="current-password" />
            </div>
            {settings?.recaptcha_enabled === "1" && settings?.recaptcha_login === "1" && settings?.recaptcha_site_key ? <RecaptchaWidget siteKey={settings.recaptcha_site_key} /> : null}
            <button className="btn-primary w-full !py-3">Đăng nhập</button>
          </form>
          <p className="text-sm text-slate-500 mt-6 text-center">Chưa có tài khoản? <Link href="/register" className="text-brand-600 font-semibold">Đăng ký miễn phí</Link></p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
