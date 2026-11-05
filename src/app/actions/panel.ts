"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { notifyUser } from "@/lib/notify";
import { sendMail, smtpConfigured } from "@/lib/mailer";
import { panelAiConfig, testAiConnection } from "@/lib/ai";
import { applyBalance } from "@/lib/wallet";
import { genCode } from "@/lib/format";
import { refundSmmOrder } from "@/lib/orders";
import { orderTransition } from "@/lib/notify";

/** Actions riêng của chủ panel con — mọi thao tác đều khoá theo panel của chính
 *  người gọi (tra panel bằng ownerId, kiểm tra quyền sở hữu trên từng bản ghi). */

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}
function done(path: string, text: string): never {
  back(path, "msg", text);
}
const str = (fd: FormData, k: string) => String(fd.get(k) || "").trim();
const int = (fd: FormData, k: string) => parseInt(String(fd.get(k) || "0")) || 0;
const dtOrNull = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
function slugify(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function ownPanel(backPath: string) {
  const user = await requireUser();
  const panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  if (!panel) back(backPath, "err", "Bạn chưa có panel");
  return { user, panel: panel! };
}

/* ---------- Mã giảm giá riêng của panel ---------- */
export async function panelSaveDiscountCode(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/ma-giam-gia");
  const id = int(formData, "id");
  const code = str(formData, "code").toUpperCase().replace(/\s+/g, "");
  if (!code) back("/panel-admin/ma-giam-gia", "err", "Chưa nhập mã");
  if (id) {
    const owned = await prisma.discountCode.findFirst({ where: { id, panelId: panel.id } });
    if (!owned) back("/panel-admin/ma-giam-gia", "err", "Mã này không thuộc panel của bạn");
  }
  const data = {
    panelId: panel.id,
    code,
    type: str(formData, "type") === "FIXED" ? "FIXED" : "PERCENT",
    value: Math.max(1, int(formData, "value")),
    minOrder: Math.max(0, int(formData, "minOrder")),
    maxDiscount: Math.max(0, int(formData, "maxDiscount")),
    usageLimit: Math.max(0, int(formData, "usageLimit")),
    scope: ["ALL", "SMM", "PREMIUM"].includes(str(formData, "scope")) ? str(formData, "scope") : "ALL",
    startsAt: dtOrNull(formData, "startsAt"),
    endsAt: dtOrNull(formData, "endsAt"),
    active: formData.get("active") === "on",
  };
  try {
    if (id) await prisma.discountCode.update({ where: { id }, data });
    else await prisma.discountCode.create({ data });
  } catch {
    back("/panel-admin/ma-giam-gia", "err", `Mã "${code}" đã tồn tại trong hệ thống`);
  }
  done("/panel-admin/ma-giam-gia", id ? "Đã cập nhật mã giảm giá" : "Đã tạo mã giảm giá");
}

export async function panelDeleteDiscountCode(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/ma-giam-gia");
  await prisma.discountCode.deleteMany({ where: { id: int(formData, "id"), panelId: panel.id } });
  done("/panel-admin/ma-giam-gia", "Đã xoá mã giảm giá");
}

export async function panelToggleDiscountCode(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/ma-giam-gia");
  const row = await prisma.discountCode.findFirst({ where: { id: int(formData, "id"), panelId: panel.id } });
  if (row) await prisma.discountCode.update({ where: { id: row.id }, data: { active: !row.active } });
  done("/panel-admin/ma-giam-gia", row?.active ? "Đã tắt mã" : "Đã bật mã");
}

/* ---------- Giá riêng gói Premium của panel ---------- */
export async function setPanelPremiumPriceAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/dich-vu");
  const variantId = int(formData, "variantId");
  const raw = str(formData, "price");
  const price = Math.floor(Number(raw));
  if (!variantId) back("/panel-admin/dich-vu", "err", "Thiếu gói");
  if (!raw || !price || price <= 0) {
    await prisma.panelPremiumPrice.deleteMany({ where: { panelId: panel.id, variantId } });
    done("/panel-admin/dich-vu", "Đã bỏ giá riêng của gói — dùng giá công thức chung");
  }
  await prisma.panelPremiumPrice.upsert({
    where: { panelId_variantId: { panelId: panel.id, variantId } },
    create: { panelId: panel.id, variantId, price },
    update: { price },
  });
  done("/panel-admin/dich-vu", "Đã lưu giá riêng của gói Premium");
}

/* ---------- Thông báo tới khách của panel ---------- */
export async function panelBroadcastAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/thong-bao");
  const title = str(formData, "title").slice(0, 150);
  const body = str(formData, "body").slice(0, 500);
  if (!title || !body) back("/panel-admin/thong-bao", "err", "Nhập đủ tiêu đề và nội dung");
  const members = await prisma.user.findMany({ where: { panelId: panel.id }, select: { id: true } });
  if (!members.length) back("/panel-admin/thong-bao", "err", "Panel chưa có khách nào để gửi");
  await prisma.notification.createMany({ data: members.map((m) => ({ userId: m.id, title, body, link: `/cua-hang/${panel.slug}` })) });
  await prisma.apiLog.create({ data: { kind: "panel_broadcast", ref: `panel:${panel.id}`, detail: `${title} → ${members.length} khách` } });
  done("/panel-admin/thong-bao", `Đã gửi thông báo tới ${members.length} khách của panel`);
}

/* ---------- Bài viết của gian hàng ---------- */
export async function panelSavePost(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/bai-viet");
  const id = int(formData, "id");
  const title = str(formData, "title");
  if (!title) back("/panel-admin/bai-viet", "err", "Chưa nhập tiêu đề");
  const content = str(formData, "content");
  if (!content) back("/panel-admin/bai-viet", "err", "Chưa nhập nội dung");
  if (id) {
    const owned = await prisma.post.findFirst({ where: { id, panelId: panel.id } });
    if (!owned) back("/panel-admin/bai-viet", "err", "Bài viết không thuộc panel của bạn");
  }
  const data = {
    panelId: panel.id,
    title,
    slug: str(formData, "slug") || slugify(title),
    excerpt: str(formData, "excerpt") || null,
    content,
    coverUrl: str(formData, "coverUrl") || null,
    categoryId: int(formData, "categoryId") || null,
    published: formData.get("published") === "on",
  };
  try {
    if (id) await prisma.post.update({ where: { id }, data });
    else await prisma.post.create({ data });
  } catch {
    back("/panel-admin/bai-viet", "err", "Slug bài viết đã tồn tại — hãy đặt slug khác");
  }
  done("/panel-admin/bai-viet", id ? "Đã cập nhật bài viết" : "Đã tạo bài viết");
}

export async function panelDeletePost(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/bai-viet");
  await prisma.post.deleteMany({ where: { id: int(formData, "id"), panelId: panel.id } });
  done("/panel-admin/bai-viet", "Đã xoá bài viết");
}

export async function panelTogglePost(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/bai-viet");
  const row = await prisma.post.findFirst({ where: { id: int(formData, "id"), panelId: panel.id } });
  if (row) await prisma.post.update({ where: { id: row.id }, data: { published: !row.published } });
  done("/panel-admin/bai-viet", row?.published ? "Đã ẩn bài viết" : "Đã đăng bài viết");
}

/* ---------- Hỗ trợ: ticket của khách panel ---------- */
async function ownPanelTicket(panelId: number, ticketId: number) {
  return prisma.ticket.findFirst({ where: { id: ticketId, user: { panelId } }, include: { user: { select: { id: true, username: true } } } });
}

export async function panelReplyTicket(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/ho-tro");
  const ticketId = int(formData, "ticketId");
  const ticket = await ownPanelTicket(panel.id, ticketId);
  if (!ticket) back("/panel-admin/ho-tro", "err", "Ticket này không thuộc khách của panel bạn");
  const body = str(formData, "body");
  const close = formData.get("close") === "on";
  if (body) await prisma.ticketMessage.create({ data: { ticketId, body, fromAdmin: true } });
  await prisma.ticket.update({ where: { id: ticketId }, data: { status: close ? "CLOSED" : "ANSWERED" } });
  if (body) await notifyUser(ticket.user.id, "Ticket của bạn có phản hồi mới", `"${ticket.subject}" — chủ gian hàng đã trả lời.`, `/dashboard/ho-tro/${ticketId}`);
  done(`/panel-admin/ho-tro/${ticketId}`, close ? "Đã trả lời và đóng ticket" : "Đã gửi phản hồi");
}

export async function panelToggleTicket(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/ho-tro");
  const ticketId = int(formData, "ticketId");
  const ticket = await ownPanelTicket(panel.id, ticketId);
  if (!ticket) back("/panel-admin/ho-tro", "err", "Ticket này không thuộc khách của panel bạn");
  await prisma.ticket.update({ where: { id: ticketId }, data: { status: ticket.status === "CLOSED" ? "OPEN" : "CLOSED" } });
  done("/panel-admin/ho-tro", ticket.status === "CLOSED" ? "Đã mở lại ticket" : "Đã đóng ticket");
}

/* ---------- Email marketing tới khách panel ---------- */
export async function panelSendMarketingEmail(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/email-marketing");
  const subject = str(formData, "subject").slice(0, 200);
  const body = str(formData, "body");
  const segment = str(formData, "segment");
  if (!subject || !body) back("/panel-admin/email-marketing", "err", "Nhập đủ tiêu đề và nội dung email");
  const panelSmtp = panel.smtpHost && panel.smtpUser && panel.smtpFrom
    ? { host: panel.smtpHost, port: panel.smtpPort, user: panel.smtpUser, pass: panel.smtpPass, from: panel.smtpFrom, secure: panel.smtpSecure }
    : null;
  if (!panelSmtp && !(await smtpConfigured())) back("/panel-admin/email-marketing", "err", "Chưa cấu hình thư: hãy điền SMTP riêng của panel ở Cấu hình, hoặc nhờ admin web chính cấu hình ở Cấu hình → Email");
  const where: any = { panelId: panel.id, email: { not: "" } };
  if (segment === "deposited") where.deposits = { some: { status: "APPROVED" } };
  if (segment === "ordered") where.smmOrders = { some: { panelId: panel.id } };
  const members = await prisma.user.findMany({ where, select: { email: true }, take: 5000 });
  const emails = Array.from(new Set(members.map((m) => m.email).filter(Boolean)));
  if (!emails.length) back("/panel-admin/email-marketing", "err", "Không có khách nào khớp nhóm đã chọn");
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b"><h2 style="font-size:20px">${subject}</h2><div style="white-space:pre-wrap;line-height:1.6">${body.replace(/</g, "&lt;")}</div><p style="color:#94a3b8;font-size:12px;margin-top:24px">Email từ gian hàng ${panel.name}</p></div>`;
  const sent = await sendMail(emails, subject, html, panelSmtp);
  await prisma.apiLog.create({ data: { kind: "panel_email", ref: `panel:${panel.id}`, detail: `${subject} → ${sent} khách (nhóm: ${segment || "all"})` } });
  done("/panel-admin/email-marketing", `Đã gửi email tới ${sent} khách của panel`);
}

/* ---------- Setup % hoa hồng của chủ panel ---------- */
export async function panelSetCommissionAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/hoa-hong");
  const pct = Math.max(0, Math.min(200, int(formData, "commission")));
  await prisma.childPanel.update({ where: { id: panel.id }, data: { markup: pct } });
  done("/panel-admin/hoa-hong", `Đã đặt tỉ lệ hoa hồng ${pct}% — giá bán tại gian hàng = giá web mẹ + ${pct}%`);
}

/* ---------- AI riêng của panel (key do chủ panel tự thêm) ---------- */
export async function panelSaveAiAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/ai");
  const rawKey = str(formData, "aiApiKey");
  const data: any = {
    aiEnabled: formData.get("aiEnabled") === "on",
    aiProvider: str(formData, "aiProvider") === "gemini" ? "gemini" : "openai",
    aiBaseUrl: str(formData, "aiBaseUrl") || null,
    aiModel: str(formData, "aiModel") || null,
  };
  // Để trống ô key = giữ key đã lưu; nhập mới thì thay
  if (rawKey && !rawKey.includes("•")) data.aiApiKey = rawKey;
  await prisma.childPanel.update({ where: { id: panel.id }, data });
  done("/panel-admin/ai", "Đã lưu cấu hình AI của panel");
}

export async function panelClearAiKeyAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/ai");
  void formData;
  await prisma.childPanel.update({ where: { id: panel.id }, data: { aiApiKey: null, aiEnabled: false } });
  done("/panel-admin/ai", "Đã xoá key AI của panel — livechat quay về AI hệ thống");
}

export async function panelTestAiAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/ai");
  void formData;
  const cfg = panelAiConfig(panel);
  if (!cfg) back("/panel-admin/ai", "err", "Panel chưa bật AI hoặc chưa lưu key — hãy lưu cấu hình trước khi kiểm tra");
  try {
    const reply = await testAiConnection(cfg!);
    done("/panel-admin/ai", `Kết nối AI thành công — phản hồi: ${reply}`);
  } catch (e: any) {
    back("/panel-admin/ai", "err", `Kết nối AI thất bại: ${String(e?.message || e).slice(0, 160)}`);
  }
}

/* ---------- Thêm dịch vụ cho panel — nguồn lấy từ dịch vụ có sẵn của web mẹ ---------- */
export async function panelSaveOwnService(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/dich-vu");
  const id = int(formData, "id");
  const name = str(formData, "name");
  if (!name) back("/panel-admin/dich-vu", "err", "Chưa nhập tên dịch vụ");
  const rate = Math.max(1, int(formData, "rate"));
  const min = Math.max(1, int(formData, "min") || 1);
  const base = {
    name,
    rate,
    min,
    max: Math.max(min, int(formData, "max") || 100000),
    description: str(formData, "description") || null,
    active: formData.get("active") === "on",
  };
  if (id) {
    // Sửa: giữ nguyên nguồn đã nối, chỉ đổi thông tin bán
    const owned = await prisma.smmService.findFirst({ where: { id, panelId: panel.id } });
    if (!owned) back("/panel-admin/dich-vu", "err", "Dịch vụ không thuộc panel của bạn");
    await prisma.smmService.update({ where: { id }, data: base as any });
    done("/panel-admin/dich-vu", "Đã cập nhật dịch vụ");
  }
  // Thêm mới: nguồn là một dịch vụ có sẵn của web mẹ (nối đúng nguồn đó), hoặc thủ công tự xử lý
  const sourceId = int(formData, "sourceServiceId");
  let data: any = { ...base, panelId: panel.id };
  if (sourceId) {
    const src = await prisma.smmService.findFirst({ where: { id: sourceId, panelId: null, active: true } });
    if (!src) back("/panel-admin/dich-vu", "err", "Dịch vụ nguồn không còn trên web mẹ");
    data = {
      ...data,
      categoryId: src.categoryId,
      fulfillment: src.fulfillment,
      providerId: src.providerId,
      providerServiceId: src.providerServiceId,
      costRate: src.rate, // giá tính cho panel = giá bán chuẩn của web mẹ; chủ panel hưởng phần chênh
    };
  } else {
    const categoryId = int(formData, "categoryId");
    if (!categoryId) back("/panel-admin/dich-vu", "err", "Chưa chọn danh mục");
    data = { ...data, categoryId, fulfillment: "MANUAL", providerId: null, providerServiceId: null, costRate: 0 };
  }
  await prisma.smmService.create({ data });
  done("/panel-admin/dich-vu", "Đã thêm dịch vụ vào gian hàng");
}

export async function panelDeleteOwnService(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/dich-vu");
  const id = int(formData, "id");
  const used = await prisma.smmOrder.count({ where: { serviceId: id } });
  if (used > 0) back("/panel-admin/dich-vu", "err", "Dịch vụ đã có đơn — hãy tắt bán thay vì xoá");
  await prisma.smmService.deleteMany({ where: { id, panelId: panel.id } });
  done("/panel-admin/dich-vu", "Đã xoá dịch vụ");
}

export async function panelToggleOwnService(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/dich-vu");
  const row = await prisma.smmService.findFirst({ where: { id: int(formData, "id"), panelId: panel.id } });
  if (row) await prisma.smmService.update({ where: { id: row.id }, data: { active: !row.active } });
  done("/panel-admin/dich-vu", row?.active ? "Đã tắt bán dịch vụ" : "Đã mở bán dịch vụ");
}

/* ---------- Xử lý đơn dịch vụ riêng (chủ panel tự giao) ---------- */
export async function panelOwnOrderAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/don-hang");
  const orderId = int(formData, "orderId");
  const kind = str(formData, "kind");
  const order = await prisma.smmOrder.findFirst({ where: { id: orderId, panelId: panel.id, service: { panelId: panel.id } } });
  if (order && kind !== "cancel" && order.fulfillment !== "MANUAL") back("/panel-admin/don-hang", "err", "Đơn này chạy qua nguồn API — hệ thống tự xử lý, chủ panel chỉ huỷ được");
  if (!order) back("/panel-admin/don-hang", "err", "Đơn này không phải đơn dịch vụ riêng của panel bạn");
  if (kind === "start") {
    if (order.status !== "PENDING") back("/panel-admin/don-hang", "err", "Đơn không còn ở trạng thái chờ");
    await prisma.smmOrder.update({ where: { id: orderId }, data: { status: "IN_PROGRESS" } });
    await orderTransition({ id: order.id, userId: order.userId, code: order.code }, "IN_PROGRESS", "Chủ gian hàng đã bắt đầu xử lý");
    done("/panel-admin/don-hang", `Đã bắt đầu xử lý đơn ${order.code}`);
  }
  if (kind === "complete") {
    if (order.status !== "PENDING" && order.status !== "IN_PROGRESS") back("/panel-admin/don-hang", "err", "Đơn không ở trạng thái có thể hoàn thành");
    await prisma.smmOrder.update({ where: { id: orderId }, data: { status: "COMPLETED", remains: 0 } });
    await orderTransition({ id: order.id, userId: order.userId, code: order.code }, "COMPLETED", "Chủ gian hàng đã giao xong");
    done("/panel-admin/don-hang", `Đã hoàn thành đơn ${order.code}`);
  }
  if (kind === "cancel") {
    if (order.status === "COMPLETED" || order.status === "REFUNDED" || order.status === "CANCELED") back("/panel-admin/don-hang", "err", "Đơn đã kết thúc");
    await refundSmmOrder(orderId, order.charge, "Chủ gian hàng huỷ đơn — hoàn tiền");
    done("/panel-admin/don-hang", `Đã huỷ và hoàn tiền đơn ${order.code}`);
  }
  back("/panel-admin/don-hang", "err", "Thao tác không hợp lệ");
}

/* ---------- Nạp tiền của khách panel: duyệt / từ chối / cộng tay ---------- */
export async function panelDepositAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/nap-tien");
  const id = int(formData, "id");
  const kind = str(formData, "kind");
  const dep = await prisma.deposit.findFirst({ where: { id, user: { panelId: panel.id } } });
  if (!dep || dep.status !== "PENDING") back("/panel-admin/nap-tien", "err", "Yêu cầu nạp không còn chờ duyệt");
  if (kind === "reject") {
    await prisma.deposit.update({ where: { id }, data: { status: "REJECTED", adminNote: str(formData, "adminNote") || null } });
    await notifyUser(dep.userId, "Yêu cầu nạp tiền bị từ chối", `Yêu cầu ${dep.code} (${dep.amount.toLocaleString("vi-VN")}đ) đã bị chủ gian hàng từ chối.`, "/dashboard/nap-tien");
    done("/panel-admin/nap-tien", "Đã từ chối yêu cầu nạp");
  }
  await prisma.$transaction(async (tx) => {
    await tx.deposit.update({ where: { id }, data: { status: "APPROVED" } });
    await applyBalance(tx, dep.userId, dep.amount, "DEPOSIT", dep.code, "Chủ gian hàng duyệt nạp tiền");
    if (dep.bonus > 0) await applyBalance(tx, dep.userId, dep.bonus, "BONUS", dep.code, "Thưởng nạp tiền");
  });
  await notifyUser(dep.userId, "Nạp tiền thành công", `Yêu cầu ${dep.code} đã được duyệt: +${dep.amount.toLocaleString("vi-VN")}đ vào số dư.`, "/dashboard/nap-tien");
  done("/panel-admin/nap-tien", `Đã cộng ${dep.amount.toLocaleString("vi-VN")}đ cho khách`);
}

export async function panelManualDepositAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/nap-tien");
  const memberId = int(formData, "memberId");
  const amount = int(formData, "amount");
  if (!memberId || amount <= 0) back("/panel-admin/nap-tien", "err", "Chọn khách và số tiền hợp lệ");
  const member = await prisma.user.findFirst({ where: { id: memberId, panelId: panel.id }, select: { id: true, username: true } });
  if (!member) back("/panel-admin/nap-tien", "err", "Khách này không thuộc panel của bạn");
  const dep = await prisma.deposit.create({ data: { code: "TMP", userId: member.id, method: "BANK", amount, status: "APPROVED", content: `Chủ gian hàng ${panel.name} cộng tay` } });
  const code = genCode("NAP", dep.id);
  await prisma.$transaction(async (tx) => {
    await tx.deposit.update({ where: { id: dep.id }, data: { code } });
    await applyBalance(tx, member.id, amount, "DEPOSIT", code, "Chủ gian hàng cộng tiền tay");
  });
  await notifyUser(member.id, "Số dư đã được cộng", `Chủ gian hàng vừa cộng ${amount.toLocaleString("vi-VN")}đ vào tài khoản của bạn.`, "/dashboard/nap-tien");
  done("/panel-admin/nap-tien", `Đã cộng ${amount.toLocaleString("vi-VN")}đ cho ${member.username}`);
}

/* ---------- Công tắc bán hàng của panel: bán mảng nào bật mảng đó ---------- */
export async function panelSaveSellAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/cai-dat");
  const sellSmm = formData.get("sellSmm") === "on";
  const sellPremium = formData.get("sellPremium") === "on";
  await prisma.childPanel.update({ where: { id: panel.id }, data: { sellSmm, sellPremium } });
  done("/panel-admin/cai-dat", `Đã lưu mảng đang bán: SMM ${sellSmm ? "BẬT" : "TẮT"} · Premium ${sellPremium ? "BẬT" : "TẮT"}`);
}

/* ---------- Cấu hình riêng của panel ---------- */
export async function panelSaveConfigAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/cau-hinh");
  const section = str(formData, "section");
  const keep = (v: string, old: string | null) => (v.includes("•") ? old : v || null);
  if (section === "bank") {
    await prisma.childPanel.update({ where: { id: panel.id }, data: { bankName: str(formData, "bankName") || null, bankAccount: str(formData, "bankAccount") || null, bankHolder: str(formData, "bankHolder") || null } });
    done("/panel-admin/cau-hinh", "Đã lưu tài khoản ngân hàng của panel");
  }
  if (section === "usdt") {
    await prisma.childPanel.update({ where: { id: panel.id }, data: { usdtAddress: str(formData, "usdtAddress") || null, usdtNetwork: str(formData, "usdtNetwork") || null, usdtRate: int(formData, "usdtRate") || null } });
    done("/panel-admin/cau-hinh", "Đã lưu ví USDT của panel");
  }
  if (section === "smtp") {
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: {
        smtpHost: str(formData, "smtpHost") || null, smtpPort: str(formData, "smtpPort") || null,
        smtpUser: str(formData, "smtpUser") || null, smtpPass: keep(str(formData, "smtpPass"), panel.smtpPass),
        smtpFrom: str(formData, "smtpFrom") || null, smtpSecure: formData.get("smtpSecure") === "on",
      },
    });
    done("/panel-admin/cau-hinh", "Đã lưu cấu hình thư (SMTP) của panel");
  }
  if (section === "telegram") {
    await prisma.childPanel.update({ where: { id: panel.id }, data: { telegramBotToken: keep(str(formData, "telegramBotToken"), panel.telegramBotToken), telegramChatId: str(formData, "telegramChatId") || null } });
    done("/panel-admin/cau-hinh", "Đã lưu Telegram báo đơn của panel");
  }
  if (section === "google") {
    await prisma.childPanel.update({ where: { id: panel.id }, data: { googleClientId: str(formData, "googleClientId") || null, googleClientSecret: keep(str(formData, "googleClientSecret"), panel.googleClientSecret) } });
    done("/panel-admin/cau-hinh", "Đã lưu Google đăng nhập của panel");
  }
  back("/panel-admin/cau-hinh", "err", "Mục cấu hình không hợp lệ");
}
