import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Flash } from "@/components/ui";
import { registerAction } from "@/app/actions/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { RecaptchaWidget } from "@/components/recaptcha";
import { authCardClass } from "@/lib/auth-style";

export default async function RegisterPage({ searchParams }: { searchParams: { msg?: string; err?: string; ref?: string } }) {
  const ref = (searchParams.ref || "").trim().toUpperCase();
  const referrer = ref ? await prisma.user.findUnique({ where: { refCode: ref }, select: { username: true } }) : null;
  const settings = await getSettings().catch(() => null);
  const style = settings?.auth_style;
  return (
    <AuthShell style={style} brandName={settings?.site_name || "SMMv2"} tagline={settings?.site_tagline}>
        <div className={authCardClass(style)}>
          <h1 className="text-2xl font-extrabold text-slate-900">Đăng ký tài khoản</h1>
          <p className="text-sm text-slate-500 mt-1.5 mb-6">Miễn phí — có ngay API key cho đại lý sau khi đăng ký.</p>
          {referrer && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">Bạn được <b>{referrer.username}</b> giới thiệu</div>}
          <Flash msg={searchParams.msg} err={searchParams.err} />
          <form action={registerAction} className="space-y-4">
            <input type="hidden" name="ref" value={referrer ? ref : ""} />
            <div>
              <label className="lbl">Tên đăng nhập *</label>
              <input className="inp" name="username" required autoComplete="username" placeholder="vd: nguyenvana" />
            </div>
            <div>
              <label className="lbl">Email *</label>
              <input className="inp" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Họ tên</label>
                <input className="inp" name="fullName" autoComplete="name" />
              </div>
              <div>
                <label className="lbl">Số điện thoại</label>
                <input className="inp" name="phone" autoComplete="tel" />
              </div>
            </div>
            <div>
              <label className="lbl">Mật khẩu *</label>
              <input className="inp" name="password" type="password" required minLength={6} autoComplete="new-password" />
            </div>
            {/* Honeypot chống bot — người dùng thật không bao giờ thấy/điền ô này */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
              <input name="website" tabIndex={-1} autoComplete="off" />
            </div>
            {settings?.recaptcha_enabled === "1" && settings?.recaptcha_register === "1" && settings?.recaptcha_site_key ? <RecaptchaWidget siteKey={settings.recaptcha_site_key} /> : null}
            <button className="btn-primary w-full !py-3">Đăng ký</button>
          </form>
          <p className="text-sm text-slate-500 mt-6 text-center">Đã có tài khoản? <Link href="/login" className="text-brand-600 font-semibold">Đăng nhập</Link></p>
        </div>
    </AuthShell>
  );
}
