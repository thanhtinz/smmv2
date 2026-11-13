import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/email-verify";
import { getSettings, getSiteUrl } from "@/lib/settings";

// Động như sitemap: URL gốc đọc từ CẤU HÌNH (setting site_url) lúc chạy —
// đóng tĩnh lúc build sẽ đóng băng giá trị env cũ vào robots.txt.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = (await getSiteUrl()) || siteBaseUrl();
  // Công tắc lập chỉ mục toàn web (Cấu hình → tab SEO, đợt 121): tắt ->
  // chặn MỌI bot trên toàn bộ web (giai đoạn chưa mở), không kèm sitemap.
  const s = await getSettings().catch(() => null);
  if (s?.seo_indexing === "0") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/panel-admin", "/dashboard", "/api", "/login/2fa"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
