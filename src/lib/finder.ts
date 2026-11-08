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

function localSearch(services: any[], q: string, platform: string): Pick[] {
  const words = q.toLowerCase().split(/[^a-z0-9à-ỹ]+/i).filter((w) => w.length >= 2);
  const scored = services
    .filter((sv) => !platform || sv.category.platform === platform)
    .map((sv) => {
      const hay = `${sv.name} ${sv.category.name} ${(PLATFORMS as any)[sv.category.platform] || ""}`.toLowerCase();
      let score = words.reduce((a, w) => a + (hay.includes(w) ? 2 : 0), 0);
      if (/rẻ|tiết kiệm|ngân sách|ít tiền/.test(q.toLowerCase())) score += 100000 / Math.max(1, sv.rate);
      return { sv, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.sv.rate - b.sv.rate)
    .slice(0, 6);
  return scored.map(({ sv }) => ({ id: sv.id, reason: "Khớp với mô tả của bạn" }));
}

/** Tìm dịch vụ theo mô tả tự nhiên — dùng AI khi đã cấu hình, lỗi/không có key thì
 *  rơi về tìm kiếm từ khoá. Giá trả về là giá của chính người xem: khách đã đăng
 *  nhập thấy giá đã giảm theo cấp bậc hệ thống, khách vãng lai thấy giá gốc. */
export async function findServices(opts: {
  q: string;
  platform?: string;
  viewer?: { level: string } | null;
}): Promise<{ mode: "ai" | "local"; picks: FinderPick[] }> {
  const q = opts.q.trim();
  const platform = (opts.platform || "").trim();
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
      const catalog = services.map((sv) => ({ id: sv.id, name: sv.name, cat: sv.category.name, platform: sv.category.platform, rate: sv.rate, min: sv.min, max: sv.max }));
      const raw = await aiChat(
        "Bạn là trợ lý gợi ý dịch vụ tăng tương tác mạng xã hội. Dựa trên danh mục dịch vụ (JSON) và nhu cầu của khách, chọn tối đa 5 dịch vụ phù hợp nhất. CHỈ trả lời JSON hợp lệ dạng {\"picks\":[{\"id\":123,\"reason\":\"lý do ngắn tiếng Việt\"}]} — không giải thích gì thêm.",
        `Nhu cầu của khách: "${q}"${platform ? ` — chỉ mạng xã hội: ${platform}` : ""}\nDanh mục: ${JSON.stringify(catalog)}`,
        aiCfg
      );
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      picks = (parsed.picks || []).filter((p: any) => services.some((sv) => sv.id === p.id)).slice(0, 5);
      if (!picks.length) throw new Error("empty");
      mode = "ai";
    } catch {
      picks = localSearch(services, q, platform);
      mode = "local";
    }
  } else {
    picks = localSearch(services, q, platform);
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
