"use client";
import { useState } from "react";

/** Form nhập mã bước 2 đăng nhập: gửi mã lên /api/auth/2fa/verify,
 *  đúng mã thì server tạo phiên và trả URL đích để chuyển trang. */
export function TwofaVerifyForm() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setErr(data.error || "Mã xác thực không đúng, thử lại");
    } catch {
      setErr("Không kết nối được máy chủ, thử lại");
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      {err ? <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{err}</div> : null}
      <div>
        <label className="lbl">Mã xác thực 6 số hoặc mã dự phòng</label>
        <input
          className="inp text-center font-mono text-lg tracking-[0.3em]"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoComplete="one-time-code"
          inputMode="text"
          placeholder="123456"
          autoFocus
        />
      </div>
      <button className="btn-primary w-full !py-3" disabled={busy}>{busy ? "Đang kiểm tra..." : "Xác nhận đăng nhập"}</button>
    </form>
  );
}
