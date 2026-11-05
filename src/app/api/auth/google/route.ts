import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/settings";

/** Bắt đầu đăng nhập Google: chuyển khách sang trang đồng ý của Google.
 *  Client ID/Secret do admin cấu hình ở Cấu hình → Chung. */
export async function GET(req: NextRequest) {
  const s = await getSettings();
  if (s.google_enabled !== "1" || !s.google_client_id) {
    return NextResponse.redirect(new URL("/login?err=" + encodeURIComponent("Đăng nhập Google đang tắt"), req.url));
  }
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  cookies().set("g_oauth_state", state, { httpOnly: true, maxAge: 600, path: "/" });
  const redirectUri = new URL("/api/auth/google/callback", req.url).toString();
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", s.google_client_id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(u);
}
