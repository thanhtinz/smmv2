import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getPending2fa } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { panelByHost } from "@/lib/panel-host";
import { authCardClass } from "@/lib/auth-style";
import { TwofaVerifyForm } from "@/components/twofa-verify";

export const dynamic = "force-dynamic";

/** Bước 2 đăng nhập cho tài khoản đã bật 2FA: chỉ vào được khi có cookie chờ
 *  (JWT purpose="2fa", hạn 5 phút) do bước mật khẩu cấp. Không có -> về /login. */
export default async function LoginTwofaPage() {
  const pending = await getPending2fa();
  if (!pending) redirect("/login");
  const settings = await getSettings().catch(() => null);
  const panel = await panelByHost().catch(() => null);
  const style = panel?.authStyle || settings?.auth_style;
  return (
    <AuthShell style={style} brandName={panel?.name || settings?.site_name || "SMMv2"} tagline={panel?.tagline || settings?.site_tagline} panel={panel ? { name: panel.name, slug: panel.slug } : undefined} announcement={panel?.announcement} accent={panel?.accent}>
      <div className={authCardClass(style)}>
        <h1 className="text-2xl font-extrabold text-slate-900">Xác thực hai lớp</h1>
        <p className="mt-1.5 mb-6 text-sm text-slate-500">
          Tài khoản <b className="text-slate-800">@{pending!.username}</b> đã bật 2FA. Nhập mã 6 số trong ứng dụng Authenticator, hoặc một mã dự phòng đã lưu.
        </p>
        <TwofaVerifyForm />
        <p className="mt-6 text-center text-sm text-slate-500">
          Không phải bạn? <Link href="/login" className="font-semibold text-brand-600">Quay lại đăng nhập</Link>
        </p>
      </div>
    </AuthShell>
  );
}
