"use client";
import { useState } from "react";
import { registerAction } from "@/app/actions/auth";
import { RecaptchaWidget } from "@/components/recaptcha";
import { useLang } from "@/components/lang";
import { authInpCls, authBtnCls } from "@/lib/auth-ui";

/** Form đăng ký (mẫu shopkey): các ô chỉ placeholder, thêm ô nhập lại mật
 *  khẩu (kiểm tra khớp ngay phía client) + checkbox đồng ý điều khoản.
 *  Gửi vẫn qua registerAction như cũ — action chỉ đọc các field nó biết. */
export function RegisterForm({ refValue, recaptchaSiteKey }: { refValue: string; recaptchaSiteKey?: string | null }) {
  const { t } = useLang();
  const [err, setErr] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    if (String(fd.get("password") || "") !== String(fd.get("confirmPassword") || "")) {
      e.preventDefault();
      setErr(t("Mật khẩu nhập lại không khớp, vui lòng kiểm tra lại."));
    }
  }

  return (
    <form action={registerAction} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="ref" value={refValue} />
      {err ? <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{err}</div> : null}
      <input className={authInpCls} name="username" required autoComplete="username" placeholder={t("Tài khoản đăng nhập")} aria-label={t("Tài khoản đăng nhập")} />
      <input className={authInpCls} name="email" type="email" required autoComplete="email" placeholder={t("Địa chỉ Email")} aria-label={t("Địa chỉ Email")} />
      <div className="grid grid-cols-2 gap-3">
        <input className={authInpCls} name="fullName" autoComplete="name" placeholder={t("Họ tên")} aria-label={t("Họ tên")} />
        <input className={authInpCls} name="phone" autoComplete="tel" placeholder={t("Số điện thoại")} aria-label={t("Số điện thoại")} />
      </div>
      <input className={authInpCls} name="password" type="password" required minLength={6} autoComplete="new-password" placeholder={t("Mật khẩu")} aria-label={t("Mật khẩu")} />
      <input className={authInpCls} name="confirmPassword" type="password" required autoComplete="new-password" placeholder={t("Nhập lại mật khẩu")} aria-label={t("Nhập lại mật khẩu")} />
      {/* Honeypot chống bot — người dùng thật không bao giờ thấy/điền ô này */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
        <input name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
        <span>{t("Tôi đồng ý với điều khoản/chính sách")}</span>
      </label>
      {recaptchaSiteKey ? <RecaptchaWidget siteKey={recaptchaSiteKey} /> : null}
      <button className={authBtnCls}>{t("Đăng ký")}</button>
    </form>
  );
}
