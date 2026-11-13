import { prisma } from "./db";
import { getSettings } from "./settings";
import { aiConfigured, aiChat, panelAiConfig } from "./ai";
import { regularCatalogWhere } from "./order-scope";
import { getActiveFlashSale, flashAppliesToProduct, applyFlashAmount } from "./flash";

export type FinderPick = {
  id: number;
  name: string;
  slug: string;
  categoryName: string;
  price: number; // giá gói rẻ nhất đang bán (đã áp flash sale nếu có)
  reason: string;
};

type Pick = { id: number; reason: string };

type ProductRow = {
  id: number; name: string; slug: string; tagline: string | null;
  category: { name: string } | null;
  price: number;
};

function localSearch(products: ProductRow[], q: string, lang: "vi" | "en"): Pick[] {
  const words = q.toLowerCase().split(/[^a-z0-9à-ỹ]+/i).filter((w) => w.length >= 2);
  const scored = products
    .map((p) => {
      const hay = `${p.name} ${p.category?.name || ""} ${p.tagline || ""}`.toLowerCase();
      let score = words.reduce((a, w) => a + (hay.includes(w) ? 2 : 0), 0);
      if (/rẻ|tiết kiệm|ngân sách|ít tiền|cheap|budget/.test(q.toLowerCase())) score += 100000 / Math.max(1, p.price);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.price - b.p.price)
    .slice(0, 6);
  return scored.map(({ p }) => ({ id: p.id, reason: lang === "vi" ? "Khớp với mô tả của bạn" : "Matches your description" }));
}

function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Ngữ cảnh "sự thật của website" cấp cho AI tư vấn — mọi con số/câu chữ đều đọc
 *  từ dữ liệu thật đang lưu: cấu hình nạp tiền (mức tối thiểu + cổng đang bật),
 *  bài Hỏi đáp (FAQ) admin đã đăng và trích Điều khoản & chính sách. AI chỉ
 *  được dựa vào đây + danh mục sản phẩm, không suy diễn thêm. Lỗi đọc phần nào
 *  thì bỏ qua phần đó — tư vấn vẫn chạy bằng danh mục. */
async function siteGrounding(s: Record<string, string>): Promise<string> {
  const parts: string[] = [];
  const methods: string[] = [];
  if (s.sepay_enabled === "1") methods.push("QR ngân hàng qua SePay (tiền cộng tự động sau khi chuyển khoản đúng nội dung)");
  if (s.paypal_enabled === "1") methods.push("PayPal");
  if (s.stripe_enabled === "1") methods.push("Stripe (thẻ quốc tế)");
  if (s.usdt_enabled === "1") methods.push("USDT");
  parts.push(
    `THÔNG TIN WEBSITE (sự thật — không suy diễn thêm): tên website "${s.site_name || ""}"; nạp tiền tối thiểu ${s.deposit_min || "10000"}đ` +
    (methods.length ? `; cách nạp đang mở: ${methods.join("; ")}` : "") +
    `; cách mua hàng: chọn sản phẩm → chọn gói → thanh toán bằng số dư ví hoặc thanh toán trực tiếp; cần hỗ trợ trực tiếp thì khách tạo ticket hỗ trợ trên website.`
  );
  try {
    const faqCat = await prisma.postCategory.findUnique({ where: { slug: "faq" } });
    if (faqCat) {
      const posts = await prisma.post.findMany({
        where: { published: true, categoryId: faqCat.id, panelId: null },
        orderBy: [{ pinned: "desc" }, { id: "asc" }],
        take: 8,
        select: { title: true, content: true },
      });
      if (posts.length) {
        parts.push("HỎI ĐÁP THƯỜNG GẶP CỦA WEBSITE:\n" + posts.map((p) => `- ${p.title}: ${stripHtml(p.content || "").slice(0, 220)}`).join("\n"));
      }
    }
  } catch { /* ngữ cảnh phụ — bỏ qua nếu lỗi */ }
  const terms = stripHtml(s.terms_content || "");
  if (terms) parts.push(`ĐIỀU KHOẢN & CHÍNH SÁCH CỦA WEBSITE (trích đoạn): ${terms.slice(0, 1200)}`);
  return parts.join("\n");
}

/** Tìm sản phẩm Premium theo mô tả tự nhiên — dùng AI khi đã cấu hình,
 *  lỗi/không có key thì rơi về tìm kiếm từ khoá. Chỉ tìm trong catalog
 *  Premium THƯỜNG của cửa hàng chung (sản phẩm thuộc 6 khu riêng Telegram /
 *  Steam / Game Key / Gift Card / Top-Up / Manual có trang riêng, không gợi
 *  ý tại đây). Giá là giá gói rẻ nhất, đã áp flash sale đang chạy. */
export async function findServices(opts: {
  q: string;
  lang?: string;
}): Promise<{ mode: "ai" | "local"; picks: FinderPick[] }> {
  const q = opts.q.trim();
  const lang: "vi" | "en" = (opts.lang || "vi").toLowerCase().startsWith("vi") ? "vi" : "en";
  const flashSale = await getActiveFlashSale("PREMIUM");
  const rows = await prisma.premiumProduct.findMany({
    where: { active: true, panelId: null, ...regularCatalogWhere() },
    include: {
      category: { select: { name: true } },
      variants: { where: { active: true }, select: { price: true }, orderBy: { price: "asc" } },
    },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    take: 200,
  });
  const products: ProductRow[] = [];
  for (const p of rows) {
    const minPrice = p.variants.find((v) => v.price > 0)?.price || 0;
    if (!minPrice) continue;
    const price = flashAppliesToProduct(flashSale, p.id) ? applyFlashAmount(minPrice, flashSale!.percent) : minPrice;
    products.push({ id: p.id, name: p.name, slug: p.slug, tagline: p.tagline, category: p.category, price });
  }

  const aiCfg = panelAiConfig(null);

  let picks: Pick[] = [];
  let mode: "ai" | "local" = "local";
  if (await aiConfigured(aiCfg)) {
    try {
      const settings0 = await getSettings();
      const grounding = await siteGrounding(settings0);
      const siteName = settings0.site_name || "website";
      const catalog = products.map((p) => ({ id: p.id, name: p.name, cat: p.category?.name || "", price: p.price }));
      // "Bộ não" tư vấn: AI đóng vai nhân viên tư vấn của chính website này,
      // chỉ được dùng danh mục + thông tin website được cấp (giá thật, cách nạp,
      // FAQ, điều khoản) — không bịa sản phẩm/giá/chính sách ngoài ngữ cảnh.
      const system = lang === "vi"
        ? `Bạn là trợ lý tư vấn của website "${siteName}", tư vấn sản phẩm số (tài khoản, key bản quyền, gói dịch vụ) như một nhân viên bán hàng am hiểu sản phẩm. Dựa trên DANH MỤC SẢN PHẨM và THÔNG TIN WEBSITE được cấp, chọn tối đa 5 sản phẩm phù hợp nhất với nhu cầu của khách. QUY TẮC CỨNG: chỉ chọn id có trong danh mục — không bịa sản phẩm, giá hay chính sách ngoài phần thông tin được cấp; "price" là giá VNĐ của gói rẻ nhất của sản phẩm; gợi ý phải tuân thủ điều khoản & chính sách trong phần thông tin được cấp; mỗi "reason" tối đa 20 từ, viết bằng TIẾNG VIỆT, nêu đúng vì sao sản phẩm hợp nhu cầu; nếu không sản phẩm nào hợp, trả {"picks":[]}. CHỈ trả lời JSON hợp lệ dạng {"picks":[{"id":123,"reason":"..."}]} — không giải thích gì thêm.`
        : `You are the customer assistant of the website "${siteName}", advising on digital products (accounts, license keys, service plans) like a knowledgeable sales rep. From the PRODUCT CATALOG and WEBSITE INFORMATION provided, pick up to 5 products that best match the customer's need. HARD RULES: only pick ids present in the catalog — never invent products, prices or policies beyond the provided information; "price" is the VND price of the product's cheapest plan; picks must comply with the terms & policies in the provided information; each "reason" is at most 20 words, written in ENGLISH, stating exactly why the product fits the need; if nothing fits, return {"picks":[]}. Reply with valid JSON only, in the form {"picks":[{"id":123,"reason":"..."}]} — nothing else.`;
      const raw = await aiChat(
        system,
        (lang === "vi" ? `Nhu cầu của khách: "${q}"` : `Customer need: "${q}"`) +
        `\n${grounding}\n${lang === "vi" ? "Danh mục" : "Catalog"}: ${JSON.stringify(catalog)}`,
        aiCfg
      );
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      picks = (parsed.picks || []).filter((p: any) => products.some((x) => x.id === p.id)).slice(0, 5);
      if (!picks.length) throw new Error("empty");
      mode = "ai";
    } catch {
      picks = localSearch(products, q, lang);
      mode = "local";
    }
  } else {
    picks = localSearch(products, q, lang);
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const out: FinderPick[] = [];
  for (const p of picks) {
    const prod = byId.get(p.id);
    if (!prod) continue;
    out.push({
      id: prod.id,
      name: prod.name,
      slug: prod.slug,
      categoryName: prod.category?.name || "",
      price: prod.price,
      reason: p.reason,
    });
  }
  return { mode, picks: out };
}
