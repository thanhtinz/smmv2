import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Caddy hỏi endpoint này trước khi cấp chứng chỉ HTTPS theo yêu cầu (on-demand
 *  TLS) cho một tên miền lạ: chỉ đồng ý khi đó là tên miền chính của hệ thống —
 *  tránh cấp cert cho domain không thuộc hệ thống. */
export async function GET(req: NextRequest) {
  const domain = (req.nextUrl.searchParams.get("domain") || "").split(":")[0].toLowerCase();
  if (!domain) return new NextResponse("missing domain", { status: 400 });
  const mainHost = (process.env.MAIN_HOST || "").toLowerCase();
  if (mainHost && domain === mainHost) return new NextResponse("ok", { status: 200 });
  try {
    const siteHost = new URL(process.env.NEXT_PUBLIC_SITE_URL || "").hostname.toLowerCase();
    if (siteHost && domain === siteHost) return new NextResponse("ok", { status: 200 });
  } catch { /* NEXT_PUBLIC_SITE_URL không hợp lệ — bỏ qua */ }
  return new NextResponse("unknown domain", { status: 404 });
}
