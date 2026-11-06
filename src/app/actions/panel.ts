"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { notifyUser } from "@/lib/notify";
import { sendMail, smtpConfigured } from "@/lib/mailer";
import { panelAiConfig, testAiConnection } from "@/lib/ai";
import { applyBalance, clawbackReferralCommission } from "@/lib/wallet";
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
  const { getPanelAccess } = await import("@/lib/panel-access");
  const acc = await getPanelAccess(user.id);
  if (!acc) back(backPath, "err", "Bạn chưa có panel");
  return { user, panel: acc!.panel, isOwner: acc!.isOwner };
}

/** Như ownPanel nhưng chỉ CHỦ panel mới qua được — nhân viên panel bị chặn
 *  ở mọi thao tác giá / tiền / cấu hình / nhân sự (phân quyền 2 tầng như web mẹ). */
async function ownPanelOwner(backPath: string) {
  const r = await ownPanel(backPath);
  if (!r.isOwner) back("/panel-admin", "err", "Chỉ chủ panel mới làm được thao tác này — tài khoản của bạn là Nhân viên panel");
  return r;
}

/* ---------- Mã giảm giá riêng của panel ---------- */
export async function panelSaveDiscountCode(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/ma-giam-gia");
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
  const { panel } = await ownPanelOwner("/panel-admin/ma-giam-gia");
  await prisma.discountCode.deleteMany({ where: { id: int(formData, "id"), panelId: panel.id } });
  done("/panel-admin/ma-giam-gia", "Đã xoá mã giảm giá");
}

export async function panelToggleDiscountCode(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/ma-giam-gia");
  const row = await prisma.discountCode.findFirst({ where: { id: int(formData, "id"), panelId: panel.id } });
  if (row) await prisma.discountCode.update({ where: { id: row.id }, data: { active: !row.active } });
  done("/panel-admin/ma-giam-gia", row?.active ? "Đã tắt mã" : "Đã bật mã");
}

/* ---------- Giá riêng gói Premium của panel ---------- */
export async function setPanelPremiumPriceAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/dich-vu");
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
  const { panel } = await ownPanelOwner("/panel-admin/thong-bao");
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
  const { panel } = await ownPanelOwner("/panel-admin/bai-viet");
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
  const { panel } = await ownPanelOwner("/panel-admin/bai-viet");
  await prisma.post.deleteMany({ where: { id: int(formData, "id"), panelId: panel.id } });
  done("/panel-admin/bai-viet", "Đã xoá bài viết");
}

export async function panelTogglePost(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/bai-viet");
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
  const { panel } = await ownPanelOwner("/panel-admin/email-marketing");
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
  const { panel } = await ownPanelOwner("/panel-admin/hoa-hong");
  const pct = Math.max(0, Math.min(200, int(formData, "commission")));
  await prisma.childPanel.update({ where: { id: panel.id }, data: { markup: pct } });
  done("/panel-admin/hoa-hong", `Đã đặt tỉ lệ hoa hồng ${pct}% — giá bán tại gian hàng = giá web mẹ + ${pct}%`);
}

/* ---------- AI riêng của panel (key do chủ panel tự thêm) ---------- */
export async function panelSaveAiAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/ai");
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
  const { panel } = await ownPanelOwner("/panel-admin/ai");
  void formData;
  await prisma.childPanel.update({ where: { id: panel.id }, data: { aiApiKey: null, aiEnabled: false } });
  done("/panel-admin/ai", "Đã xoá key AI của panel — livechat quay về AI hệ thống");
}

export async function panelTestAiAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/ai");
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
  const { panel } = await ownPanelOwner("/panel-admin/dich-vu");
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
    notice: str(formData, "notice") || null,
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
  const { panel } = await ownPanelOwner("/panel-admin/dich-vu");
  const id = int(formData, "id");
  const used = await prisma.smmOrder.count({ where: { serviceId: id } });
  if (used > 0) back("/panel-admin/dich-vu", "err", "Dịch vụ đã có đơn — hãy tắt bán thay vì xoá");
  await prisma.smmService.deleteMany({ where: { id, panelId: panel.id } });
  done("/panel-admin/dich-vu", "Đã xoá dịch vụ");
}

export async function panelToggleOwnService(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/dich-vu");
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
  const { panel } = await ownPanelOwner("/panel-admin/nap-tien");
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
  const { panel } = await ownPanelOwner("/panel-admin/nap-tien");
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
  const { panel } = await ownPanelOwner("/panel-admin/mo-dun");
  const sellSmm = formData.get("sellSmm") === "on";
  const sellPremium = formData.get("sellPremium") === "on";
  await prisma.childPanel.update({ where: { id: panel.id }, data: { sellSmm, sellPremium } });
  done("/panel-admin/mo-dun", `Đã lưu mảng đang bán: SMM ${sellSmm ? "BẬT" : "TẮT"} · Premium ${sellPremium ? "BẬT" : "TẮT"}`);
}

/* ---------- Chính sách nạp RIÊNG của panel: mốc thưởng + nạp tối thiểu ---------- */
export async function panelSaveDepositSettingsAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/nap-tien");
  const tiers: { from: number; percent: number }[] = [];
  for (let i = 1; i <= 3; i++) {
    const from = int(formData, `tierFrom${i}`);
    const percent = int(formData, `tierPct${i}`);
    if (from > 0 && percent > 0) tiers.push({ from, percent: Math.min(100, percent) });
  }
  tiers.sort((a, b) => a.from - b.from);
  const depositMin = int(formData, "depositMin");
  await prisma.childPanel.update({
    where: { id: panel.id },
    data: { depositBonusTiers: tiers.length ? JSON.stringify(tiers) : null, depositMin: depositMin > 0 ? depositMin : null },
  });
  done("/panel-admin/nap-tien", tiers.length ? `Đã lưu chính sách nạp riêng: ${tiers.length} mốc thưởng${depositMin > 0 ? ` · tối thiểu ${depositMin.toLocaleString("vi-VN")}đ` : ""}` : "Đã xoá mốc thưởng — khách của panel hiện không có thưởng nạp (không dùng mốc của web mẹ)");
}

/* ---------- Widget Liên hệ của panel (đồng bộ với web mẹ, phạm vi của panel) ---------- */
export async function panelSaveContactWidgetAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/lien-he");
  const id = parseInt(String(formData.get("id") || "0")) || 0;
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const link = String(formData.get("link") || "").trim().slice(0, 500);
  const imageRaw = String(formData.get("image") || "");
  const image = imageRaw.startsWith("data:image/") && imageRaw.length < 14_000_000 ? imageRaw : null;
  const active = formData.get("active") === "on";
  if (!name) done("/panel-admin/lien-he", "Tên hiển thị không được trống");
  if (id) {
    const old = await prisma.contactWidget.findFirst({ where: { id, panelId: panel.id } });
    if (!old) done("/panel-admin/lien-he", "Không tìm thấy liên hệ");
    await prisma.contactWidget.update({ where: { id }, data: { name, link, active, image: formData.get("image") === "" ? null : image ?? old!.image } });
  } else {
    const last = await prisma.contactWidget.findFirst({ where: { panelId: panel.id }, orderBy: { sort: "desc" } });
    await prisma.contactWidget.create({ data: { panelId: panel.id, name, link, image, active, sort: (last?.sort ?? 0) + 1 } });
  }
  done("/panel-admin/lien-he", id ? "Đã sửa liên hệ" : "Đã thêm liên hệ");
}
export async function panelDeleteContactWidgetAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/lien-he");
  await prisma.contactWidget.deleteMany({ where: { id: parseInt(String(formData.get("id") || "0")) || 0, panelId: panel.id } });
  done("/panel-admin/lien-he", "Đã xoá liên hệ");
}
export async function panelToggleContactWidgetAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/lien-he");
  const w = await prisma.contactWidget.findFirst({ where: { id: parseInt(String(formData.get("id") || "0")) || 0, panelId: panel.id } });
  if (w) await prisma.contactWidget.update({ where: { id: w.id }, data: { active: !w.active } });
  done("/panel-admin/lien-he", "Đã lưu trạng thái liên hệ");
}
export async function panelSeedContactWidgetsAction() {
  const { panel } = await ownPanelOwner("/panel-admin/lien-he");
  const legacy: [string, string | null][] = [["Zalo", panel.supportZalo], ["Telegram", panel.supportTelegram], ["Facebook", panel.supportFacebook], ["Hotline", panel.supportHotline]];
  let n = 0;
  for (const [name, value] of legacy) {
    if (value && value.trim()) { await prisma.contactWidget.create({ data: { panelId: panel.id, name, link: value.trim(), sort: ++n } }); }
  }
  done("/panel-admin/lien-he", n ? `Đã đưa ${n} kênh cũ vào danh sách widget` : "Không có kênh cũ nào để đưa vào");
}

/* ---------- Cấu hình riêng của panel ---------- */
export async function panelSaveConfigAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/cau-hinh");
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
  if (section === "paypal") {
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: {
        paypalEnabled: formData.get("paypalEnabled") === "on",
        paypalClientId: str(formData, "paypalClientId") || null,
        paypalSecret: keep(str(formData, "paypalSecret"), panel.paypalSecret),
        paypalMode: str(formData, "paypalMode") === "live" ? "live" : "sandbox",
      },
    });
    done("/panel-admin/cau-hinh", "Đã lưu PayPal của panel — khách của bạn nạp PayPal sẽ trả vào tài khoản này");
  }
  if (section === "sepay") {
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: {
        sepayEnabled: formData.get("sepayEnabled") === "on",
        sepaySecret: keep(str(formData, "sepaySecret"), panel.sepaySecret),
      },
    });
    done("/panel-admin/cau-hinh", "Đã lưu SePay của panel — từ giờ khách nạp ngân hàng vào tài khoản của bạn sẽ được cộng TỰ ĐỘNG, không cần duyệt tay");
  }
  if (section === "stripe") {
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: {
        stripeEnabled: formData.get("stripeEnabled") === "on",
        stripeSecretKey: keep(str(formData, "stripeSecretKey"), panel.stripeSecretKey),
        stripeWebhookSecret: keep(str(formData, "stripeWebhookSecret"), panel.stripeWebhookSecret),
      },
    });
    done("/panel-admin/cau-hinh", "Đã lưu Stripe của panel — khách của bạn nạp Stripe sẽ trả vào tài khoản này");
  }
  if (section === "panelfee") {
    const fee = Math.max(0, int(formData, "panelFee"));
    await prisma.childPanel.update({ where: { id: panel.id }, data: { panelFee: fee } });
    done("/panel-admin/cau-hinh", fee > 0 ? `Đã đặt phí tạo website con cho khách của panel: ${fee.toLocaleString("vi-VN")}₫ — tiền phí thuộc về bạn` : "Đã đặt tạo website con cho khách của panel là MIỄN PHÍ");
  }
  if (section === "brand") {
    const name = str(formData, "name");
    if (name.length < 3) back("/panel-admin/cau-hinh", "err", "Tên gian hàng tối thiểu 3 ký tự");
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: {
        name, tagline: str(formData, "tagline") || null,
        accent: ["blue", "violet", "emerald", "orange", "rose", "teal"].includes(str(formData, "accent")) ? str(formData, "accent") : panel.accent,
        logoUrl: str(formData, "logoUrl") || null, faviconUrl: str(formData, "faviconUrl") || null,
        supportZalo: str(formData, "supportZalo").slice(0, 120) || null, supportTelegram: str(formData, "supportTelegram").slice(0, 120) || null,
        supportFacebook: str(formData, "supportFacebook").slice(0, 120) || null, supportHotline: str(formData, "supportHotline").slice(0, 120) || null,
      },
    });
    done("/panel-admin/cau-hinh", "Đã lưu thương hiệu & thông tin hỗ trợ của panel");
  }
  if (section === "seo") {
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: { metaDescription: str(formData, "metaDescription") || null, metaKeywords: str(formData, "metaKeywords") || null, ogImageUrl: str(formData, "ogImageUrl") || null },
    });
    done("/panel-admin/cau-hinh", "Đã lưu SEO & Meta của panel");
  }
  if (section === "landing") {
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: {
        landingHeadline: str(formData, "landingHeadline") || null, landingSubtitle: str(formData, "landingSubtitle") || null,
        authStyle: ["classic", "glass", "minimal", "app"].includes(str(formData, "authStyle")) ? str(formData, "authStyle") : null,
      },
    });
    done("/panel-admin/cau-hinh", "Đã lưu trang giới thiệu & kiểu trang đăng nhập của panel");
  }
  if (section === "thongbao") {
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: {
        announcement: str(formData, "announcement").slice(0, 500) || null,
        homeModalEnabled: formData.get("homeModalEnabled") === "on", homeModalContent: str(formData, "homeModalContent") || null,
        termsEnabled: formData.get("termsEnabled") === "on", termsTitle: str(formData, "termsTitle") || null,
        termsContent: str(formData, "termsContent") || null, termsVersion: Math.max(1, int(formData, "termsVersion") || 1),
        termsCheckboxText: str(formData, "termsCheckboxText") || null, termsButtonText: str(formData, "termsButtonText") || null,
      },
    });
    done("/panel-admin/cau-hinh", "Đã lưu thông báo & điều khoản của panel");
  }
  if (section === "promo") {
    const tiers: { from: number; percent: number }[] = [];
    for (let i = 1; i <= 3; i++) {
      const from = int(formData, `tierFrom${i}`);
      const percent = int(formData, `tierPct${i}`);
      if (from > 0 && percent > 0) tiers.push({ from, percent: Math.min(100, percent) });
    }
    tiers.sort((a, b) => a.from - b.from);
    const depositMin = int(formData, "depositMin");
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: { depositBonusTiers: tiers.length ? JSON.stringify(tiers) : null, depositMin: depositMin > 0 ? depositMin : null },
    });
    done("/panel-admin/cau-hinh", "Đã lưu khuyến mãi nạp tiền của panel");
  }
  if (section === "affiliate") {
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: { moduleAffiliate: formData.get("moduleAffiliate") === "on", affiliatePercent: Math.min(50, Math.max(0, int(formData, "affiliatePercent"))) },
    });
    done("/panel-admin/cau-hinh", "Đã lưu chương trình giới thiệu của panel");
  }
  if (section === "toolapi") {
    await prisma.childPanel.update({ where: { id: panel.id }, data: { toolApiKey: str(formData, "tool_api_key") || null } });
    done("/panel-admin/cau-hinh", "Đã lưu Tool API Key của panel");
  }
  if (section === "aicheck") {
    await prisma.childPanel.update({ where: { id: panel.id }, data: { aiCheckEnabled: formData.get("aiCheckEnabled") === "on" } });
    done("/panel-admin/cau-hinh", "Đã lưu cấu hình AI kiểm tra link của panel");
  }
  if (section === "script") {
    await prisma.childPanel.update({
      where: { id: panel.id },
      data: { customHeadHtml: str(formData, "customHeadHtml") || null, customBodyHtml: str(formData, "customBodyHtml") || null },
    });
    done("/panel-admin/cau-hinh", "Đã lưu Script/HTML của panel");
  }
  back("/panel-admin/cau-hinh", "err", "Mục cấu hình không hợp lệ");
}

/* ---------- Báo tin & báo cáo của panel (Email / Telegram / Discord) ---------- */
const REPORT_PAGE = "/panel-admin/bao-cao";

export async function panelSaveAlertsAction(formData: FormData) {
  const { panel } = await ownPanelOwner(REPORT_PAGE);
  const events = formData.getAll("ev").map(String).filter(Boolean);
  const channels = formData.getAll("rch").map(String).filter(Boolean);
  const keep = (v: string, old: string | null) => (v.includes("•") ? old : v || null);
  await prisma.childPanel.update({
    where: { id: panel.id },
    data: {
      alertTelegram: formData.get("alertTelegram") === "on",
      telegramBotToken: keep(str(formData, "telegramBotToken"), panel.telegramBotToken),
      telegramChatId: str(formData, "telegramChatId") || null,
      alertDiscord: formData.get("alertDiscord") === "on",
      discordWebhook: str(formData, "discordWebhook") || null,
      alertEmailOn: formData.get("alertEmailOn") === "on",
      alertEmail: str(formData, "alertEmail") || null,
      alertEvents: events.join(","),
      reportDaily: formData.get("reportDaily") === "on",
      reportTime: str(formData, "reportTime") || "21:00",
      reportChannels: channels.join(",") || "telegram",
    },
  });
  done(REPORT_PAGE, "Đã lưu cấu hình báo tin & báo cáo của panel");
}

export async function panelTestChannelAction(formData: FormData) {
  const { panel } = await ownPanelOwner(REPORT_PAGE);
  const channel = str(formData, "channel");
  const { sendDiscord, sendTelegramTo, alertEmailHtml } = await import("@/lib/alerts");
  const text = `Tin nhắn thử từ gian hàng ${panel.name} — kênh báo tin của bạn đã hoạt động.`;
  try {
    if (channel === "telegram") {
      if (!panel.telegramBotToken || !panel.telegramChatId) back(REPORT_PAGE, "err", "Panel chưa có Bot Token / Chat ID — điền và Lưu trước khi gửi thử");
      await sendTelegramTo(panel.telegramBotToken!, panel.telegramChatId!, text);
    } else if (channel === "discord") {
      if (!panel.discordWebhook) back(REPORT_PAGE, "err", "Panel chưa có Discord Webhook — điền và Lưu trước khi gửi thử");
      await sendDiscord(panel.discordWebhook!, text);
    } else if (channel === "email") {
      if (!panel.alertEmail) back(REPORT_PAGE, "err", "Panel chưa nhập email nhận — điền và Lưu trước khi gửi thử");
      const override = panel.smtpHost && panel.smtpUser && panel.smtpFrom
        ? { host: panel.smtpHost, port: panel.smtpPort, user: panel.smtpUser, pass: panel.smtpPass, from: panel.smtpFrom, secure: panel.smtpSecure }
        : null;
      await sendMail([panel.alertEmail!], "Tin nhắn thử — gian hàng của bạn", alertEmailHtml("Tin nhắn thử", text), override);
    } else {
      back(REPORT_PAGE, "err", "Kênh không hợp lệ");
    }
    done(REPORT_PAGE, `Đã gửi tin thử qua ${channel} — kiểm tra nơi nhận nhé`);
  } catch (e: any) {
    back(REPORT_PAGE, "err", `Gửi thử thất bại: ${String(e?.message || e)}`);
  }
}

/* ---------- Nhân viên & phân quyền của panel ---------- */
const STAFF_PAGE = "/panel-admin/nhan-vien";

export async function panelAddStaffAction(formData: FormData) {
  const { user, panel } = await ownPanelOwner(STAFF_PAGE);
  const q = str(formData, "q").toLowerCase();
  if (!q) back(STAFF_PAGE, "err", "Nhập tên đăng nhập hoặc email của tài khoản cần thêm");
  const target = await prisma.user.findFirst({ where: { OR: [{ username: q }, { email: q }] } });
  if (!target) back(STAFF_PAGE, "err", "Không tìm thấy tài khoản này — nhân viên cần có tài khoản trên hệ thống trước");
  if (target.id === user.id) back(STAFF_PAGE, "err", "Bạn là chủ panel rồi, không cần thêm chính mình");
  if (target.role === "ADMIN" || target.role === "STAFF") back(STAFF_PAGE, "err", "Tài khoản quản trị hệ thống không làm nhân viên panel được");
  const ownsOther = await prisma.childPanel.findUnique({ where: { ownerId: target.id }, select: { id: true } });
  if (ownsOther) back(STAFF_PAGE, "err", "Tài khoản này đang là chủ một panel khác — họ sẽ vào panel của chính họ, không làm nhân viên được");
  const exists = await prisma.panelStaff.findUnique({ where: { panelId_userId: { panelId: panel.id, userId: target.id } } });
  if (exists) back(STAFF_PAGE, "err", "Tài khoản này đã là nhân viên của panel rồi");
  await prisma.panelStaff.create({ data: { panelId: panel.id, userId: target.id } });
  await notifyUser(target.id, "Bạn được thêm làm Nhân viên panel", `Chủ gian hàng ${panel.name} vừa thêm bạn làm nhân viên — vào mục Panel Admin để xử lý đơn và ticket của gian hàng.`, "/panel-admin");
  done(STAFF_PAGE, `Đã thêm ${target.username} làm nhân viên của panel`);
}

export async function panelRemoveStaffAction(formData: FormData) {
  const { panel } = await ownPanelOwner(STAFF_PAGE);
  const id = int(formData, "id");
  const row = await prisma.panelStaff.findFirst({ where: { id, panelId: panel.id } });
  if (!row) back(STAFF_PAGE, "err", "Không tìm thấy nhân viên này trong panel của bạn");
  await prisma.panelStaff.delete({ where: { id: row.id } });
  done(STAFF_PAGE, "Đã gỡ nhân viên khỏi panel");
}

/* ---------- Đồng bộ nốt các mục như web mẹ: tiền tệ / mô-đun / bảo mật / ngân hàng / giá thông minh / dọn dẹp ---------- */

/** Tiền tệ: tỉ giá quy đổi hiển thị RIÊNG của panel (trống = dùng của web mẹ). */
export async function panelSaveRatesAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/tien-te");
  const get = (k: string) => {
    const v = String(formData.get(k) || "").trim();
    if (!v) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? String(n) : null;
  };
  await prisma.childPanel.update({
    where: { id: panel.id },
    data: { rateUsd: get("rateUsd"), rateEur: get("rateEur"), rateCny: get("rateCny"), rateThb: get("rateThb"), rateJpy: get("rateJpy"), rateKrw: get("rateKrw") },
  });
  done("/panel-admin/tien-te", "Đã lưu tỉ giá hiển thị của panel");
}

/** Mô-đun của panel: bật/tắt bán SMM / Premium / Kiếm tiền (affiliate) / Đăng ký mới. */
export async function panelSaveModulesAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/mo-dun");
  const affPct = formData.get("affiliatePercent");
  await prisma.childPanel.update({
    where: { id: panel.id },
    data: {
      sellSmm: formData.has("sellSmm"),
      sellPremium: formData.has("sellPremium"),
      moduleAffiliate: formData.has("moduleAffiliate"),
      moduleRegister: formData.has("moduleRegister"),
      moduleBulk: formData.has("moduleBulk"),
      moduleSubscriptions: formData.has("moduleSubscriptions"),
      moduleCampaigns: formData.has("moduleCampaigns"),
      modulePromo: formData.has("modulePromo"),
      moduleTickets: formData.has("moduleTickets"),
      moduleApi: formData.has("moduleApi"),
      moduleBlog: formData.has("moduleBlog"),
      affiliatePercent: affPct === undefined || String(affPct).trim() === "" ? panel.affiliatePercent : Math.max(0, Math.min(100, parseInt(String(affPct)) || 0)),
    },
  });
  done("/panel-admin/mo-dun", "Đã lưu mô-đun của panel");
}

/** Bảo mật: cấm IP trong phạm vi panel (đăng ký + đăng nhập của khách panel). */
export async function panelBanIpAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/bao-mat");
  const ip = str(formData, "ip");
  const reason = str(formData, "reason") || null;
  if (!/^[0-9a-fA-F.:]{3,64}$/.test(ip)) back("/panel-admin/bao-mat", "err", "Địa chỉ IP chưa đúng định dạng");
  const exists = await prisma.ipBan.findFirst({ where: { panelId: panel.id, ip } });
  if (exists) back("/panel-admin/bao-mat", "err", "IP này đã bị cấm trong panel rồi");
  await prisma.ipBan.create({ data: { panelId: panel.id, ip, reason } });
  done("/panel-admin/bao-mat", `Đã cấm IP ${ip} khỏi panel`);
}

export async function panelUnbanIpAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/bao-mat");
  const id = int(formData, "id");
  await prisma.ipBan.deleteMany({ where: { id, panelId: panel.id } });
  done("/panel-admin/bao-mat", "Đã bỏ cấm IP");
}

/** Ngân hàng riêng của panel: thêm / sửa / bật tắt / xoá tài khoản nhận nạp. */
const BANK_PAGE = "/panel-admin/ngan-hang";
export async function panelSaveBankAccountAction(formData: FormData) {
  const { panel } = await ownPanelOwner(BANK_PAGE);
  const id = int(formData, "id");
  const bankName = str(formData, "bankName");
  const accountNo = str(formData, "accountNo");
  const accountName = str(formData, "accountName");
  const note = str(formData, "note") || null;
  if (!bankName || !accountNo || !accountName) back(BANK_PAGE, "err", "Điền đủ ngân hàng, số tài khoản và chủ tài khoản");
  if (id) {
    const row = await prisma.panelBankAccount.findFirst({ where: { id, panelId: panel.id } });
    if (!row) back(BANK_PAGE, "err", "Không tìm thấy tài khoản này trong panel của bạn");
    await prisma.panelBankAccount.update({ where: { id }, data: { bankName, accountNo, accountName, note } });
    done(BANK_PAGE, "Đã cập nhật tài khoản ngân hàng");
  }
  await prisma.panelBankAccount.create({ data: { panelId: panel.id, bankName, accountNo, accountName, note } });
  done(BANK_PAGE, "Đã thêm tài khoản ngân hàng");
}

export async function panelToggleBankAccountAction(formData: FormData) {
  const { panel } = await ownPanelOwner(BANK_PAGE);
  const id = int(formData, "id");
  const row = await prisma.panelBankAccount.findFirst({ where: { id, panelId: panel.id } });
  if (!row) back(BANK_PAGE, "err", "Không tìm thấy tài khoản này trong panel của bạn");
  await prisma.panelBankAccount.update({ where: { id }, data: { active: !row.active } });
  done(BANK_PAGE, row.active ? "Đã ẩn tài khoản khỏi trang nạp của khách" : "Đã hiện tài khoản ở trang nạp của khách");
}

export async function panelDeleteBankAccountAction(formData: FormData) {
  const { panel } = await ownPanelOwner(BANK_PAGE);
  const id = int(formData, "id");
  await prisma.panelBankAccount.deleteMany({ where: { id, panelId: panel.id } });
  done(BANK_PAGE, "Đã xoá tài khoản ngân hàng");
}

/** Giá thông minh: chỉnh giá hàng loạt trong panel — % trên giá riêng đã đặt
 *  + % trên giá bán của dịch vụ panel tự thêm. Làm tròn tới hàng chục, sàn 100đ. */
export async function panelSmartPriceAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/gia-thong-minh");
  const pctRaw = parseFloat(String(formData.get("pct") || "0"));
  if (!Number.isFinite(pctRaw) || pctRaw <= -90 || pctRaw > 500) back("/panel-admin/gia-thong-minh", "err", "% điều chỉnh phải trong khoảng −90% … +500%");
  const factor = 1 + pctRaw / 100;
  const adj = (v: number) => Math.max(100, Math.round((v * factor) / 10) * 10);
  const prices = await prisma.panelServicePrice.findMany({ where: { panelId: panel.id } });
  for (const p of prices) {
    await prisma.panelServicePrice.update({ where: { id: p.id }, data: { price: adj(p.price) } });
  }
  const own = await prisma.smmService.findMany({ where: { panelId: panel.id } });
  for (const sv of own) {
    await prisma.smmService.update({ where: { id: sv.id }, data: { rate: adj(sv.rate) } });
  }
  await prisma.apiLog.create({ data: { kind: "bulk_price", ref: panel.slug, detail: `Panel ${panel.slug}: giá thông minh ${pctRaw > 0 ? "+" : ""}${pctRaw}% trên ${prices.length} giá riêng + ${own.length} dịch vụ tự thêm` } });
  done("/panel-admin/gia-thong-minh", `Đã điều chỉnh ${pctRaw > 0 ? "+" : ""}${pctRaw}% cho ${prices.length} giá riêng và ${own.length} dịch vụ tự thêm`);
}

/** Danh mục: ẩn/hiện danh mục SMM trên gian hàng của panel. */
export async function panelToggleCategoryAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/danh-muc");
  const catId = int(formData, "catId");
  const hidden = new Set((panel.hiddenCats || "").split(",").map((x) => x.trim()).filter(Boolean));
  if (hidden.has(String(catId))) hidden.delete(String(catId)); else hidden.add(String(catId));
  await prisma.childPanel.update({ where: { id: panel.id }, data: { hiddenCats: Array.from(hidden).join(",") || null } });
  done("/panel-admin/danh-muc", hidden.has(String(catId)) ? "Đã ẩn danh mục khỏi gian hàng" : "Đã hiện lại danh mục trên gian hàng");
}

/** Hệ thống & dọn dẹp của panel: xoá dữ liệu cũ trong phạm vi panel. */
export async function panelCleanupAction(formData: FormData) {
  const { panel } = await ownPanelOwner("/panel-admin/he-thong");
  const kind = str(formData, "kind");
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  if (kind === "notifications") {
    const r = await prisma.notification.deleteMany({ where: { user: { panelId: panel.id }, read: true, createdAt: { lt: cutoff } } });
    done("/panel-admin/he-thong", `Đã xoá ${r.count} thông báo đã đọc (cũ hơn 30 ngày) của khách panel`);
  }
  if (kind === "events") {
    const r = await prisma.orderEvent.deleteMany({ where: { createdAt: { lt: cutoff }, order: { panelId: panel.id } } });
    done("/panel-admin/he-thong", `Đã xoá ${r.count} dòng thời gian đơn cũ (hơn 30 ngày) của panel`);
  }
  if (kind === "apilogs") {
    const codes = await panelOrderCodes(panel.id);
    const r = await prisma.apiLog.deleteMany({ where: { ref: { in: codes }, createdAt: { lt: cutoff } } });
    done("/panel-admin/he-thong", `Đã xoá ${r.count} nhật ký API cũ (hơn 30 ngày) liên quan đơn của panel`);
  }
  back("/panel-admin/he-thong", "err", "Loại dọn dẹp không hợp lệ");
}

/** Mã đơn (SMM + Premium) của panel — dùng để lọc nhật ký API theo phạm vi panel. */
export async function panelOrderCodes(panelId: number): Promise<string[]> {
  const [a, b] = await Promise.all([
    prisma.smmOrder.findMany({ where: { panelId }, select: { code: true }, orderBy: { id: "desc" }, take: 2000 }),
    prisma.premiumOrder.findMany({ where: { panelId }, select: { code: true }, orderBy: { id: "desc" }, take: 2000 }),
  ]);
  return [...a.map((x) => x.code), ...b.map((x) => x.code)];
}

export async function panelSendReportNowAction() {
  const { panel } = await ownPanelOwner(REPORT_PAGE);
  const { sendReport } = await import("@/lib/report");
  const channels = (panel.reportChannels || "telegram").split(",").map((x) => x.trim()).filter(Boolean) as any[];
  if (!channels.length) back(REPORT_PAGE, "err", "Chưa chọn kênh gửi báo cáo nào");
  const results = await sendReport({ panelId: panel.id }, channels);
  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  if (ok.length && !fail.length) done(REPORT_PAGE, `Đã gửi báo cáo qua: ${ok.map((r) => r.channel).join(", ")}`);
  if (ok.length && fail.length) done(REPORT_PAGE, `Đã gửi qua ${ok.map((r) => r.channel).join(", ")}; lỗi: ${fail.map((r) => `${r.channel} (${r.note})`).join("; ")}`);
  back(REPORT_PAGE, "err", `Gửi báo cáo thất bại: ${fail.map((r) => `${r.channel} (${r.note})`).join("; ")}`);
}

/* ---------- Sản phẩm Premium của panel (chủ panel tự thêm, tự giao) ---------- */
const PRE_PAGE = "/panel-admin/premium";

export async function panelSavePremiumProductAction(formData: FormData) {
  const { panel } = await ownPanelOwner(PRE_PAGE);
  const id = int(formData, "id");
  const name = str(formData, "name");
  if (name.length < 2) back(PRE_PAGE, "err", "Tên sản phẩm quá ngắn");
  const categoryId = int(formData, "categoryId");
  const cat = await prisma.premiumCategory.findUnique({ where: { id: categoryId } });
  if (!cat) back(PRE_PAGE, "err", "Chưa chọn danh mục");
  const data = {
    name: name.slice(0, 150),
    categoryId,
    tagline: str(formData, "tagline").slice(0, 255) || null,
    imageUrl: str(formData, "imageUrl").slice(0, 500) || null,
    buyNote: str(formData, "buyNote").slice(0, 500) || null,
    warrantyInfo: str(formData, "warrantyInfo") || null,
    usageGuide: str(formData, "usageGuide") || null,
    sort: int(formData, "sort"),
    active: formData.get("active") === "on",
  };
  if (id) {
    const p = await prisma.premiumProduct.findFirst({ where: { id, panelId: panel.id } });
    if (!p) back(PRE_PAGE, "err", "Không tìm thấy sản phẩm của panel");
    await prisma.premiumProduct.update({ where: { id }, data });
    done(PRE_PAGE, `Đã lưu sản phẩm ${name}`);
  }
  let slug = slugify(name) || `sp-panel-${panel.id}`;
  if (await prisma.premiumProduct.findUnique({ where: { slug } })) slug = `${slug}-p${panel.id}`;
  if (await prisma.premiumProduct.findUnique({ where: { slug } })) slug = `${slug}-${Date.now()}`;
  await prisma.premiumProduct.create({ data: { ...data, slug, panelId: panel.id, fulfillment: "MANUAL" } });
  done(PRE_PAGE, `Đã thêm sản phẩm ${name} — bấm nút Gói để thêm gói bán`);
}

export async function panelTogglePremiumProductAction(formData: FormData) {
  const { panel } = await ownPanelOwner(PRE_PAGE);
  const id = int(formData, "id");
  const p = await prisma.premiumProduct.findFirst({ where: { id, panelId: panel.id }, select: { active: true } });
  if (!p) back(PRE_PAGE, "err", "Không tìm thấy sản phẩm của panel");
  await prisma.premiumProduct.update({ where: { id }, data: { active: !p.active } });
  done(PRE_PAGE, p.active ? "Đã tắt bán sản phẩm" : "Đã mở bán sản phẩm");
}

export async function panelDeletePremiumProductAction(formData: FormData) {
  const { panel } = await ownPanelOwner(PRE_PAGE);
  const id = int(formData, "id");
  const p = await prisma.premiumProduct.findFirst({ where: { id, panelId: panel.id }, include: { variants: { select: { id: true } } } });
  if (!p) back(PRE_PAGE, "err", "Không tìm thấy sản phẩm của panel");
  const orders = await prisma.premiumOrder.count({ where: { variantId: { in: p.variants.map((v) => v.id) } } });
  if (orders > 0) {
    await prisma.premiumProduct.update({ where: { id }, data: { active: false } });
    done(PRE_PAGE, "Sản phẩm đã có đơn nên chỉ tắt bán");
  }
  await prisma.premiumVariant.deleteMany({ where: { productId: id } });
  await prisma.premiumProduct.delete({ where: { id } });
  done(PRE_PAGE, "Đã xoá sản phẩm");
}

export async function panelSavePremiumVariantAction(formData: FormData) {
  const { panel } = await ownPanelOwner(PRE_PAGE);
  const productId = int(formData, "productId");
  const product = await prisma.premiumProduct.findFirst({ where: { id: productId, panelId: panel.id } });
  if (!product) back(PRE_PAGE, "err", "Không tìm thấy sản phẩm của panel");
  const id = int(formData, "id");
  const name = str(formData, "name");
  if (!name) back(PRE_PAGE, "err", "Chưa nhập tên gói");
  const data = {
    name: name.slice(0, 100),
    price: Math.max(0, int(formData, "price")),
    warrantyDays: Math.max(0, int(formData, "warrantyDays")),
    sort: int(formData, "sort"),
    active: formData.get("active") === "on",
  };
  if (id) {
    const v = await prisma.premiumVariant.findFirst({ where: { id, productId } });
    if (!v) back(PRE_PAGE, "err", "Không tìm thấy gói");
    await prisma.premiumVariant.update({ where: { id }, data });
  } else {
    await prisma.premiumVariant.create({ data: { ...data, productId } });
  }
  done(PRE_PAGE, `Đã lưu gói ${name}`);
}

export async function panelDeletePremiumVariantAction(formData: FormData) {
  const { panel } = await ownPanelOwner(PRE_PAGE);
  const id = int(formData, "id");
  const v = await prisma.premiumVariant.findFirst({ where: { id, product: { panelId: panel.id } } });
  if (!v) back(PRE_PAGE, "err", "Không tìm thấy gói của panel");
  const count = await prisma.premiumOrder.count({ where: { variantId: id } });
  if (count) {
    await prisma.premiumVariant.update({ where: { id }, data: { active: false } });
    done(PRE_PAGE, "Gói đã có đơn nên chỉ tắt bán");
  }
  await prisma.premiumStock.deleteMany({ where: { variantId: id } });
  await prisma.premiumVariant.delete({ where: { id } });
  done(PRE_PAGE, "Đã xoá gói");
}

/** Giao / huỷ đơn Premium thuộc sản phẩm của chính panel (chủ panel tự giao). */
export async function panelPremiumOrderAction(formData: FormData) {
  const { panel } = await ownPanel("/panel-admin/don-premium");
  const id = int(formData, "id");
  const kind = str(formData, "kind");
  const path = `/panel-admin/don-premium/${id}`;
  const order = await prisma.premiumOrder.findFirst({
    where: { id, panelId: panel.id },
    include: { variant: { include: { product: { select: { panelId: true } } } } },
  });
  if (!order || order.variant.product.panelId !== panel.id) back("/panel-admin/don-premium", "err", "Đơn này không thuộc sản phẩm của panel bạn");
  if (kind === "cancel") {
    if (order.status === "REFUNDED") back(path, "err", "Đơn đã hoàn tiền trước đó");
    await prisma.$transaction(async (tx) => {
      await applyBalance(tx, order.userId, order.total, "REFUND", order.code, "Chủ panel huỷ đơn premium — hoàn tiền");
      if (order.commission > 0) {
        await applyBalance(tx, panel.ownerId, -order.commission, "PANEL_COMMISSION", order.code, "Thu hồi hoa hồng — đơn premium bị huỷ");
      }
      await tx.premiumOrder.update({ where: { id }, data: { status: "REFUNDED" } });
    });
    await clawbackReferralCommission(order.userId, order.total, order.code);
    done(path, "Đã huỷ đơn và hoàn tiền cho khách");
  }
  const deliveryData = str(formData, "deliveryData") || order.deliveryData;
  const status = (str(formData, "status") || order.status) as any;
  const adminNote = str(formData, "adminNote") || order.adminNote;
  await prisma.premiumOrder.update({ where: { id }, data: { status, deliveryData, adminNote } });
  if ((status === "DELIVERED" || status === "COMPLETED") && deliveryData) {
    await notifyUser(order.userId, "Đơn Premium đã được giao", `Đơn ${order.code} đã giao — xem nội dung trong mục Đơn Premium của bạn.`, "/dashboard/don-premium");
  }
  done(path, "Đã cập nhật đơn premium");
}
