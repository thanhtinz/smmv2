import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings, levelDiscountFromSettings } from "@/lib/settings";
import { aiConfigured, aiChat } from "@/lib/ai";
import { PageHead, Badge } from "@/components/ui";
import { vnd, num, PLATFORMS } from "@/lib/format";

export const dynamic = "force-dynamic";

type Pick = { id: number; reason: string };

function localSearch(services: any[], q: string, platform: string): Pick[] {
  const words = q.toLowerCase().split(/[^a-z0-9à-ỹ]+/i).filter((w) => w.length >= 2);
  const scored = services
    .filter((sv) => !platform || sv.category.platform === platform)
    .map((sv) => {
      const hay = `${sv.name} ${sv.category.name} ${(PLATFORMS as any)[sv.category.platform]?.label || ""}`.toLowerCase();
      let score = words.reduce((a, w) => a + (hay.includes(w) ? 2 : 0), 0);
      if (/rẻ|tiết kiệm|ngân sách|ít tiền/.test(q.toLowerCase())) score += 100000 / Math.max(1, sv.rate);
      return { sv, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.sv.rate - b.sv.rate)
    .slice(0, 6);
  return scored.map(({ sv }) => ({ id: sv.id, reason: "Khớp với mô tả của bạn" }));
}

export default async function AiFinderPage({ searchParams }: { searchParams: { q?: string; platform?: string } }) {
  const user = (await getCurrentUser())!;
  const settings = await getSettings();
  const discount = levelDiscountFromSettings(settings, user.level);
  const q = (searchParams.q || "").trim();
  const platform = (searchParams.platform || "").trim();
  const useAi = await aiConfigured();

  let picks: Pick[] = [];
  let mode: "ai" | "local" | null = null;
  let aiNote = "";
  if (q) {
    const services = await prisma.smmService.findMany({
      where: { active: true },
      include: { category: true },
      orderBy: { rate: "asc" },
      take: 200,
    });
    if (useAi) {
      try {
        const catalog = services.map((sv) => ({ id: sv.id, name: sv.name, cat: sv.category.name, platform: sv.category.platform, rate: sv.rate, min: sv.min, max: sv.max }));
        const raw = await aiChat(
          "Bạn là trợ lý gợi ý dịch vụ tăng tương tác mạng xã hội. Dựa trên danh mục dịch vụ (JSON) và nhu cầu của khách, chọn tối đa 5 dịch vụ phù hợp nhất. CHỈ trả lời JSON hợp lệ dạng {\"picks\":[{\"id\":123,\"reason\":\"lý do ngắn tiếng Việt\"}]} — không giải thích gì thêm.",
          `Nhu cầu của khách: "${q}"${platform ? ` — chỉ mạng xã hội: ${platform}` : ""}\nDanh mục: ${JSON.stringify(catalog)}`
        );
        const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
        picks = (parsed.picks || []).filter((p: any) => services.some((sv) => sv.id === p.id)).slice(0, 5);
        mode = "ai";
        if (!picks.length) throw new Error("empty");
      } catch {
        picks = localSearch(services, q, platform);
        mode = "local";
        aiNote = "AI đang bận hoặc trả lời không hợp lệ — đang hiển thị kết quả tìm kiếm thường.";
      }
    } else {
      picks = localSearch(services, q, platform);
      mode = "local";
    }
    if (picks.length) {
      const rows = await prisma.smmService.findMany({ where: { id: { in: picks.map((p) => p.id) } }, include: { category: true } });
      const byId = new Map(rows.map((r) => [r.id, r]));
      picks = picks.map((p) => ({ ...p, sv: byId.get(p.id) })).filter((p: any) => p.sv) as any;
    }
  }

  return (
    <div>
      <PageHead title="Tìm dịch vụ bằng AI" desc="Mô tả nhu cầu bằng câu chữ thường — hệ thống gợi ý dịch vụ phù hợp nhất kèm giá theo cấp bậc của bạn." />
      <form method="get" className="card mb-6 space-y-4 p-5">
        <div>
          <label className="lbl">Bạn muốn tăng gì?</label>
          <input className="inp" name="q" defaultValue={q} placeholder="VD: Tôi cần tăng follow TikTok cho kênh bán hàng, ngân sách vừa phải" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="inp w-auto" name="platform" defaultValue={platform}>
            <option value="">Mọi mạng xã hội</option>
            {Object.entries(PLATFORMS).map(([k, v]: any) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn-primary">Tìm dịch vụ</button>
          {mode && <Badge cls={mode === "ai" ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-600"}>{mode === "ai" ? "Gợi ý bởi AI" : "Tìm kiếm thường"}</Badge>}
        </div>
        {aiNote && <p className="text-xs text-amber-600">{aiNote}</p>}
      </form>
      {q && picks.length === 0 && <div className="card p-10 text-center text-slate-400">Chưa tìm thấy dịch vụ khớp với mô tả — thử mô tả ngắn gọn hơn (tên mạng xã hội + thứ cần tăng).</div>}
      <div className="space-y-3">
        {(picks as any[]).map((p) => {
          const price = Math.max(1, Math.round(p.sv.rate * (1 - discount / 100)));
          return (
            <div key={p.id} className="card flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-slate-900">{p.sv.name}</div>
                <div className="mt-0.5 text-sm text-slate-400">{(PLATFORMS as any)[p.sv.category.platform]?.label} · {p.sv.category.name} · tối thiểu {num(p.sv.min)}</div>
                <p className="mt-1.5 text-sm text-brand-700">{p.reason}</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Giá của bạn / 1000</div>
                <div className="text-lg font-extrabold">{vnd(price)}</div>
              </div>
              <Link href={`/dashboard/dat-hang?service=${p.sv.id}`} className="btn-primary">Đặt đơn</Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
