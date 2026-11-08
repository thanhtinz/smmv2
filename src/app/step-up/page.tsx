import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getCurrentUser, hasStepUp } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { authCardClass } from "@/lib/auth-style";
import { Flash, I, AuthBadge } from "@/components/ui";
import { verifyStepUpAction } from "@/app/actions/stepup";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw.slice(0, 300);
}

/** Xác thực lại (step-up, GĐ2): thao tác nhạy cảm (tiền, cấu hình thanh toán,
 *  khoá khẩn cấp...) cần qua trang này — mật khẩu hiện tại + mã 2FA nếu đã bật.
 *  Qua được thì cookie xác thực có hiệu lực 10 phút. */
export default async function StepUpPage({ searchParams }: { searchParams: { next?: string; err?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const next = safeNext(searchParams.next);
  if (await hasStepUp(user.id)) redirect(next);
  const settings = await getSettings().catch(() => null);
  const style = settings?.auth_style;
  const { L, Ld } = await getServerI18n();
  return (
    <AuthShell style={style} brandName={settings?.site_name || "SMMv2"} tagline={settings?.site_tagline}>
      <div className={authCardClass(style)}>
        <AuthBadge icon={I.lock} cls="bg-brand-50 text-brand-600 ring-brand-100" />
        <h1 className="text-center text-2xl font-extrabold text-slate-900">{L("Xác thực lại để tiếp tục")}</h1>
        <p className="mt-1.5 mb-6 text-center text-sm text-slate-500">
          {L("Thao tác này liên quan tới tiền hoặc cấu hình quan trọng. Vui lòng xác nhận lại danh tính của tài khoản")} <b className="text-slate-800">@{user.username}</b>{Ld(" — xác thực có hiệu lực 10 phút.")}
        </p>
        <Flash err={searchParams.err ? Ld(searchParams.err) : undefined} />
        <form action={verifyStepUpAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="lbl">{L("Mật khẩu hiện tại")}</label>
            <input className="inp" type="password" name="password" required autoComplete="current-password" placeholder={L("Nhập mật khẩu của bạn")} />
          </div>
          {user.totpEnabled ? (
            <div>
              <label className="lbl">{Ld("Mã xác thực 2FA")}</label>
              <input className="inp text-center text-lg font-bold tracking-[0.3em]" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" />
              <p className="mt-1 text-xs text-slate-400">{Ld("Nhập mã 6 số trong ứng dụng Authenticator, hoặc một mã dự phòng (mã dự phòng sẽ bị tiêu sau khi dùng).")}</p>
            </div>
          ) : null}
          <button className="btn-primary w-full">{L("Xác thực và tiếp tục")}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/dashboard" className="font-semibold text-brand-600">{L("Huỷ và quay lại")}</Link>
        </p>
      </div>
    </AuthShell>
  );
}
