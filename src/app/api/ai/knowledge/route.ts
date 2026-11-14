// KIT cho BNT Shop — chép vào src/app/api/ai/knowledge/route.ts của repo bntshop (smmv2).
import { NextResponse } from "next/server";
import { aiAuthorized, buildAiDocs } from "@/lib/ai-knowledge";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!aiAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ site: "shop", docs: await buildAiDocs() });
  } catch {
    return NextResponse.json({ error: "Chưa đọc được dữ liệu của web" }, { status: 503 });
  }
}
