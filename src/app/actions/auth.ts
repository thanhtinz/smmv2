"use server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

async function clientIp() {
  const h = headers();
  return (h.get("x-forwarded-for") || h.get("x-real-ip") || "").split(",")[0].trim();
}
async function assertNotBanned() {
  const ip = await clientIp();
  if (!ip) return;
  const ban = await prisma.ipBan.findUnique({ where: { ip } }).catch(() => null);
  if (ban) throw new Error("Địa chỉ IP của bạn đã bị chặn khỏi hệ thống" + (ban.reason ? `: ${ban.reason}` : ""));
}
import { createSession, destroySession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
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
  const minPw = parseInt((await getSettings()).password_min_length || "6") || 6;
  if (password.length < minPw) back("/register", "err", `Mật khẩu tối thiểu ${minPw} ký tự`);
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
      passwordHash: await bcrypt.hash(password, 10),
      apiKey: randomKey(32),
      depositCode: randomKey(6).toUpperCase(),
      refCode: randomKey(8).toUpperCase(),
      referredById: referrer?.id ?? null,
    },
  });
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
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const page = `/cua-hang/${slug}/dang-ky`;
  if (!/^[a-z0-9_.]{4,30}$/.test(username)) back(page, "err", "Tên đăng nhập 4-30 ký tự, chỉ gồm chữ thường, số, dấu . và _");
  if (!/^\S+@\S+\.\S+$/.test(email)) back(page, "err", "Email không hợp lệ");
  if (password.length < 6) back(page, "err", "Mật khẩu tối thiểu 6 ký tự");
  const exists = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (exists) back(page, "err", "Tên đăng nhập hoặc email đã được sử dụng");
  const ref = String(formData.get("ref") || "").trim().toUpperCase();
  const referrer = ref ? await prisma.user.findUnique({ where: { refCode: ref }, select: { id: true } }) : null;
  const user = await prisma.user.create({
    data: {
      username, email, fullName: fullName || null, phone: phone || null,
      passwordHash: await bcrypt.hash(password, 10),
      apiKey: randomKey(32),
      depositCode: randomKey(6).toUpperCase(),
      refCode: randomKey(8).toUpperCase(),
      referredById: referrer?.id ?? null,
      panelId: panel.id,
    },
  });
  void (async () => { const { alertMother, alertPanelOwner } = await import("@/lib/alerts"); await alertMother("new_user", "Khách đăng ký mới", `${username} (${email}) vừa tạo tài khoản qua panel ${panel.name}`); await alertPanelOwner(panel.id, "new_user", "Khách đăng ký mới", `${username} (${email}) vừa tạo tài khoản tại gian hàng của bạn`); })();
  await createSession({ id: user.id, role: user.role, username: user.username });
  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
  try { await assertNotBanned(); } catch (e: any) { back("/login", "err", String(e?.message || "IP bị chặn")); }
  const login = String(formData.get("login") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const user = await prisma.user.findFirst({ where: { OR: [{ username: login }, { email: login }] } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    back("/login", "err", "Sai tài khoản hoặc mật khẩu");
  if (user.status === "BANNED") back("/login", "err", "Tài khoản đã bị khoá, vui lòng liên hệ hỗ trợ");
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({ id: user.id, role: user.role, username: user.username });
  redirect(user.role === "ADMIN" || user.role === "STAFF" ? "/admin" : "/dashboard");
}

export async function logoutAction() {
  destroySession();
  redirect("/");
}
