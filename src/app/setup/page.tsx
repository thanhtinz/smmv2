import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Flash } from "@/components/ui";
import { setupAction } from "@/app/actions/setup";
import { isSetupNeeded } from "@/lib/setup";
import { getSettings } from "@/lib/settings";
import { authCardCls, authInpCls, authBtnCls } from "@/lib/auth-ui";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/* THIẾT LẬP LẦN ĐẦU (lệnh Tín 2026-11-11): bản cài mới không có tài khoản mẫu
   nào — trang này chỉ tồn tại khi bảng users còn trống (lib/setup.ts chốt cả
   ở trang lẫn trong action). Chủ site đặt tên website + tạo tài khoản quản
   trị đầu tiên, xong được đăng nhập thẳng vào khu quản trị. Đã thiết lập rồi
   thì /setup tự chuyển về trang chủ. Giao diện theo đúng hệ trang auth
   (AuthShell + thẻ trắng giữa trang). */
export default async function SetupPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  if (!(await isSetupNeeded())) redirect("/");
  const settings = await getSettings().catch(() => null);
  const { L, Ld } = await getServerI18n();
  return (
    <AuthShell skipSetupGate>
      <div className={authCardCls}>
        <h1 className="text-center text-2xl font-extrabold text-slate-900">{L("Thiết lập lần đầu")}</h1>
        <p className="mb-7 mt-2 text-center text-sm text-slate-500">{L("Tạo tài khoản quản trị đầu tiên để bắt đầu sử dụng website")}</p>
        <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
        <form action={setupAction} className="space-y-4">
          <input className={authInpCls} name="siteName" required maxLength={80} defaultValue={settings?.site_name || ""} placeholder={L("Tên website")} aria-label={L("Tên website")} />
          <input className={authInpCls} name="username" required autoComplete="username" placeholder={L("Tài khoản đăng nhập")} aria-label={L("Tài khoản đăng nhập")} />
          <input className={authInpCls} name="email" type="email" required autoComplete="email" placeholder={L("Địa chỉ Email")} aria-label={L("Địa chỉ Email")} />
          <input className={authInpCls} name="password" type="password" required autoComplete="new-password" placeholder={L("Mật khẩu")} aria-label={L("Mật khẩu")} />
          <input className={authInpCls} name="confirmPassword" type="password" required autoComplete="new-password" placeholder={L("Nhập lại mật khẩu")} aria-label={L("Nhập lại mật khẩu")} />
          <button className={authBtnCls}>{L("Tạo tài khoản quản trị")}</button>
        </form>
      </div>
    </AuthShell>
  );
}
