"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { useLang } from "@/components/lang";

/** Nút burger cho các header công khai trên điện thoại — gom các mục điều hướng
 *  chính vào một menu thả xuống (thay thanh menu footer dưới đáy đã bỏ). */
export function PublicBurger({ tone = "dark", home, loggedIn, registerHref, items: itemsOverride }: {
  tone?: "dark" | "light";
  home: string;
  loggedIn: boolean;
  registerHref: string;
  items?: { href: string; label: string }[];
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  const items = itemsOverride || [
    { href: home, label: t("Trang chủ") },
    { href: "/dashboard/dat-hang", label: t("Đặt đơn SMM") },
    { href: "/premium", label: "Premium" },
    ...(loggedIn
      ? [
          { href: "/dashboard/ho-so", label: t("Tài khoản") },
          { href: "/dashboard/nap-tien", label: t("Nạp tiền") },
        ]
      : [{ href: registerHref, label: t("Đăng ký") }]),
  ];
  const dark = tone === "dark";
  return (
    <div className="relative shrink-0 lg:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={t("Mở menu")}
        className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${dark ? "border-white/15 bg-white/10 text-white hover:bg-white/20" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute left-0 top-12 z-50 w-60 rounded-2xl border p-2 shadow-2xl ${dark ? "border-white/10 bg-[#0d1420] shadow-black/50" : "border-slate-200 bg-white shadow-slate-900/10"}`}>
            {items.map((it) => {
              const active = path === it.href;
              return (
                <Link key={it.href + it.label} href={it.href} onClick={() => setOpen(false)}
                  className={`block rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${active ? (dark ? "bg-white/10 text-white" : "bg-brand-50 text-brand-700") : dark ? "text-slate-300 hover:bg-white/5 hover:text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
                  {it.label}
                </Link>
              );
            })}
            {loggedIn && (
              <div className={`mt-1 border-t pt-1 ${dark ? "border-white/10" : "border-slate-100"}`}>
                <form action={logoutAction}>
                  <button className={`block w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition ${dark ? "text-rose-300 hover:bg-white/5" : "text-rose-600 hover:bg-rose-50"}`}>{t("Đăng xuất")}</button>
                </form>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
