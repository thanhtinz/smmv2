import { NextResponse } from "next/server";
import { rateLimitExceeded, clientIp } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/auth";
import { getLang } from "@/lib/lang-server";
import { findServices } from "@/lib/finder";

export const dynamic = "force-dynamic";

/** Livechat tư vấn dịch vụ: khách mô tả nhu cầu → gợi ý dịch vụ kèm giá của chính họ.
 *  Đăng nhập rồi thì giá theo cấp bậc của họ và nút đặt đơn vào thẳng form;
 *  khách vãng lai thấy giá gốc và được mời đăng nhập khi bấm đặt. */
export async function POST(req: Request) {
  if (rateLimitExceeded(`suggest|${clientIp(req.headers)}`, 20, 60000)) {
    return NextResponse.json({ error: "Quá nhiều yêu cầu, thử lại sau ít phút" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const q = String(body?.q || "").trim().slice(0, 300);
  if (q.length < 2) return NextResponse.json({ error: "Hãy mô tả nhu cầu dài hơn một chút" }, { status: 400 });
  const platform = String(body?.platform || "").trim().slice(0, 30);
  const user = await getCurrentUser();
  const { mode, picks } = await findServices({
    q,
    platform,
    viewer: user ? { level: user.level } : null,
    lang: getLang(),
  });
  return NextResponse.json({ mode, picks, loggedIn: !!user });
}
