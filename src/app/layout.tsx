import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { getSettings, siteUrlFromSettings } from "@/lib/settings";
import { siteBaseUrl } from "@/lib/email-verify";
import { getServerI18n } from "@/lib/lang-server";
import { DisplayEngine } from "@/components/display";
import { LangProvider } from "@/components/lang";
import { AffTracker } from "@/components/aff-tracker";
import { BRAND_APPLE_ICON_URL, BRAND_FAVICON_URL, BRAND_FULL_URL } from "@/lib/brand";

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4680ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1120" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  const { L } = await getServerI18n().catch(() => ({ L: (t: string) => t }));
  // Gốc URL cho metadata (canonical/OG): Liên kết web admin cấu hình thắng
  // env (đợt 120); đợt 121 (SEO chuyên nghiệp) mở rộng tiếp trên nền này.
  const base = siteUrlFromSettings(s);
  // SEO (đợt 121): MỌI thẻ meta đọc từ CẤU HÌNH SEO trong admin (tab SEO) —
  // không hardcode nội dung meta ở đây; các chuỗi rơi về dưới đây chỉ là
  // FALLBACK KỸ THUẬT khi setting trống/đọc lỗi, đúng giá trị mặc định cũ.
  const siteName = s?.site_name || "BNT Shop";
  const defaultTitle = s?.seo_default_title?.trim()
    ? L(s.seo_default_title.trim())
    : `${siteName} — ${L("Tài khoản Premium & Sản phẩm số")}`;
  // Mẫu tiêu đề trang con: chỉ áp khi admin có đặt VÀ chứa "%s" (kiểm mềm
  // phía đọc — mẫu sai định dạng thì bỏ qua, không để Next áp sai toàn site).
  const titleTemplate = s?.seo_title_template?.trim() && s.seo_title_template.includes("%s")
    ? s.seo_title_template.trim()
    : null;
  const metaDescription = s?.meta_description || s?.site_tagline || "";
  const ogTitle = s?.og_title?.trim() ? L(s.og_title.trim()) : siteName;
  const ogDescription = s?.og_description?.trim()
    ? L(s.og_description.trim())
    : metaDescription ? L(metaDescription) : undefined;
  const ogImages = s?.og_image_url ? [s.og_image_url] : [BRAND_FULL_URL];
  const twitterCard = s?.twitter_card === "summary" ? "summary" : "summary_large_image";
  // Công tắc lập chỉ mục toàn web (tab SEO): tắt -> mọi trang noindex.
  const indexingOff = s?.seo_indexing === "0";
  return {
    ...(base ? { metadataBase: new URL(base) } : {}),
    title: titleTemplate ? { default: defaultTitle, template: titleTemplate } : defaultTitle,
    description: L(metaDescription || "Tài khoản Premium & Sản phẩm số — tự động 24/7"),
    keywords: s?.meta_keywords ? s.meta_keywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
    openGraph: { title: ogTitle, siteName, ...(base ? { url: base } : {}), description: ogDescription, type: "website", images: ogImages },
    twitter: { card: twitterCard, title: ogTitle, description: ogDescription, images: ogImages },
    ...(indexingOff ? { robots: { index: false, follow: false } } : {}),
    alternates: { canonical: "/" },
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: siteName },
    icons: { icon: s?.favicon_url || BRAND_FAVICON_URL, apple: s?.favicon_url || BRAND_APPLE_ICON_URL },
  };
}

// Áp tuỳ chọn hiển thị khách đã chọn (localStorage) trước khi trang vẽ để không chớp.
// Giao diện nay được dịch LÚC RENDER theo cookie nên chỉ cần chống chớp khi ngôn ngữ
// đã lưu ở máy khách KHÁC ngôn ngữ server vừa render (lần vào đầu trước khi đồng bộ
// cookie xong): ẩn thân trang tới khi DisplayEngine đồng bộ + refresh xong (tối đa 1.6s).
const THEME_SCRIPT = `(function(){try{var h=document.documentElement;var a=localStorage.getItem('smmv2-accent');var m=localStorage.getItem('smmv2-mode');if(a)h.setAttribute('data-accent',a);if(m==='dark')h.classList.add('dark');else if(m==='light')h.classList.remove('dark');var d=localStorage.getItem('smmv2-dir');if(d)h.setAttribute('dir',d);var f=localStorage.getItem('smmv2-font');if(f)h.setAttribute('data-font',f);var s=localStorage.getItem('smmv2-fsize');if(s)h.setAttribute('data-fsize',s);var l=localStorage.getItem('smmv2-lang');if(l)h.setAttribute('lang',l);if(l&&l!=='__SERVER_LANG__'){h.setAttribute('data-i18n-pending','1');setTimeout(function(){h.removeAttribute('data-i18n-pending');},1600);}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce CSP của request này (middleware cấp) — gắn cho mọi script nội
  // tuyến của hệ thống để chạy được khi CSP bỏ 'unsafe-inline' (P3-02).
  const nonce = (await headers()).get("x-nonce") || undefined;
  const s = await getSettings().catch(() => null);
  const i18n = await getServerI18n().catch(() => null);
  const langCfgJson = i18n ? JSON.stringify(i18n.cfg).replace(/</g, "\\u003c") : "{}";
  const themeScript = THEME_SCRIPT.replace("__SERVER_LANG__", i18n?.lang || "en");
  const accent = s?.default_accent || "blue";
  const dark = s?.default_mode === "dark";
  const headHtml = s?.custom_head_html;
  const bodyHtml = s?.custom_body_html;
  // Dữ liệu có cấu trúc (SEO đợt 2026-11-08): Organization + WebSite toàn
  // site từ chính cài đặt (tên/logo/URL) — không bịa số liệu.
  const siteBase = siteUrlFromSettings(s) || (() => { try { return siteBaseUrl(); } catch { return ""; } })();
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: s?.site_name || "BNT Shop",
    ...(siteBase ? { url: siteBase + "/" } : {}),
    // Logo: admin tự tải thắng; trống → logo BNT Shop gói sẵn (đợt 117).
    ...(s?.logo_url
      ? { logo: s.logo_url.startsWith("http") ? s.logo_url : siteBase + s.logo_url }
      : siteBase ? { logo: siteBase + BRAND_FULL_URL } : {}),
  };
  const webLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: s?.site_name || "BNT Shop",
    ...(siteBase ? { url: siteBase + "/" } : {}),
  };
  return (
    <html lang={i18n?.lang || "en"} data-accent={accent} className={dark ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `window.__LANGCFG__=${langCfgJson};` }} />
        {s?.gsc_verification ? <meta name="google-site-verification" content={s.gsc_verification} /> : null}
        <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, "\\u003c") }} />
        <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(webLd).replace(/</g, "\\u003c") }} />
        {s?.ga_id ? (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${s.ga_id}`} />
            <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${String(s.ga_id).replace(/[^A-Za-z0-9-]/g, "")}');` }} />
          </>
        ) : null}
        {headHtml ? <div hidden dangerouslySetInnerHTML={{ __html: headHtml }} /> : null}
      </head>
      <body>
        <LangProvider lang={i18n?.lang || "en"} ov={i18n ? i18n.cfg.overrides[i18n.lang] : undefined} cur={i18n?.cur || "VND"} rates={i18n?.rates || {}}>
          {children}
        </LangProvider>
        <AffTracker />
        <DisplayEngine />
        {bodyHtml ? <div hidden dangerouslySetInnerHTML={{ __html: bodyHtml }} /> : null}
      </body>
    </html>
  );
}
