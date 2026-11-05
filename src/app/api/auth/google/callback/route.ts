import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { createSession } from "@/lib/auth";
import { randomKey } from "@/lib/format";

/** Callback đăng nhập Google: đổi code lấy thông tin email,
 *  khớp tài khoản theo email — có rồi thì đăng nhập, chưa có thì tạo mới (nếu mở đăng ký). */
export async function GET(req: NextRequest) {
  const fail = (text: string) => NextResponse.redirect(new URL(`/login?err=${encodeURIComponent(text)}`, req.url));
  const s = await getSettings();
  if (s.google_enabled !== "1" || !s.google_client_id || !s.google_client_secret) return fail("Đăng nhập Google đang tắt");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== cookies().get("g_oauth_state")?.value) return fail("Phiên đăng nhập Google không hợp lệ, thử lại");
  try {
    const redirectUri = new URL("/api/auth/google/callback", req.url).toString();
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: s.google_client_id,
        client_secret: s.google_client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const token: any = await tokenRes.json();
    if (!token.access_token) return fail("Không lấy được token từ Google");
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const info: any = await infoRes.json();
    const email = String(info.email || "").toLowerCase();
    if (!email || info.email_verified === false) return fail("Google không trả về email đã xác thực");

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      if (s.module_register === "0") return fail("Đăng ký đang tạm đóng — hãy dùng tài khoản đã có");
      const base = (email.split("@")[0] || "user").replace(/[^a-z0-9_.]/g, "").slice(0, 24) || "user";
      let username = base.length >= 4 ? base : base + "user";
      if (await prisma.user.findUnique({ where: { username } })) username = (base + randomKey(4)).toLowerCase().slice(0, 30);
      user = await prisma.user.create({
        data: {
          username,
          email,
          passwordHash: await bcrypt.hash(randomKey(24), 10),
          fullName: String(info.name || "").slice(0, 80) || null,
          depositCode: randomKey(6).toUpperCase(),
          refCode: randomKey(8).toUpperCase(),
          apiKey: randomKey(32),
        },
      });
    }
    if (user.status === "BANNED") return fail("Tài khoản đã bị khoá, vui lòng liên hệ hỗ trợ");
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await createSession({ id: user.id, role: user.role, username: user.username });
    return NextResponse.redirect(new URL("/dashboard", req.url));
  } catch {
    return fail("Đăng nhập Google gặp lỗi, thử lại sau");
  }
}
