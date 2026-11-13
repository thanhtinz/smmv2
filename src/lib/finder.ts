import { prisma } from "./db";
import { getSettings, levelDiscountFromSettings } from "./settings";
import { aiConfigured, aiChat, panelAiConfig } from "./ai";
import { PLATFORMS } from "./format";

export type FinderPick = {
  id: number;
  name: string;
  platform: string;
  platformLabel: string;
  categoryName: string;
  min: number;
  price: number; // giá của chính người xem / 1000
  reason: string;
};

type Pick = { id: number; reason: string };

function localSearch(services: any[], q: string, platform: string, lang: "vi" | "en"): Pick[] {
  const words = q.toLowerCase().split(/[^a-z0-9à-ỹ]+/i).filter((w) => w.length >= 2);
  const scored = services
    .filter((sv) => !platform || sv.category.platform === platform)
    .map((sv) => {
      const hay = `${sv.name} ${sv.category.name} ${(PLATFORMS as any)[sv.category.platform] || ""}`.toLowerCase();
      let score = words.reduce((a, w) => a + (hay.includes(w) ? 2 : 0), 0);
      if (/rẻ|tiết kiệm|ngân sách|ít tiền|cheap|budget/.test(q.toLowerCase())) score += 100000 / Math.max(1, sv.rate);
      return { sv, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.sv.rate - b.sv.rate)
    .slice(0, 6);
  return scored.map(({ sv }) => ({ id: sv.id, reason: lang === "vi" ? "Khớp với mô tả của bạn" : "Matches your description" }));
}

function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Ngữ cảnh "sự thật của website" cấp cho AI tư vấn — mọi con số/câu chữ đều đọc
 *  từ dữ liệu thật đang lưu: cấu hình nạp tiền (mức tối thiểu + cổng đang bật),
 *  bài Hỏi đáp (FAQ) admin đã đăng và trích Điều khoản & chính sách. AI chỉ
 *  được dựa vào đây + danh mục dịch vụ, không suy diễn thêm. Lỗi đọc phần nào
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
    `; cách đặt đơn: chọn dịch vụ → nhập link và số lượng → thanh toán bằng số dư ví; cần hỗ trợ trực tiếp thì khách tạo ticket hỗ trợ trên website.`
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

/** Tìm dịch vụ theo mô tả tự nhiên — dùng AI khi đã cấu hình, lỗi/không có key thì
 *  rơi về tìm kiếm từ khoá. Giá trả về là giá của chính người xem: khách đã đăng
 *  nhập thấy giá đã giảm theo cấp bậc hệ thống, khách vãng lai thấy giá gốc. */
export async function findServices(opts: {
  q: string;
  platform?: string;
  viewer?: { level: string } | null;
  lang?: string;
}): Promise<{ mode: "ai" | "local"; picks: FinderPick[] }> {
  const q = opts.q.trim();
  const platform = (opts.platform || "").trim();
  const lang: "vi" | "en" = (opts.lang || "vi").toLowerCase().startsWith("vi") ? "vi" : "en";
  const services = await prisma.smmService.findMany({
    where: { active: true, panelId: null },
    include: { category: true },
    orderBy: { rate: "asc" },
    take: 200,
  });

  const aiCfg = panelAiConfig(null);

  let picks: Pick[] = [];
  let mode: "ai" | "local" = "local";
  if (await aiConfigured(aiCfg)) {
    try {
      const settings0 = await getSettings();
      const grounding = await siteGrounding(settings0);
      const siteName = settings0.site_name || "website";
      const catalog = services.map((sv) => ({ id: sv.id, name: sv.name, cat: sv.category.name, platform: sv.category.platform, rate: sv.rate, min: sv.min, max: sv.max }));
      // "Bộ não" tư vấn: AI đóng vai nhân viên tư vấn của chính website này,
      // chỉ được dùng danh mục + thông tin website được cấp (giá thật, cách nạp,
      // FAQ, điều khoản) — không bịa dịch vụ/giá/chính sách ngoài ngữ cảnh.
      const system = lang === "vi"
        ? `Bạn là trợ lý tư vấn của website "${siteName}", tư vấn dịch vụ tăng tương tác mạng xã hội như một nhân viên bán hàng am hiểu sản phẩm. Dựa trên DANH MỤC DỊCH VỤ và THÔNG TIN WEBSITE được cấp, chọn tối đa 5 dịch vụ phù hợp nhất với nhu cầu của khách. QUY TẮC CỨNG: chỉ chọn id có trong danh mục — không bịa dịch vụ, giá hay chính sách ngoài phần thông tin được cấp; "rate" là giá VNĐ cho 1000 đơn vị, "min"/"max" là số lượng tối thiểu/tối đa của dịch vụ đó; gợi ý phải tuân thủ điều khoản & chính sách trong phần thông tin được cấp; mỗi "reason" tối đa 20 từ, viết bằng TIẾNG VIỆT, nêu đúng vì sao dịch vụ hợp nhu cầu; nếu không dịch vụ nào hợp, trả {"picks":[]}. CHỈ trả lời JSON hợp lệ dạng {"picks":[{"id":123,"reason":"..."}]} — không giải thích gì thêm.`
        : `You are the customer assistant of the website "${siteName}", advising on social-media engagement services like a knowledgeable sales rep. From the SERVICE CATALOG and WEBSITE INFORMATION provided, pick up to 5 services that best match the customer's need. HARD RULES: only pick ids present in the catalog — never invent services, prices or policies beyond the provided information; "rate" is the price in VND per 1000 units, "min"/"max" are that service's minimum/maximum quantity; picks must comply with the terms & policies in the provided information; each "reason" is at most 20 words, written in ENGLISH, stating exactly why the service fits the need; if nothing fits, return {"picks":[]}. Reply with valid JSON only, in the form {"picks":[{"id":123,"reason":"..."}]} — nothing else.`;
      const raw = await aiChat(
        system,
        (lang === "vi"
          ? `Nhu cầu của khách: "${q}"${platform ? ` — chỉ mạng xã hội: ${platform}` : ""}`
          : `Customer need: "${q}"${platform ? ` — social network only: ${platform}` : ""}`) +
        `\n${grounding}\n${lang === "vi" ? "Danh mục" : "Catalog"}: ${JSON.stringify(catalog)}`,
        aiCfg
      );
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      picks = (parsed.picks || []).filter((p: any) => services.some((sv) => sv.id === p.id)).slice(0, 5);
      if (!picks.length) throw new Error("empty");
      mode = "ai";
    } catch {
      picks = localSearch(services, q, platform, lang);
      mode = "local";
    }
  } else {
    picks = localSearch(services, q, platform, lang);
  }

  // Giá theo người xem
  const settings = await getSettings();
  const level = opts.viewer?.level || "MEMBER";

  const byId = new Map(services.map((sv) => [sv.id, sv]));
  const out: FinderPick[] = [];
  for (const p of picks) {
    const sv = byId.get(p.id);
    if (!sv) continue;
    const price = opts.viewer
      ? Math.max(1, Math.round(sv.rate * (1 - levelDiscountFromSettings(settings, level as any) / 100)))
      : sv.rate;
    out.push({
      id: sv.id,
      name: sv.name,
      platform: sv.category.platform,
      platformLabel: (PLATFORMS as any)[sv.category.platform] || sv.category.platform,
      categoryName: sv.category.name,
      min: sv.min,
      price,
      reason: p.reason,
    });
  }
  return { mode, picks: out };
}
