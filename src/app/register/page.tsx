import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Flash } from "@/components/ui";
import { registerAction } from "@/app/actions/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { RecaptchaWidget } from "@/components/recaptcha";
import { authCardClass } from "@/lib/auth-style";
import { getServerI18n } from "@/lib/lang-server";

export default async function RegisterPage({ searchParams }: { searchParams: { msg?: string; err?: string; ref?: string } }) {
  const ref = (searchParams.ref || "").trim().toUpperCase();
  const referrer = ref ? await prisma.user.findUnique({ where: { refCode: ref }, select: { username: true } }) : null;
  const settings = await getSettings().catch(() => null);
  const style = settings?.auth_style;
  const { L, Ld } = await getServerI18n();
  return (
    <AuthShell style={style} brandName={settings?.site_name || "SMMv2"} tagline={settings?.site_tagline}>
        <div className={authCardClass(style)}>
          <h1 className="text-2xl font-extrabold text-slate-900">{L("Đăng ký tài khoản")}</h1>
          <p className="text-sm text-slate-500 mt-1.5 mb-6">{L("Miễn phí — có ngay API key cho đại lý sau khi đăng ký.")}</p>
          {referrer && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">{L("Bạn được")} <b>{referrer.username}</b> {L("giới thiệu")}</div>}
          <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
          <form action={registerAction} className="space-y-4">
            <input type="hidden" name="ref" value={referrer ? ref : ""} />
            <div>
              <label className="lbl">{L("Tên đăng nhập *")}</label>
              <input className="inp" name="username" required autoComplete="username" placeholder={L("vd: nguyenvana")} />
            </div>
            <div>
              <label className="lbl">{L("Email *")}</label>
              <input className="inp" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">{L("Họ tên")}</label>
                <input className="inp" name="fullName" autoComplete="name" />
              </div>
              <div>
                <label className="lbl">{L("Số điện thoại")}</label>
                <input className="inp" name="phone" autoComplete="tel" />
              </div>
            </div>
            <div>
              <label className="lbl">{L("Mật khẩu *")}</label>
              <input className="inp" name="password" type="password" required minLength={6} autoComplete="new-password" />
            </div>
            {/* Honeypot chống bot — người dùng thật không bao giờ thấy/điền ô này */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
              <input name="website" tabIndex={-1} autoComplete="off" />
            </div>
            {settings?.recaptcha_enabled === "1" && settings?.recaptcha_register === "1" && settings?.recaptcha_site_key ? <RecaptchaWidget siteKey={settings.recaptcha_site_key} /> : null}
            <button className="btn-primary w-full !py-3">{L("Đăng ký")}</button>
          </form>
          <p className="text-sm text-slate-500 mt-6 text-center">{L("Đã có tài khoản?")} <Link href="/login" className="text-brand-600 font-semibold">{L("Đăng nhập")}</Link></p>
        </div>
    </AuthShell>
  );
}
