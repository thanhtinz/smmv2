"use client";
import { useState } from "react";
import { resetPasswordAction } from "@/app/actions/password-reset";
import { useLang } from "@/components/lang";
import { authInpCls, authBtnCls } from "@/lib/auth-ui";

/** Form đặt mật khẩu mới (mẫu shopkey như RegisterForm): ô chỉ placeholder,
 *  kiểm tra khớp mật khẩu nhập lại ngay phía client; server kiểm tra lại. */
export function ResetPasswordForm({ token }: { token: string }) {
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
    <form action={resetPasswordAction} onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {err ? <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{err}</div> : null}
      <input className={authInpCls} name="password" type="password" required autoComplete="new-password" placeholder={t("Mật khẩu mới")} aria-label={t("Mật khẩu mới")} />
      <input className={authInpCls} name="confirmPassword" type="password" required autoComplete="new-password" placeholder={t("Nhập lại mật khẩu")} aria-label={t("Nhập lại mật khẩu")} />
      <button className={authBtnCls}>{t("Đặt mật khẩu mới")}</button>
    </form>
  );
}
