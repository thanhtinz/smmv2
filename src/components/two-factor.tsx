"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { I } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { useLang } from "@/components/lang";

/** Thẻ quản lý 2FA trong Hồ sơ → Bảo mật: thiết lập (secret + otpauth URI để
 *  nhập vào app Authenticator), nhập mã để bật, hiện mã dự phòng 1 lần,
 *  tắt 2FA (mật khẩu + mã), tạo lại mã dự phòng (cần mã hiện tại). */
export function TwoFactorCard({ enabled, backupLeft, required }: { enabled: boolean; backupLeft: number; required?: boolean }) {
  const { t, td } = useLang();
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr?: string | null } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(body: Record<string, string>) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/account/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setErr(data.error || t("Thao tác thất bại"));
        return null;
      }
      return data;
    } catch {
      setErr(t("Không kết nối được máy chủ, thử lại"));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startSetup() {
    const data = await call({ action: "setup" });
    if (data) setSetup({ secret: data.secret, uri: data.uri, qr: data.qr });
  }
  async function enable() {
    const data = await call({ action: "enable", code: code.trim() });
    if (data) {
      setCodes(data.backupCodes || []);
      setSetup(null);
      setCode("");
      setMsg(t("Đã bật xác thực hai lớp. Hãy lưu kỹ các mã dự phòng bên dưới — mỗi mã chỉ dùng được 1 lần."));
      router.refresh();
    }
  }
  async function disable() {
    const data = await call({ action: "disable", code: code.trim(), password });
    if (data) {
      setCodes(null);
      setCode("");
      setPassword("");
      setMsg(t("Đã tắt xác thực hai lớp."));
      router.refresh();
    }
  }
  async function regen() {
    const data = await call({ action: "regen", code: code.trim() });
    if (data) {
      setCodes(data.backupCodes || []);
      setCode("");
      setMsg(t("Đã tạo bộ mã dự phòng mới — bộ cũ đã bị huỷ. Hãy lưu kỹ các mã bên dưới."));
      router.refresh();
    }
  }

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">{I.shield}</span>
          <div className="font-bold text-slate-900">{t("Xác thực hai lớp (2FA)")}</div>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{enabled ? t("Đang bật") : t("Chưa bật")}</span>
      </div>
      {required && !enabled ? (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {t("Tài khoản quản trị bắt buộc bật 2FA. Hãy thiết lập ngay bên dưới — khu quản trị sẽ mở sau khi bật xong.")}
        </div>
      ) : null}
      <p className="text-sm text-slate-500">
        {enabled
          ? t("Khi đăng nhập, sau mật khẩu bạn phải nhập thêm mã 6 số từ ứng dụng Authenticator. Mã dự phòng còn lại: ") + backupLeft + "/8."
          : t("Bật 2FA để bảo vệ tài khoản: khi đăng nhập, sau mật khẩu phải nhập thêm mã 6 số từ ứng dụng Authenticator (Google Authenticator, Microsoft Authenticator, Authy...).")}
      </p>
      {msg ? <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{msg}</div> : null}
      {err ? <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{err}</div> : null}

      {codes ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-bold text-amber-900">{t("Mã dự phòng của bạn (chỉ hiện 1 lần này)")}</div>
            <CopyBtn text={codes.join("\n")} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-sm font-semibold text-slate-800">
            {codes.map((c) => (<span key={c} className="rounded-lg bg-white px-2.5 py-1.5 text-center">{c}</span>))}
          </div>
          <p className="mt-2 text-xs text-amber-700">{t("Lưu các mã này ở nơi an toàn. Mất điện thoại vẫn đăng nhập được bằng 1 mã dự phòng.")}</p>
        </div>
      ) : null}

      {!enabled && !setup ? (
        <button className="btn-primary" onClick={startSetup} disabled={busy}>{t("Bắt đầu thiết lập 2FA")}</button>
      ) : null}

      {!enabled && setup ? (
        <div className="space-y-3">
          {setup.qr ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qr} alt={t("QR thiết lập 2FA")} width={180} height={180} className="rounded-xl bg-white p-1" />
              </div>
              <p className="text-center text-xs text-slate-500">{t("Quét mã QR bằng ứng dụng Authenticator (Google Authenticator, Microsoft Authenticator, Authy...)")}</p>
            </div>
          ) : null}
          <div>
            <label className="lbl">{t("Mã bí mật (nhập vào ứng dụng Authenticator)")}</label>
            <div className="flex gap-2">
              <input className="inp flex-1 font-mono" readOnly value={setup.secret} onFocus={(e) => e.target.select()} />
              <CopyBtn text={setup.secret} />
            </div>
          </div>
          <div>
            <label className="lbl">{t("Hoặc dùng liên kết otpauth://")}</label>
            <div className="flex gap-2">
              <input className="inp flex-1 font-mono text-xs" readOnly value={setup.uri} onFocus={(e) => e.target.select()} />
              <CopyBtn text={setup.uri} />
            </div>
          </div>
          <div>
            <label className="lbl">{t("Nhập mã 6 số từ ứng dụng để hoàn tất")}</label>
            <input className="inp font-mono tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={enable} disabled={busy || code.trim().length < 6}>{t("Bật 2FA")}</button>
            <button className="btn-ghost" onClick={() => { setSetup(null); setCode(""); }} disabled={busy}>{t("Huỷ")}</button>
          </div>
        </div>
      ) : null}

      {enabled ? (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div>
            <label className="lbl">{t("Mã 2FA hiện tại")}</label>
            <input className="inp font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("123456 hoặc mã dự phòng")} />
          </div>
          <button className="btn-dark" onClick={regen} disabled={busy || !code.trim()}>{t("Tạo lại mã dự phòng")}</button>
          <div className="border-t border-slate-100 pt-4">
            <label className="lbl">{t("Mật khẩu hiện tại (bắt buộc khi tắt 2FA)")}</label>
            <input className="inp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn-danger mt-3" onClick={disable} disabled={busy || !password || !code.trim()}>{t("Tắt 2FA")}</button>
            <p className="mt-2 text-xs text-slate-400">{t("Tắt 2FA phải nhập đúng cả mật khẩu lẫn mã xác thực — không tắt được nếu không xác minh.")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
