import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";
import { panelByHost } from "@/lib/panel-host";
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
  // Trên tên miền riêng của panel con: tiêu đề/SEO/favicon dùng bản riêng của panel.
  const panel = await panelByHost().catch(() => null);
  if (panel) {
    return {
      title: `${panel.name} — SMM Panel & Tài khoản Premium`,
      description: panel.metaDescription || panel.tagline || s?.site_tagline || "Tăng like, follow, view tự động + tài khoản premium giá tốt",
      keywords: panel.metaKeywords ? panel.metaKeywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
      openGraph: panel.ogImageUrl ? { images: [panel.ogImageUrl] } : undefined,
      manifest: "/manifest.webmanifest",
      appleWebApp: { capable: true, statusBarStyle: "default", title: panel.name },
      icons: { icon: panel.faviconUrl || s?.favicon_url || "/icon.svg", apple: panel.faviconUrl || s?.favicon_url || "/icon.svg" },
    };
  }
  return {
    title: `${s?.site_name || "SMMv2"} — SMM Panel & Tài khoản Premium`,
    description: s?.meta_description || s?.site_tagline || "Tăng like, follow, view tự động + tài khoản premium giá tốt",
    keywords: s?.meta_keywords ? s.meta_keywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
    openGraph: s?.og_image_url ? { images: [s.og_image_url] } : undefined,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: s?.site_name || "SMMv2" },
    icons: { icon: s?.favicon_url || "/icon.svg", apple: s?.favicon_url || "/icon.svg" },
  };
}

// Áp tuỳ chọn hiển thị khách đã chọn (localStorage) trước khi trang vẽ để không chớp
const THEME_SCRIPT = `(function(){try{var h=document.documentElement;var a=localStorage.getItem('smmv2-accent');var m=localStorage.getItem('smmv2-mode');if(a)h.setAttribute('data-accent',a);if(m==='dark')h.classList.add('dark');else if(m==='light')h.classList.remove('dark');var d=localStorage.getItem('smmv2-dir');if(d)h.setAttribute('dir',d);var f=localStorage.getItem('smmv2-font');if(f)h.setAttribute('data-font',f);var s=localStorage.getItem('smmv2-fsize');if(s)h.setAttribute('data-fsize',s);var l=localStorage.getItem('smmv2-lang');if(l)h.setAttribute('lang',l);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings().catch(() => null);
  const panel = await panelByHost().catch(() => null);
  const accent = panel?.accent || s?.default_accent || "blue";
  const dark = s?.default_mode === "dark";
  // Script/HTML: ở tên miền panel thì dùng bản riêng của panel, ở web mẹ dùng bản của mẹ.
  const headHtml = panel ? panel.customHeadHtml : s?.custom_head_html;
  const bodyHtml = panel ? panel.customBodyHtml : s?.custom_body_html;
  return (
    <html lang="en" data-accent={accent} className={dark ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {headHtml ? <div hidden dangerouslySetInnerHTML={{ __html: headHtml }} /> : null}
      </head>
      <body>{children}<DisplayEngine />{bodyHtml ? <div hidden dangerouslySetInnerHTML={{ __html: bodyHtml }} /> : null}</body>
    </html>
  );
}
