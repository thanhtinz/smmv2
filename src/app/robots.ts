import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/email-verify";
import { getSiteUrl } from "@/lib/settings";

// Động như sitemap: URL gốc đọc từ CẤU HÌNH (setting site_url) lúc chạy —
// đóng tĩnh lúc build sẽ đóng băng giá trị env cũ vào robots.txt.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = (await getSiteUrl()) || siteBaseUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/panel-admin", "/dashboard", "/api", "/login/2fa"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
