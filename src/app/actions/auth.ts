"use server";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword, isArgonHash, DUMMY_PASSWORD_HASH } from "@/lib/password";
import { lockdownState, userCanBypassLockdown, lockdownMessage } from "@/lib/lockdown";
import { headers } from "next/headers";

async function clientIp() {
  const { clientIp: ipOf } = await import("@/lib/rate-limit");
  return ipOf(headers());
}
async function assertNotBanned(panelId?: number) {
  const ip = await clientIp();
  if (!ip) return;
  const ban = await prisma.ipBan
    .findFirst({ where: { ip, OR: [{ panelId: null }, ...(panelId ? [{ panelId }] : [])] } })
    .catch(() => null);
  if (ban) throw new Error("Địa chỉ IP của bạn đã bị chặn" + (ban.panelId ? " khỏi website này" : " khỏi hệ thống") + (ban.reason ? `: ${ban.reason}` : ""));
}
import { createSession, destroySession, createPending2fa } from "@/lib/auth";
import { recordLoginEvent } from "@/lib/login-events";
import { panelByHost } from "@/lib/panel-host";
import { getSettings } from "@/lib/settings";
import { passwordError, loginLockSeconds, recordLoginFail, clearLoginFails, verifyRecaptcha, isDisposableEmail, regIpExceeded, recordRegAttempt } from "@/lib/security";

/** Rào chắn đăng ký dùng chung (mẹ + panel con): honeypot, mật khẩu theo chính sách, email dùng 1 lần, giới hạn IP. */
async function registrationGuard(formData: FormData, email: string, password: string, backPath: string) {
  const s = await getSettings();
  if (s.reg_honeypot === "1" && String(formData.get("website") || "")) back(backPath, "err", "Đăng ký không hợp lệ");
  const pwErr = passwordError(password, s);
  if (pwErr) back(backPath, "err", pwErr);
  if (isDisposableEmail(email, s)) back(backPath, "err", "Email dùng 1 lần không được chấp nhận, vui lòng dùng email thật");
  const ip = await clientIp();
  if (await regIpExceeded(ip)) back(backPath, "err", "IP của bạn đã đăng ký quá nhiều tài khoản trong 1 giờ, vui lòng thử lại sau");
  if (!(await verifyRecaptcha(String(formData.get("g-recaptcha-response") || "") || null, s.recaptcha_register === "1")))
    back(backPath, "err", "Vui lòng hoàn thành xác minh reCAPTCHA");
  return ip;
}
import { randomKey } from "@/lib/format";
import { redirect } from "next/navigation";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

export async function registerAction(formData: FormData) {
  if ((await getSettings()).module_register === "0") back("/register", "err", "Đăng ký đang tạm đóng, vui lòng quay lại sau");
  try { await assertNotBanned(); } catch (e: any) { back("/register", "err", String(e?.message || "IP bị chặn")); }
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!/^[a-z0-9_.]{4,30}$/.test(username)) back("/register", "err", "Tên đăng nhập 4-30 ký tự, chỉ gồm chữ thường, số, dấu . và _");
  if (!/^\S+@\S+\.\S+$/.test(email)) back("/register", "err", "Email không hợp lệ");
  const regIp = await registrationGuard(formData, email, password, "/register");
  const exists = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (exists) back("/register", "err", "Tên đăng nhập hoặc email đã được sử dụng");
  const ref = String(formData.get("ref") || "").trim().toUpperCase();
  const referrer = ref ? await prisma.user.findUnique({ where: { refCode: ref }, select: { id: true } }) : null;
  const user = await prisma.user.create({
    data: {
      username,
      email,
      phone: phone || null,
      fullName: fullName || null,
      passwordHash: await hashPassword(password),
      apiKey: randomKey(32),
      depositCode: randomKey(6).toUpperCase(),
      refCode: randomKey(8).toUpperCase(),
      referredById: referrer?.id ?? null,
    },
  }).catch((e: any) => { if (e?.code === "P2002") back("/register", "err", "Tên đăng nhập hoặc email đã được sử dụng"); throw e; });
  await recordRegAttempt(regIp);
  void (async () => { const { issueEmailVerification } = await import("@/lib/email-verify"); await issueEmailVerification({ id: user.id, email: user.email, username: user.username }); })();
  await recordRegAttempt(regIp);
  void (async () => { const { alertMother } = await import("@/lib/alerts"); await alertMother("new_user", "Khách đăng ký mới", `${username} (${email}) vừa tạo tài khoản`); })();
  await createSession({ id: user.id, role: user.role, username: user.username });
  redirect("/dashboard");
}

/** Đăng ký tài khoản THUỘC panel con — khách sẽ mua theo giá của panel đó */
export async function panelRegisterAction(formData: FormData) {
  const gs = await getSettings();
  if (gs.module_register === "0" || gs.module_panels === "0") back("/register", "err", "Đăng ký đang tạm đóng, vui lòng quay lại sau");
  try { await assertNotBanned(); } catch (e: any) { back("/register", "err", String(e?.message || "IP bị chặn")); }
  const slug = String(formData.get("slug") || "");
  const panel = await prisma.childPanel.findUnique({ where: { slug } });
  if (!panel || panel.status !== "ACTIVE") back(`/cua-hang/${slug}`, "err", "Panel này đang tạm ngưng nhận khách mới");
  if (!panel.moduleRegister) back(`/cua-hang/${slug}/dang-ky`, "err", "Website này đang tạm đóng đăng ký mới");
  try { await assertNotBanned(panel.id); } catch (e: any) { back(`/cua-hang/${slug}/dang-ky`, "err", String(e?.message || "IP bị chặn")); }
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const page = `/cua-hang/${slug}/dang-ky`;
  if (!/^[a-z0-9_.]{4,30}$/.test(username)) back(page, "err", "Tên đăng nhập 4-30 ký tự, chỉ gồm chữ thường, số, dấu . và _");
  if (!/^\S+@\S+\.\S+$/.test(email)) back(page, "err", "Email không hợp lệ");
  const regIp = await registrationGuard(formData, email, password, page);
  const exists = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (exists) back(page, "err", "Tên đăng nhập hoặc email đã được sử dụng");
  const ref = String(formData.get("ref") || "").trim().toUpperCase();
  const referrer = ref ? await prisma.user.findUnique({ where: { refCode: ref }, select: { id: true } }) : null;
  const user = await prisma.user.create({
    data: {
      username, email, fullName: fullName || null, phone: phone || null,
      passwordHash: await hashPassword(password),
      apiKey: randomKey(32),
      depositCode: randomKey(6).toUpperCase(),
      refCode: randomKey(8).toUpperCase(),
      referredById: referrer?.id ?? null,
      panelId: panel.id,
    },
  }).catch((e: any) => { if (e?.code === "P2002") back(page, "err", "Tên đăng nhập hoặc email đã được sử dụng"); throw e; });
  await recordRegAttempt(regIp);
  void (async () => { const { issueEmailVerification } = await import("@/lib/email-verify"); await issueEmailVerification({ id: user.id, email: user.email, username: user.username }); })();
  await recordRegAttempt(regIp);
  void (async () => { const { alertMother, alertPanelOwner } = await import("@/lib/alerts"); await alertMother("new_user", "Khách đăng ký mới", `${username} (${email}) vừa tạo tài khoản qua panel ${panel.name}`); await alertPanelOwner(panel.id, "new_user", "Khách đăng ký mới", `${username} (${email}) vừa tạo tài khoản tại website của bạn`); })();
  await createSession({ id: user.id, role: user.role, username: user.username });
  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  const login = String(formData.get("login") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const ip = await clientIp();
  const ua = headers().get("user-agent") || "";
  const hostPanel = await panelByHost().catch(() => null);
  const ev = (input: { userId?: number | null; success: boolean; reason?: string; panelId?: number | null }) =>
    recordLoginEvent({ username: login, ip, userAgent: ua, panelId: input.panelId ?? hostPanel?.id ?? null, ...input });
  try { await assertNotBanned(); } catch (e: any) {
    await ev({ success: false, reason: String(e?.message || "IP bị chặn") });
    back("/login", "err", String(e?.message || "IP bị chặn"));
  }
  const gs = await getSettings();
  const lockSec = await loginLockSeconds(ip, login);
  if (lockSec > 0) {
    await ev({ success: false, reason: "Bị khoá tạm do đăng nhập sai nhiều lần" });
    back("/login", "err", `Đăng nhập sai quá nhiều lần — thử lại sau ${Math.ceil(lockSec / 60)} phút`);
  }
  if (!(await verifyRecaptcha(String(formData.get("g-recaptcha-response") || "") || null, gs.recaptcha_login === "1"))) {
    await ev({ success: false, reason: "Chưa hoàn thành reCAPTCHA" });
    back("/login", "err", "Vui lòng hoàn thành xác minh reCAPTCHA");
  }
  const user = await prisma.user.findFirst({ where: { OR: [{ username: login }, { email: login }] } });
  if (!user) {
    // Chạy verify với hash giả để thời gian phản hồi giống hệt trường hợp sai mật khẩu
    await verifyPassword(DUMMY_PASSWORD_HASH, password);
    await recordLoginFail(ip, login);
    await ev({ success: false, reason: "Sai tài khoản hoặc mật khẩu" });
    back("/login", "err", "Sai tài khoản hoặc mật khẩu");
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    await recordLoginFail(ip, login);
    await ev({ userId: user.id, success: false, reason: "Sai tài khoản hoặc mật khẩu", panelId: user.panelId ?? hostPanel?.id ?? null });
    back("/login", "err", "Sai tài khoản hoặc mật khẩu");
  }
  await clearLoginFails(ip, login);
  // GĐ2: mật khẩu đúng mà hash còn là bcrypt cũ -> tự nâng cấp sang Argon2id
  if (!isArgonHash(user.passwordHash)) {
    const upgraded = await hashPassword(password).catch(() => null);
    if (upgraded) await prisma.user.update({ where: { id: user.id }, data: { passwordHash: upgraded } }).catch(() => null);
  }
  if (user.status === "BANNED") {
    await ev({ userId: user.id, success: false, reason: "Tài khoản đã bị khoá", panelId: user.panelId ?? hostPanel?.id ?? null });
    back("/login", "err", "Tài khoản đã bị khoá, vui lòng liên hệ hỗ trợ");
  }
  // GĐ2: khoá khẩn cấp — khách thường không đăng nhập mới được (quản trị + chủ/nhân viên panel được miễn)
  {
    const ld = await lockdownState();
    if (ld.on && !(await userCanBypassLockdown(user))) {
      await ev({ userId: user.id, success: false, reason: "Bị chặn do khoá khẩn cấp (lockdown)", panelId: user.panelId ?? hostPanel?.id ?? null });
      back("/login", "err", lockdownMessage(ld.reason));
    }
  }
  if (user.panelId) {
    try { await assertNotBanned(user.panelId); } catch (e: any) {
      await ev({ userId: user.id, success: false, reason: String(e?.message || "IP bị chặn"), panelId: user.panelId });
      back("/login", "err", String(e?.message || "IP bị chặn"));
    }
  }
  // Đã qua mật khẩu: tài khoản bật 2FA thì CHƯA tạo phiên — cấp cookie chờ 5 phút, sang trang nhập mã.
  // Sự kiện đăng nhập thành công chỉ ghi khi qua nốt bước mã (ở /api/auth/2fa/verify).
  if (user.totpEnabled) {
    await createPending2fa({ id: user.id, username: user.username });
    redirect("/login/2fa");
  }
  await ev({ userId: user.id, success: true, reason: "Đăng nhập bằng mật khẩu", panelId: user.panelId ?? hostPanel?.id ?? null });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({ id: user.id, role: user.role, username: user.username });
  redirect(user.role === "ADMIN" || user.role === "STAFF" ? "/admin" : "/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
