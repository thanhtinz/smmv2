"use client";
import { useEffect, useState } from "react";
import { acceptTermsAction } from "@/app/actions/user";
import { RichText } from "@/components/rich-text";
import { useLang } from "@/components/lang";

/** Cổng điều khoản bắt buộc: hiện khi admin bật điều khoản và khách chưa xác nhận phiên bản hiện tại. */
export function TermsGate({ title, content, checkboxText, buttonText, version }: { title: string; content: string; checkboxText: string; buttonText: string; version: number }) {
  const { td } = useLang();
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="text-lg font-black text-slate-900">{title}</div>
        <div className="mt-1 text-xs font-semibold text-slate-400">{td(`Phiên bản: ${version}`)}</div>
        <div className="mt-4 max-h-[45vh] overflow-y-auto whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">{content}</div>
        <form action={acceptTermsAction} className="mt-4">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm font-medium text-slate-700">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
            {checkboxText}
          </label>
          <button disabled={!agreed} className="btn-primary mt-4 w-full !py-3 disabled:opacity-50">{buttonText}</button>
        </form>
      </div>
    </div>
  );
}

/** Modal thông báo ở khu khách: hiện mỗi lần cho tới khi khách bấm "Đã hiểu" (ẩn 2 giờ như bản mẫu). */
export function HomeModal({ content }: { content: string }) {
  const { t } = useLang();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const until = parseInt(localStorage.getItem("smmv2_home_modal_until") || "0");
      if (Date.now() > until) setShow(true);
    } catch { setShow(true); }
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try { localStorage.setItem("smmv2_home_modal_until", String(Date.now() + 2 * 3600 * 1000)); } catch {}
    setShow(false);
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="text-base font-black text-slate-900">{t("Thông báo")}</div>
        <div className="mt-3 max-h-[55vh] overflow-y-auto text-sm leading-relaxed text-slate-600"><RichText value={content} /></div>
        <button onClick={dismiss} className="btn-primary mt-5 w-full !py-3">{t("Đã hiểu")}</button>
      </div>
    </div>
  );
}
