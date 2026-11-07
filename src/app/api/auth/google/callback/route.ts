import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { decryptPanelSecrets } from "@/lib/panel-secrets";
import { getSettings } from "@/lib/settings";
import { createSession, createPending2fa } from "@/lib/auth";
import { recordLoginEvent } from "@/lib/login-events";
import { randomKey } from "@/lib/format";

/** Callback đăng nhập Google: đổi code lấy thông tin email,
 *  khớp tài khoản theo email — có rồi thì đăng nhập, chưa có thì tạo mới (nếu mở đăng ký). */
export async function GET(req: NextRequest) {
  const fail = (text: string) => NextResponse.redirect(new URL(`/login?err=${encodeURIComponent(text)}`, req.url));
  const s = await getSettings();
  const panelIdCookie = parseInt(cookies().get("g_oauth_panel")?.value || "");
  const panelRaw = panelIdCookie ? await prisma.childPanel.findUnique({ where: { id: panelIdCookie } }).catch(() => null) : null;
  const panel = decryptPanelSecrets(panelRaw);
  const panelGoogle = panel && panel.status === "ACTIVE" && panel.googleClientId && panel.googleClientSecret ? panel : null;
  const clientId = panelGoogle ? panelGoogle.googleClientId! : s.google_client_id;
  const clientSecret = panelGoogle ? panelGoogle.googleClientSecret! : s.google_client_secret;
  if (!panelGoogle && (s.google_enabled !== "1" || !s.google_client_id || !s.google_client_secret)) return fail("Đăng nhập Google đang tắt");
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
        client_id: clientId,
        client_secret: clientSecret,
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
          emailVerified: true, // email đã được Google xác thực
          passwordHash: await hashPassword(randomKey(24)),
          fullName: String(info.name || "").slice(0, 80) || null,
          depositCode: randomKey(6).toUpperCase(),
          ...(panelGoogle ? { panelId: panelGoogle.id } : {}),
          refCode: randomKey(8).toUpperCase(),
          apiKey: randomKey(32),
        },
      });
    }
    const { clientIp } = await import("@/lib/rate-limit");
    const ip = clientIp(req.headers);
    const ua = req.headers.get("user-agent") || "";
    if (user.status === "BANNED") {
      await recordLoginEvent({ userId: user.id, username: user.username, success: false, reason: "Tài khoản đã bị khoá (Google)", ip, userAgent: ua, panelId: user.panelId ?? null });
      return fail("Tài khoản đã bị khoá, vui lòng liên hệ hỗ trợ");
    }
    // IP bị cấm thì không cho vào bằng Google (luồng mật khẩu đã chặn ở assertNotBanned)
    if (ip && ip !== "?") {
      const ban = await prisma.ipBan.findFirst({ where: { ip, OR: [{ panelId: null }, ...(user.panelId ? [{ panelId: user.panelId }] : [])] } }).catch(() => null);
      if (ban) {
        await recordLoginEvent({ userId: user.id, username: user.username, success: false, reason: "IP bị chặn (Google)", ip, userAgent: ua, panelId: user.panelId ?? null });
        return fail("Địa chỉ IP của bạn đã bị chặn" + (ban.reason ? `: ${ban.reason}` : ""));
      }
    }
    // GĐ2: khoá khẩn cấp — khách thường không đăng nhập mới được
    {
      const { lockdownState, userCanBypassLockdown, lockdownMessage } = await import("@/lib/lockdown");
      const ld = await lockdownState();
      if (ld.on && !(await userCanBypassLockdown(user))) {
        await recordLoginEvent({ userId: user.id, username: user.username, success: false, reason: "Bị chặn do khoá khẩn cấp (lockdown, Google)", ip, userAgent: ua, panelId: user.panelId ?? null });
        return fail(lockdownMessage(ld.reason));
      }
    }
    // Tài khoản bật 2FA: qua Google vẫn phải nhập mã bước 2 mới tạo phiên
    if (user.totpEnabled) {
      await createPending2fa({ id: user.id, username: user.username });
      return NextResponse.redirect(new URL("/login/2fa", req.url));
    }
    await recordLoginEvent({ userId: user.id, username: user.username, success: true, reason: "Đăng nhập bằng Google", ip, userAgent: ua, panelId: user.panelId ?? null });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await createSession({ id: user.id, role: user.role, username: user.username });
    // GĐ3: tính lại điểm rủi ro nền sau đăng nhập
    void (async () => { const { evaluateUserRisk } = await import("@/lib/risk"); await evaluateUserRisk(user.id); })();
    return NextResponse.redirect(new URL("/dashboard", req.url));
  } catch {
    return fail("Đăng nhập Google gặp lỗi, thử lại sau");
  }
}
