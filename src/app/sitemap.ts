import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { siteBaseUrl } from "@/lib/email-verify";
import { regularCatalogWhere } from "@/lib/order-scope";

export const dynamic = "force-dynamic";

/** Sitemap XML: chỉ trang CÔNG KHAI (trang chủ, premium, bảng giá, bài viết đã đăng,
 *  sản phẩm premium đang bán). Khu khách/admin không đưa vào. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBaseUrl();
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/premium`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/dich-vu`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
  ];
  try {
    const posts = await prisma.post.findMany({ where: { published: true, panelId: null }, select: { slug: true, updatedAt: true }, take: 500 });
    for (const p of posts) entries.push({ url: `${base}/bai-viet/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly", priority: 0.6 });
    // Chỉ sản phẩm cửa hàng THƯỜNG — sản phẩm các khu riêng (8 nhóm FZR)
    // không thuộc catalog chung nên không quảng bá URL /premium/<slug>.
    const products = await prisma.premiumProduct.findMany({ where: { active: true, ...regularCatalogWhere() }, select: { slug: true, updatedAt: true }, take: 500 });
    for (const p of products) entries.push({ url: `${base}/premium/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly", priority: 0.7 });
  } catch {}
  return entries;
}
