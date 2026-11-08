"use client";
import { useEffect, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { I } from "@/components/ui";
import { useLang } from "@/components/lang";

/* Passkey / WebAuthn (bảo mật Enterprise GĐ3):
   - PasskeySection: thẻ quản lý passkey trong Hồ sơ → Bảo mật.
   - PasskeyLoginButton: nút đăng nhập bằng passkey ở trang đăng nhập.
   Mọi chuỗi hiển thị viết tiếng Việt — hệ thống dịch của site tự dịch sang
   ngôn ngữ khác theo chuỗi Việt gốc. */

type PasskeyItem = {
  id: number;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
};

function isCancelError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; cause?: { name?: string } };
  return err.name === "NotAllowedError" || err.cause?.name === "NotAllowedError";
}

function errorText(e: unknown, fallback: string, t: (s: string) => string): string {
  if (isCancelError(e)) return t("Bạn đã huỷ thao tác passkey.");
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export function PasskeySection({ passkeys }: { passkeys: PasskeyItem[] }) {
  const { t, td } = useLang();
  const [deviceName, setDeviceName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function addPasskey() {
    setBusy(true);
    setErr("");
    try {
      const optRes = await fetch("/api/auth/passkey/register-options", { method: "POST" });
      const optionsJSON = await optRes.json().catch(() => null);
      if (!optRes.ok || !optionsJSON) {
        setErr((optionsJSON && optionsJSON.error) || t("Không tạo được yêu cầu passkey, thử lại sau"));
        return;
      }
      const registrationResponse = await startRegistration({ optionsJSON });
      const verifyRes = await fetch("/api/auth/passkey/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...registrationResponse, deviceName: deviceName.trim() }),
      });
      const data = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !data.ok) {
        setErr(data.error || t("Không lưu được passkey, thử lại sau"));
        return;
      }
      location.reload();
    } catch (e) {
      setErr(errorText(e, t("Không thêm được passkey, thử lại sau"), t));
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id: number) {
    setDeletingId(id);
    setErr("");
    try {
      const res = await fetch("/api/auth/passkey/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErr(data.error || t("Không xoá được passkey, thử lại sau"));
        return;
      }
      location.reload();
    } catch {
      setErr(t("Không kết nối được máy chủ, thử lại"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="card space-y-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 text-white shadow-lg shadow-violet-500/30">{I.fingerprint}</span>
          <div className="font-bold text-slate-900">{t("Đăng nhập nhanh (Passkey)")}</div>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${passkeys.length ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
        >
          {passkeys.length ? <>{passkeys.length}{t(" thiết bị")}</> : t("Chưa có")}
        </span>
      </div>
      <p className="text-sm text-slate-500">
        {t("Đăng nhập bằng Face ID, vân tay hoặc Windows Hello mà không cần nhập mật khẩu.")}
      </p>
      <p className="text-sm text-slate-500">
        {t("Passkey tự đồng bộ qua tài khoản Apple/Google, đăng ký một lần dùng cho cả điện thoại và máy tính.")}
      </p>
      {err ? (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{err}</div>
      ) : null}

      {passkeys.length ? (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 [&_svg]:h-[18px] [&_svg]:w-[18px]">{I.fingerprint}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-800">{p.deviceName}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {t("Tạo ngày ")}{p.createdAt}
                  {p.lastUsedAt ? <>{t(" · Dùng gần nhất ")}{p.lastUsedAt}</> : t(" · Chưa dùng lần nào")}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost shrink-0 !px-3 !py-1.5 text-xs font-semibold text-rose-600"
                onClick={() => removePasskey(p.id)}
                disabled={deletingId === p.id}
              >
                {deletingId === p.id ? t("Đang xoá...") : t("Xoá")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <div>
          <label className="lbl">{t("Tên thiết bị")}</label>
          <input
            className="inp"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder={t("Ví dụ: iPhone của tôi")}
            maxLength={100}
          />
        </div>
        <button type="button" className="btn-primary" onClick={addPasskey} disabled={busy}>
          {I.fingerprint}
          {busy ? t("Đang chờ thiết bị...") : t("Thêm passkey")}
        </button>
      </div>
    </div>
  );
}

export function PasskeyLoginButton() {
  const { t } = useLang();
  const [supported, setSupported] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);

  if (!supported) return null;

  async function login() {
    setBusy(true);
    setErr("");
    try {
      const optRes = await fetch("/api/auth/passkey/login-options", { method: "POST" });
      const optionsJSON = await optRes.json().catch(() => null);
      if (!optRes.ok || !optionsJSON) {
        setErr((optionsJSON && optionsJSON.error) || t("Không dùng được passkey lúc này, hãy đăng nhập bằng mật khẩu"));
        return;
      }
      const authenticationResponse = await startAuthentication({ optionsJSON });
      const verifyRes = await fetch("/api/auth/passkey/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authenticationResponse),
      });
      const data = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok || !data.ok) {
        setErr(data.error || t("Đăng nhập bằng passkey thất bại, hãy đăng nhập bằng mật khẩu"));
        return;
      }
      location.href = data.redirect || "/dashboard";
    } catch (e) {
      setErr(errorText(e, t("Đăng nhập bằng passkey thất bại, hãy đăng nhập bằng mật khẩu"), t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50" onClick={login} disabled={busy}>
        <span className="[&_svg]:h-[18px] [&_svg]:w-[18px]">{I.fingerprint}</span>
        {busy ? t("Đang chờ thiết bị...") : t("Đăng nhập bằng Passkey")}
      </button>
      {err ? <p className="mt-2 text-center text-xs font-medium text-rose-600">{err}</p> : null}
    </div>
  );
}
