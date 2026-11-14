// KIT cho BNT Shop — chép vào src/lib/ai-knowledge.ts của repo bntshop (smmv2).
// Kiến thức đọc thẳng từ DB thật: PremiumProduct + PremiumVariant (giá theo
// thời hạn) — admin sửa giá là AI trả lời theo giá mới.
import { prisma } from "./db";

export interface AiDoc {
  id: string;
  kind: string;
  title: string;
  body: string;
  updatedAt: string;
}

export async function buildAiDocs(): Promise<AiDoc[]> {
  const today = new Date().toISOString().slice(0, 10);
  const products = await prisma.premiumProduct.findMany({
    include: { category: true, variants: { orderBy: { price: "asc" } } },
    orderBy: { id: "asc" },
    take: 500,
  });
  const docs: AiDoc[] = products.map((p) => {
    const prices = p.variants
      .filter((v) => !v.outOfStock)
      .map((v) => `${v.name}: ${v.price.toLocaleString("vi-VN")}đ`)
      .join("; ");
    return {
      id: `shop-product-${p.slug}`,
      kind: "product",
      title: `${p.name} (${p.category?.name ?? ""})`.trim(),
      body:
        (p.tagline ? `${p.tagline}. ` : "") +
        (p.description ? `${p.description} ` : "") +
        (prices ? `Giá theo thời hạn — ${prices}.` : "Hiện chưa có gói đang bán."),
      updatedAt: today,
    };
  });
  docs.push({
    id: "shop-policy",
    kind: "policy",
    title: "Chính sách giao hàng và bảo hành",
    body:
      "Sản phẩm số được giao tự động qua email ngay sau thanh toán (key/tài khoản). Thời hạn bảo hành theo từng gói. " +
      "AI không tự hoàn tiền hay đổi giá — mọi yêu cầu hoàn tiền phải qua ticket để người thật xét theo chính sách của shop.",
    updatedAt: today,
  });
  return docs;
}

export function normalizeVi(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

export function aiAuthorized(req: Request): boolean {
  const expected = process.env.AI_SERVICE_TOKEN?.trim();
  if (!expected) return true;
  return req.headers.get("x-bnt-ai-token") === expected;
}
