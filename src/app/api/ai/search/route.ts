// Đấu nối BNT AI Company — GET /api/ai/search?q=... — tìm sống trong tài
// liệu kiến thức của BNT Shop (cùng nguồn buildAiDocs với /api/ai/knowledge).
import { NextResponse } from "next/server";
import { aiAuthorized, buildAiDocs, normalizeVi } from "@/lib/ai-knowledge";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!aiAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const tokens = Array.from(new Set(normalizeVi(q).split(/[^a-z0-9%]+/).filter((x) => x.length >= 2)));
  try {
    const docs = await buildAiDocs();
    const results = docs
      .map((doc) => {
        const hay = normalizeVi(`${doc.title} ${doc.body}`);
        const score = tokens.reduce((acc, tok) => acc + (hay.includes(tok) ? 1 : 0), 0);
        return { doc, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ doc }) => ({ title: doc.title, snippet: doc.body.slice(0, 400) }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Chưa đọc được dữ liệu của web" }, { status: 503 });
  }
}
