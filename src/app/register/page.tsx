import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Flash } from "@/components/ui";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { RegisterForm } from "@/components/register-form";
import { authCardCls, authSwitchCardCls } from "@/lib/auth-ui";
import { getServerI18n } from "@/lib/lang-server";

export default async function RegisterPage( { searchParams: searchParamsPromise }: { searchParams: Promise<{ msg?: string; err?: string; ref?: string; aff?: string }> }) {
  const searchParams = await searchParamsPromise;
  const { cookies } = await import("next/headers");
  const { AFF_COOKIE_REF } = await import("@/lib/affiliate");
  // ?ref= / ?aff= trên URL thắng; không có thì dùng cookie first-touch aff_ref.
  const ref = (searchParams.ref || searchParams.aff || (await cookies()).get(AFF_COOKIE_REF)?.value || "").trim().toUpperCase();
  const referrer = ref ? await prisma.user.findUnique({ where: { refCode: ref }, select: { username: true } }) : null;
  const settings = await getSettings().catch(() => null);
  // Công tắc module Đăng ký (đợt 126): tắt thì trang đăng ký bị chặn ở
  // máy chủ, về trang chủ — action đăng ký và Google callback còn chặn
  // thêm một lớp (chỉ chặn tạo tài khoản MỚI, đăng nhập cũ không đổi).
  if (settings?.module_register === "0") redirect("/");
  const { L, Ld } = await getServerI18n();
  const recaptchaSiteKey =
    settings?.recaptcha_enabled === "1" && settings?.recaptcha_register === "1" && settings?.recaptcha_site_key
      ? settings.recaptcha_site_key
      : null;
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
        <h1 className="text-center text-2xl font-extrabold text-slate-900">{L("Đăng ký tài khoản")}</h1>
        <p className="mb-7 mt-2 text-center text-sm text-slate-500">{L("Vui lòng nhập thông tin đăng ký")}</p>
        {referrer && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700">{L("Bạn được")} <b>{referrer.username}</b> {L("giới thiệu")}</div>}
        <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
        <RegisterForm refValue={referrer ? ref : ""} recaptchaSiteKey={recaptchaSiteKey} />
      </div>
    </AuthShell>
  );
}
