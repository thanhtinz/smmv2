import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/email-verify";

export default function robots(): MetadataRoute.Robots {
  const base = siteBaseUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/panel-admin", "/dashboard", "/api", "/login/2fa"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
