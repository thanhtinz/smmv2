import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { productImages } from "@/lib/format";
import { siteBaseUrl } from "@/lib/email-verify";
import { getSettings, getSiteUrl } from "@/lib/settings";
import { PublicFrame } from "@/components/public-frame";
import { PremiumDetailView } from "@/components/premium-views";

export const dynamic = "force-dynamic";

/** Metadata SEO của trang chi tiết (đợt SEO 2026-11-08): admin đặt
 *  metaTitle/metaDescription riêng thì dùng đúng bản đó; để trống thì TỰ
 *  ĐỘNG = tên sản phẩm / mô tả ngắn (hoặc trích nội dung mô tả) — trước
 *  đợt này trang chi tiết không có metadata riêng, kế thừa toàn bộ tiêu
 *  đề/mô tả chung của site từ layout gốc. Ảnh OG giữ ảnh sản phẩm. */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const product = await prisma.premiumProduct.findUnique({
    where: { slug: params.slug },
    select: { name: true, tagline: true, description: true, imageUrl: true, images: true, active: true, panelId: true, metaTitle: true, metaDescription: true },
  }).catch(() => null);
  if (!product || !product.active || product.panelId != null) return {};
  const plain = (html: string | null) => (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const title = product.metaTitle || product.name;
  const description = product.metaDescription || product.tagline || plain(product.description).slice(0, 160) || undefined;
  const img = productImages(product.images, product.imageUrl)[0];
  const base = (await getSiteUrl().catch(() => "")) || siteBaseUrl();
  const abs = img ? (img.startsWith("http") ? img : base + img) : undefined;
  // Loại thẻ Twitter theo CẤU HÌNH SEO toàn web (đợt 121) — không cứng riêng.
  const s = await getSettings().catch(() => null);
  const twitterCard = s?.twitter_card === "summary" ? "summary" : "summary_large_image";
  return {
    title,
    description,
    openGraph: { title, description, type: "website", ...(abs ? { images: [abs] } : {}) },
    twitter: { card: twitterCard, title, description, ...(abs ? { images: [abs] } : {}) },
  };
}

/** Chi tiết Premium công khai trong khung cửa hàng cho mọi khách — không còn
 *  chuyển hướng khách đã đăng nhập sang khu khách (đổi khung). Form mua bên
 *  trong tự hiện theo phiên đăng nhập; xem chi tiết không cần đăng nhập. */
export default async function PremiumDetail({ params, searchParams }: { params: { slug: string }; searchParams: { msg?: string; err?: string } }) {
  return (
    <PublicFrame>
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        <PremiumDetailView slug={params.slug} searchParams={searchParams} base="/premium" />
      </main>
    </PublicFrame>
  );
}
