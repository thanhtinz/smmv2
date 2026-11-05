"use client";
import { useEffect, useRef } from "react";

/** Widget reCAPTCHA v2 — chỉ render khi admin đã bật + cấu hình Site Key (trang auth truyền xuống). */
export function RecaptchaWidget({ siteKey }: { siteKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const render = () => {
      const g = (window as any).grecaptcha;
      if (g && ref.current && !ref.current.hasChildNodes()) {
        try { g.render(ref.current, { sitekey: siteKey }); } catch {}
      }
    };
    if ((window as any).grecaptcha) { render(); return; }
    const id = "recaptcha-js";
    if (!document.getElementById(id)) {
      const sc = document.createElement("script");
      sc.id = id;
      sc.src = "https://www.google.com/recaptcha/api.js?render=explicit";
      sc.async = true;
      sc.onload = () => setTimeout(render, 300);
      document.head.appendChild(sc);
    } else {
      const t = setInterval(() => { if ((window as any).grecaptcha) { clearInterval(t); render(); } }, 300);
      return () => clearInterval(t);
    }
  }, [siteKey]);
  return <div ref={ref} className="flex justify-center" />;
}
