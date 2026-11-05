import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";
import { DisplayEngine } from "@/components/display";

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4680ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1120" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  return {
    title: `${s?.site_name || "SMMv2"} — SMM Panel & Tài khoản Premium`,
    description: s?.site_tagline || "Tăng like, follow, view tự động + tài khoản premium giá tốt",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: s?.site_name || "SMMv2" },
    icons: { icon: "/icon.svg", apple: "/icon.svg" },
  };
}

// Áp tuỳ chọn hiển thị khách đã chọn (localStorage) trước khi trang vẽ để không chớp
const THEME_SCRIPT = `(function(){try{var h=document.documentElement;var a=localStorage.getItem('smmv2-accent');var m=localStorage.getItem('smmv2-mode');if(a)h.setAttribute('data-accent',a);if(m==='dark')h.classList.add('dark');else if(m==='light')h.classList.remove('dark');var d=localStorage.getItem('smmv2-dir');if(d)h.setAttribute('dir',d);var f=localStorage.getItem('smmv2-font');if(f)h.setAttribute('data-font',f);var s=localStorage.getItem('smmv2-fsize');if(s)h.setAttribute('data-fsize',s);var l=localStorage.getItem('smmv2-lang');if(l)h.setAttribute('lang',l);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings().catch(() => null);
  const accent = s?.default_accent || "blue";
  const dark = s?.default_mode === "dark";
  return (
    <html lang="en" data-accent={accent} className={dark ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {s?.custom_head_html ? <div hidden dangerouslySetInnerHTML={{ __html: s.custom_head_html }} /> : null}
      </head>
      <body>{children}<DisplayEngine />{s?.custom_body_html ? <div hidden dangerouslySetInnerHTML={{ __html: s.custom_body_html }} /> : null}</body>
    </html>
  );
}
