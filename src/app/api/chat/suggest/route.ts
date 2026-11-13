import { NextResponse } from "next/server";
import { rateLimitExceeded, clientIp } from "@/lib/rate-limit";
import { getLang } from "@/lib/lang-server";
import { findServices } from "@/lib/finder";

export const dynamic = "force-dynamic";

/** Livechat tư vấn sản phẩm: khách mô tả nhu cầu → gợi ý sản phẩm Premium
 *  trong catalog kèm giá gói rẻ nhất (đã áp flash sale nếu đang chạy). */
export async function POST(req: Request) {
  if (rateLimitExceeded(`suggest|${clientIp(req.headers)}`, 20, 60000)) {
    return NextResponse.json({ error: "Quá nhiều yêu cầu, thử lại sau ít phút" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const q = String(body?.q || "").trim().slice(0, 300);
  if (q.length < 2) return NextResponse.json({ error: "Hãy mô tả nhu cầu dài hơn một chút" }, { status: 400 });
  const { mode, picks } = await findServices({ q, lang: getLang() });
  return NextResponse.json({ mode, picks });
}
