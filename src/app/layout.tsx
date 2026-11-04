import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";

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

// Áp giao diện khách đã chọn (lưu localStorage) trước khi trang vẽ để không chớp màu
const THEME_SCRIPT = `(function(){try{var a=localStorage.getItem('smmv2-accent');var m=localStorage.getItem('smmv2-mode');var h=document.documentElement;if(a)h.setAttribute('data-accent',a);if(m==='dark')h.classList.add('dark');else if(m==='light')h.classList.remove('dark');}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings().catch(() => null);
  const accent = s?.default_accent || "blue";
  const dark = s?.default_mode === "dark";
  return (
    <html lang="vi" data-accent={accent} className={dark ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
