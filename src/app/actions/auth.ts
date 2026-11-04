"use server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { randomKey } from "@/lib/format";
import { redirect } from "next/navigation";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

export async function registerAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!/^[a-z0-9_.]{4,30}$/.test(username)) back("/register", "err", "Tên đăng nhập 4-30 ký tự, chỉ gồm chữ thường, số, dấu . và _");
  if (!/^\S+@\S+\.\S+$/.test(email)) back("/register", "err", "Email không hợp lệ");
  if (password.length < 6) back("/register", "err", "Mật khẩu tối thiểu 6 ký tự");
  const exists = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (exists) back("/register", "err", "Tên đăng nhập hoặc email đã được sử dụng");
  const user = await prisma.user.create({
    data: {
      username,
      email,
      phone: phone || null,
      fullName: fullName || null,
      passwordHash: await bcrypt.hash(password, 10),
      apiKey: randomKey(32),
      depositCode: randomKey(6).toUpperCase(),
    },
  });
  await createSession({ id: user.id, role: user.role, username: user.username });
  redirect("/dashboard");
}

/** Đăng ký tài khoản THUỘC panel con — khách sẽ mua theo giá của panel đó */
export async function panelRegisterAction(formData: FormData) {
  const slug = String(formData.get("slug") || "");
  const panel = await prisma.childPanel.findUnique({ where: { slug } });
  if (!panel || panel.status !== "ACTIVE") back(`/cua-hang/${slug}`, "err", "Panel này đang tạm ngưng nhận khách mới");
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const page = `/cua-hang/${slug}/dang-ky`;
  if (!/^[a-z0-9_.]{4,30}$/.test(username)) back(page, "err", "Tên đăng nhập 4-30 ký tự, chỉ gồm chữ thường, số, dấu . và _");
  if (!/^\S+@\S+\.\S+$/.test(email)) back(page, "err", "Email không hợp lệ");
  if (password.length < 6) back(page, "err", "Mật khẩu tối thiểu 6 ký tự");
  const exists = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (exists) back(page, "err", "Tên đăng nhập hoặc email đã được sử dụng");
  const user = await prisma.user.create({
    data: {
      username, email, fullName: fullName || null,
      passwordHash: await bcrypt.hash(password, 10),
      apiKey: randomKey(32),
      depositCode: randomKey(6).toUpperCase(),
      panelId: panel.id,
    },
  });
  await createSession({ id: user.id, role: user.role, username: user.username });
  redirect("/dashboard");
}

export async function loginAction(formData: FormData) {
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
