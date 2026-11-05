import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { findServices } from "@/lib/finder";

export const dynamic = "force-dynamic";

/** Livechat tư vấn dịch vụ: khách mô tả nhu cầu → gợi ý dịch vụ kèm giá của chính họ.
 *  Đăng nhập rồi thì giá theo cấp bậc/panel của họ và nút đặt đơn vào thẳng form;
 *  khách vãng lai thấy giá gốc và được mời đăng nhập khi bấm đặt. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const q = String(body?.q || "").trim().slice(0, 300);
  if (q.length < 2) return NextResponse.json({ error: "Hãy mô tả nhu cầu dài hơn một chút" }, { status: 400 });
  const platform = String(body?.platform || "").trim().slice(0, 30);
  const panelSlug = String(body?.panelSlug || "").trim().slice(0, 100) || null;
  const user = await getCurrentUser();
  const { mode, picks } = await findServices({
    q,
    platform,
    panelSlug,
    viewer: user ? { level: user.level, panelId: user.panelId } : null,
  });
  return NextResponse.json({ mode, picks, loggedIn: !!user });
}
