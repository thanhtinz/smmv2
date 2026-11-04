"use server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createSmmOrder, createPremiumOrder } from "@/lib/orders";
import { getSettings, calcBonus } from "@/lib/settings";
import { randomKey, genCode } from "@/lib/format";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

export async function placeSmmOrderAction(formData: FormData) {
  const user = await requireUser();
  const serviceId = parseInt(String(formData.get("serviceId") || "0"));
  const link = String(formData.get("link") || "");
  const quantity = parseInt(String(formData.get("quantity") || "0"));
  const note = String(formData.get("note") || "") || undefined;
  const extra: Record<string, any> = {};
  const comments = String(formData.get("comments") || "").trim();
  const reaction = String(formData.get("reaction") || "").trim();
  const minutes = parseInt(String(formData.get("minutes") || "0"));
  if (comments) extra.comments = comments;
  if (reaction) extra.reaction = reaction;
  if (minutes > 0) extra.minutes = minutes;
  try {
    const fresh = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    const order = await createSmmOrder({ user: fresh, serviceId, link, quantity, note, extra });
    back("/dashboard/don-hang", "msg", `Đặt đơn ${order.code} thành công — trạng thái: ${order.status === "REFUNDED" ? "provider từ chối, đã hoàn tiền" : "đang xử lý"}`);
  } catch (e: any) {
    back("/dashboard/dat-hang", "err", String(e?.message || "Đặt đơn thất bại"));
  }
}

export async function buyPremiumAction(formData: FormData) {
  const user = await requireUser();
  const variantId = parseInt(String(formData.get("variantId") || "0"));
  const quantity = parseInt(String(formData.get("quantity") || "1"));
  const buyerInfo = String(formData.get("buyerInfo") || "") || undefined;
  const slug = String(formData.get("slug") || "");
  try {
    const fresh = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    const order = await createPremiumOrder({ user: fresh, variantId, quantity, buyerInfo });
    back(
      "/dashboard/don-premium",
      "msg",
      order.status === "DELIVERED"
        ? `Mua ${order.code} thành công — tài khoản đã giao ngay trong chi tiết đơn.`
        : `Đặt ${order.code} thành công — admin sẽ giao trong thời gian sớm nhất.`
    );
  } catch (e: any) {
    back(slug ? `/premium/${slug}` : "/premium", "err", String(e?.message || "Mua thất bại"));
  }
}

export async function createDepositAction(formData: FormData) {
  const user = await requireUser();
  const amount = parseInt(String(formData.get("amount") || "0"));
  const method = String(formData.get("method") || "BANK") as any;
  const settings = await getSettings();
  const min = parseInt(settings.deposit_min || "10000");
  if (!amount || amount < min) back("/dashboard/nap-tien", "err", `Số tiền nạp tối thiểu là ${min.toLocaleString("vi-VN")}đ`);
  const bonus = calcBonus(amount, settings.deposit_bonus_tiers);
  const dep = await prisma.deposit.create({
    data: { code: "TMP", userId: user.id, method, amount, bonus, status: "PENDING", content: `SMM ${user.depositCode}` },
  });
  await prisma.deposit.update({ where: { id: dep.id }, data: { code: genCode("NAP", dep.id) } });
  back(
    "/dashboard/nap-tien",
    "msg",
    method === "BANK"
      ? "Đã ghi nhận. Nếu bạn chuyển khoản đúng nội dung, tiền sẽ được cộng tự động (hoặc admin duyệt trong ít phút)."
      : "Đã tạo yêu cầu nạp. Admin sẽ kiểm tra và cộng tiền trong ít phút."
  );
}

export async function createTicketAction(formData: FormData) {
  const user = await requireUser();
  const subject = String(formData.get("subject") || "").trim();
  const category = String(formData.get("category") || "other");
  const body = String(formData.get("body") || "").trim();
  if (!subject || !body) back("/dashboard/ticket", "err", "Nhập đủ tiêu đề và nội dung");
  const t = await prisma.ticket.create({
    data: { userId: user.id, subject, category, messages: { create: { body } } },
  });
  redirect(`/dashboard/ticket/${t.id}`);
}

export async function replyTicketAction(formData: FormData) {
  const user = await requireUser();
  const ticketId = parseInt(String(formData.get("ticketId") || "0"));
  const body = String(formData.get("body") || "").trim();
  const t = await prisma.ticket.findFirst({ where: { id: ticketId, userId: user.id } });
  if (!t || !body) redirect("/dashboard/ticket");
  await prisma.ticketMessage.create({ data: { ticketId, body } });
  await prisma.ticket.update({ where: { id: ticketId }, data: { status: "OPEN" } });
  revalidatePath(`/dashboard/ticket/${ticketId}`);
  redirect(`/dashboard/ticket/${ticketId}`);
}

export async function regenApiKeyAction() {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { apiKey: randomKey(32) } });
  back("/dashboard/api", "msg", "Đã tạo API key mới. Key cũ đã bị vô hiệu ngay lập tức.");
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      fullName: String(formData.get("fullName") || "").trim() || null,
      phone: String(formData.get("phone") || "").trim() || null,
    },
  });
  back("/dashboard/ho-so", "msg", "Đã cập nhật hồ sơ");
}

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  const old = String(formData.get("oldPassword") || "");
  const next = String(formData.get("newPassword") || "");
  if (next.length < 6) back("/dashboard/ho-so", "err", "Mật khẩu mới tối thiểu 6 ký tự");
  const fresh = (await prisma.user.findUnique({ where: { id: user.id } }))!;
  if (!(await bcrypt.compare(old, fresh.passwordHash))) back("/dashboard/ho-so", "err", "Mật khẩu hiện tại không đúng");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  back("/dashboard/ho-so", "msg", "Đã đổi mật khẩu");
}

export async function warrantyAction(formData: FormData) {
  const user = await requireUser();
  const orderId = parseInt(String(formData.get("orderId") || "0"));
  const note = String(formData.get("note") || "").trim();
  const o = await prisma.premiumOrder.findFirst({ where: { id: orderId, userId: user.id } });
  if (!o) redirect("/dashboard/don-premium");
  await prisma.premiumOrder.update({
    where: { id: orderId },
    data: { status: "WARRANTY", adminNote: `[Bảo hành] ${note || "Khách yêu cầu bảo hành"} (${new Date().toLocaleString("vi-VN")})` },
  });
  back("/dashboard/don-premium", "msg", `Đã gửi yêu cầu bảo hành cho đơn ${o.code}`);
}
