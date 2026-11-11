"use server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { passwordError } from "@/lib/security";
import { randomKey } from "@/lib/format";
import { recordLoginEvent } from "@/lib/login-events";
import { clientIp } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/* THIẾT LẬP LẦN ĐẦU (lệnh Tín 2026-11-11): tạo tài khoản QUẢN TRỊ ĐẦU TIÊN
   cho bản cài mới — thay cho mọi tài khoản mẫu/mặc định. Chỉ chạy được khi
   bảng users đang trống: kiểm tra lại TRONG transaction có khoá advisory của
   PostgreSQL nên hai lượt gửi đồng thời cũng chỉ một lượt tạo được admin,
   lượt sau bị từ chối. Validation bám đúng luật của đăng ký (lib/security). */
function back(err: string): never {
  redirect(`/setup?err=${encodeURIComponent(err)}`);
}

export async function setupAction(formData: FormData) {
  const siteName = String(formData.get("siteName") || "").trim();
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  const s = await getSettings();
  if (s.setup_completed === "1") back("Hệ thống đã được thiết lập, trang này không còn khả dụng");
  if (!siteName) back("Tên website không được để trống");
  if (siteName.length > 80) back("Tên website quá dài (tối đa 80 ký tự)");
  if (!/^[a-z0-9_.]{4,30}$/.test(username)) back("Tên đăng nhập 4-30 ký tự, chỉ gồm chữ thường, số, dấu . và _");
  if (!/^\S+@\S+\.\S+$/.test(email)) back("Email không hợp lệ");
  const pwErr = passwordError(password, s);
  if (pwErr) back(pwErr);
  if (password !== confirmPassword) back("Mật khẩu nhập lại không khớp, vui lòng kiểm tra lại.");

  const passwordHash = await hashPassword(password);
  const created = await prisma.$transaction(async (tx) => {
    // Khoá ghi độc quyền cho riêng thao tác setup: hai request đồng thời xếp
    // hàng tại đây, request sau thấy users đã có người -> trả null -> bị từ chối.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261111)`;
    if ((await tx.user.count()) > 0) return null;
    const user = await tx.user.create({
      data: {
        username,
        email,
        fullName: "Quản trị viên",
        passwordHash,
        role: "ADMIN",
        level: "VIP",
        apiKey: randomKey(32),
        depositCode: randomKey(6).toUpperCase(),
        refCode: randomKey(8).toUpperCase(),
        lastLoginAt: new Date(),
      },
    });
    await tx.setting.upsert({ where: { key: "site_name" }, create: { key: "site_name", value: siteName }, update: { value: siteName } });
    await tx.setting.upsert({ where: { key: "setup_completed" }, create: { key: "setup_completed", value: "1" }, update: { value: "1" } });
    return user;
  });
  if (!created) back("Hệ thống đã được thiết lập, trang này không còn khả dụng");

  // Đăng nhập ngay bằng đúng cơ chế phiên của đăng nhập thường (admin mới chưa
  // bật 2FA nên không qua cookie chờ 2FA; việc bắt buộc bật 2FA khi vào khu
  // quản trị do enforceAdminSecurity xử lý y như lần đăng nhập đầu của admin
  // chưa enrol — xem lib/auth.ts).
  await recordLoginEvent({ userId: created.id, username, ip: clientIp(headers()), userAgent: headers().get("user-agent") || "", success: true, reason: "Thiết lập lần đầu — tạo tài khoản quản trị" }).catch(() => {});
  await createSession({ id: created.id, role: created.role, username: created.username });
  redirect("/admin");
}
