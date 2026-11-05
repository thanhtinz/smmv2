"use server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createSmmOrder, createPremiumOrder } from "@/lib/orders";
import { getSettings, calcBonus } from "@/lib/settings";
import { randomKey, genCode, parsePremiumFields } from "@/lib/format";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

export async function placeSmmOrderAction(formData: FormData) {
  const user = await requireUser();
  if ((await getSettings()).module_smm === "0") back("/dashboard/dat-hang", "err", "Đặt đơn SMM đang tạm ngưng");
  const serviceId = parseInt(String(formData.get("serviceId") || "0"));
  const link = String(formData.get("link") || "");
  const quantity = parseInt(String(formData.get("quantity") || "0"));
  const note = String(formData.get("note") || "") || undefined;
  const dripfeed = formData.get("dripfeed") === "1" && parseInt(String(formData.get("runs") || "0")) > 0 && parseInt(String(formData.get("interval") || "0")) > 0
    ? { runs: parseInt(String(formData.get("runs"))), intervalMinutes: parseInt(String(formData.get("interval"))) }
    : undefined;
  const extra: Record<string, any> = {};
  const comments = String(formData.get("comments") || "").trim();
  const reaction = String(formData.get("reaction") || "").trim();
  const minutes = parseInt(String(formData.get("minutes") || "0"));
  if (comments) extra.comments = comments;
  if (reaction) extra.reaction = reaction;
  if (minutes > 0) extra.minutes = minutes;
  try {
    const fresh = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    const order = await createSmmOrder({ user: fresh, serviceId, link, quantity, note, extra, dripfeed, promoCode: String(formData.get("promoCode") || "") || undefined, campaignId: parseInt(String(formData.get("campaignId") || "0")) || undefined });
    back("/dashboard/don-hang", "msg", `Đặt đơn ${order.code} thành công — trạng thái: ${order.status === "REFUNDED" ? "provider từ chối, đã hoàn tiền" : "đang xử lý"}`);
  } catch (e: any) {
    back("/dashboard/dat-hang", "err", String(e?.message || "Đặt đơn thất bại"));
  }
}

/**
 * Đặt hàng loạt (bulk orders): mỗi dòng "service_id | link | quantity" là một đơn riêng.
 * Xử lý từng dòng độc lập — dòng lỗi không chặn các dòng còn lại; trả về tóm tắt.
 */
export async function bulkPlaceOrdersAction(formData: FormData) {
  const user = await requireUser();
  const raw = String(formData.get("bulk") || "");
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) back("/dashboard/dat-hang-loat", "err", "Chưa có dòng nào để đặt");
  if (lines.length > 50) back("/dashboard/dat-hang-loat", "err", "Tối đa 50 dòng mỗi lần đặt hàng loạt");
  const fresh = (await prisma.user.findUnique({ where: { id: user.id } }))!;
  let ok = 0;
  const errors: string[] = [];
  const codes: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split("|").map((p) => p.trim());
    const [sidRaw, link, qtyRaw] = parts;
    const serviceId = parseInt(sidRaw || "0");
    const quantity = parseInt(qtyRaw || "0");
    if (parts.length < 3 || !serviceId || !link || !quantity) {
      errors.push(`dòng ${i + 1}: sai định dạng (cần: id dịch vụ | link | số lượng)`);
      continue;
    }
    try {
      const order = await createSmmOrder({ user: fresh, serviceId, link, quantity });
      ok++;
      codes.push(order.code);
    } catch (e: any) {
      errors.push(`dòng ${i + 1}: ${String(e?.message || "lỗi")}`);
    }
  }
  await prisma.apiLog.create({ data: { kind: "bulk_order", ref: fresh.username, ok: errors.length === 0, detail: `ok=${ok}/${lines.length} codes=${codes.join(",")}` } });
  if (ok === 0) back("/dashboard/dat-hang-loat", "err", `Không đặt được đơn nào. ${errors.slice(0, 3).join("; ")}`);
  const tail = errors.length ? ` ${errors.length} dòng lỗi: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}` : "";
  back("/dashboard/don-hang", "msg", `Đặt hàng loạt xong: ${ok}/${lines.length} đơn thành công (${codes.slice(0, 5).join(", ")}${codes.length > 5 ? "…" : ""}).${tail}`);
}

/* ---------- Panel con (child panel) ---------- */
const RESERVED_SLUGS = ["admin", "api", "dashboard", "cua-hang", "login", "register", "dich-vu", "premium", "manifest.webmanifest", "icon.svg"];
const PANEL_ACCENTS = ["blue", "violet", "emerald", "orange", "rose", "teal"];

function panelSlug(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** API key nhập ở trang setup lần đầu: key của tài khoản mẹ mà panel liên kết.
 *  Để trống = dùng key của chính chủ panel. Trả null nếu key không tồn tại. */
async function panelApiLink(formData: FormData, fallback: { apiKey: string | null; apiUserId: number | null }) {
  const key = String(formData.get("apiKey") || "").trim();
  if (!key) return fallback;
  const owner = await prisma.user.findUnique({ where: { apiKey: key } });
  if (!owner) return null;
  return { apiKey: key, apiUserId: owner.id };
}

function panelDiscounts(formData: FormData) {  const clamp = (v: FormDataEntryValue | null, dflt: number) => Math.min(90, Math.max(0, parseInt(String(v ?? dflt)) || 0));
  return {
    discountMember: clamp(formData.get("discountMember"), 0),
    discountReseller: clamp(formData.get("discountReseller"), 5),
    discountAgency: clamp(formData.get("discountAgency"), 10),
    discountVip: clamp(formData.get("discountVip"), 15),
  };
}

export async function createPanelAction(formData: FormData) {
  const user = await requireUser();
  if ((await getSettings()).module_panels === "0") back("/dashboard", "err", "Tính năng mở panel con đang tạm đóng");
  const existing = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  if (existing) back("/panel-admin", "err", "Mỗi tài khoản chỉ tạo 1 panel con");
  const name = String(formData.get("name") || "").trim();
  const slug = panelSlug(String(formData.get("slug") || ""));
  const markup = Math.min(200, Math.max(0, parseInt(String(formData.get("markup") || "20")) || 0));
  const accent = PANEL_ACCENTS.includes(String(formData.get("accent"))) ? String(formData.get("accent")) : "blue";
  const tagline = String(formData.get("tagline") || "").trim() || null;
  const support = String(formData.get("support") || "").trim() || null;
  const domainRaw = String(formData.get("domain") || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] || null;
  if (name.length < 3) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Tên panel tối thiểu 3 ký tự");
  if (slug.length < 3 || slug.length > 40) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Đường dẫn panel phải 3-40 ký tự (chữ thường, số, dấu -)");
  if (RESERVED_SLUGS.includes(slug)) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Đường dẫn này đã được hệ thống dùng");
  const dup = await prisma.childPanel.findFirst({ where: { OR: [{ slug }, ...(domainRaw ? [{ domain: domainRaw }] : [])] } });
  if (dup) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Đường dẫn hoặc tên miền đã có panel khác dùng");
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { apiKey: true } });
  const link = await panelApiLink(formData, { apiKey: me?.apiKey || null, apiUserId: user.id });
  if (!link) back("/dashboard/panel-cua-toi/thiet-lap", "err", "API key không hợp lệ — hãy dán key của tài khoản mẹ (lấy tại mục API đại lý)");
  await prisma.childPanel.create({
    data: {
      ownerId: user.id, name, slug, markup, accent, tagline, support, domain: domainRaw,
      apiKey: link.apiKey, apiUserId: link.apiUserId,
      ...panelDiscounts(formData),
      setupDone: formData.get("setupDone") === "1",
    },
  });
  back("/panel-admin", "msg", `Đã tạo panel ${name} — gian hàng của bạn: /cua-hang/${slug}`);
}

export async function updatePanelAction(formData: FormData) {
  const user = await requireUser();
  const panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  if (!panel) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Bạn chưa có panel");
  // Cập nhật TỪNG PHẦN: form nào gửi trường nào thì cập nhật trường đó (Panel Admin có
  // nhiều form riêng: giá chung ở trang Dịch vụ & Giá, thông tin ở trang Cài đặt...)
  const backToRaw = String(formData.get("back") || "");
  const backTo = backToRaw.startsWith("/panel-admin") || backToRaw.startsWith("/dashboard/panel-cua-toi") ? backToRaw : "/panel-admin/cai-dat";
  const has = (k: string) => formData.has(k);
  const data: Record<string, unknown> = {};
  if (has("name")) {
    const name = String(formData.get("name") || "").trim();
    if (name.length < 3) back(backTo, "err", "Tên panel tối thiểu 3 ký tự");
    data.name = name;
  }
  if (has("markup")) data.markup = Math.min(200, Math.max(0, parseInt(String(formData.get("markup"))) || 0));
  if (has("accent")) data.accent = PANEL_ACCENTS.includes(String(formData.get("accent"))) ? String(formData.get("accent")) : panel.accent;
  if (has("tagline")) data.tagline = String(formData.get("tagline") || "").trim() || null;
  if (has("support")) data.support = String(formData.get("support") || "").trim() || null;
  if (has("supportZalo")) data.supportZalo = String(formData.get("supportZalo") || "").trim().slice(0, 120) || null;
  if (has("supportTelegram")) data.supportTelegram = String(formData.get("supportTelegram") || "").trim().slice(0, 120) || null;
  if (has("supportFacebook")) data.supportFacebook = String(formData.get("supportFacebook") || "").trim().slice(0, 120) || null;
  if (has("supportHotline")) data.supportHotline = String(formData.get("supportHotline") || "").trim().slice(0, 120) || null;
  if (has("announcement")) data.announcement = String(formData.get("announcement") || "").trim().slice(0, 500) || null;
  if (has("domain")) {
    const domainRaw = String(formData.get("domain") || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] || null;
    if (domainRaw && domainRaw !== panel.domain) {
      const dup = await prisma.childPanel.findFirst({ where: { domain: domainRaw, NOT: { id: panel.id } } });
      if (dup) back(backTo, "err", "Tên miền đã có panel khác dùng");
    }
    data.domain = domainRaw;
  }
  if (has("status")) data.status = formData.get("status") === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
  const pct = (v: FormDataEntryValue | null) => Math.min(90, Math.max(0, parseInt(String(v || "0")) || 0));
  if (has("discountMember")) data.discountMember = pct(formData.get("discountMember"));
  if (has("discountReseller")) data.discountReseller = pct(formData.get("discountReseller"));
  if (has("discountAgency")) data.discountAgency = pct(formData.get("discountAgency"));
  if (has("discountVip")) data.discountVip = pct(formData.get("discountVip"));
  if (has("apiKey")) {
    const link = await panelApiLink(formData, { apiKey: panel.apiKey, apiUserId: panel.apiUserId });
    if (!link) back(backTo, "err", "API key không hợp lệ — hãy dán key của tài khoản mẹ (lấy tại mục API đại lý)");
    data.apiKey = link.apiKey;
    data.apiUserId = link.apiUserId;
  }
  if (formData.get("setupDone") === "1") data.setupDone = true;
  await prisma.childPanel.update({ where: { id: panel.id }, data });
  back(backTo, "msg", "Đã cập nhật panel");
}
/** Giá riêng từng dịch vụ theo từng bậc cho panel của chính mình (kiểu thatim):
 *  để trống một bậc = bậc đó dùng giá panel chuẩn (markup + % giảm của bậc) */
export async function setPanelServicePricesAction(formData: FormData) {
  const user = await requireUser();
  const panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  if (!panel) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Bạn chưa có panel");
  const serviceId = parseInt(String(formData.get("serviceId") || "0"));
  const svc = await prisma.smmService.findUnique({ where: { id: serviceId } });
  if (!svc) back("/panel-admin/dich-vu", "err", "Dịch vụ không tồn tại");
  const levels = ["MEMBER", "RESELLER", "AGENCY", "VIP"] as const;
  for (const lv of levels) {
    const raw = String(formData.get(`price_${lv}`) || "").trim();
    const price = Math.floor(Number(raw));
    if (!raw || !price || price <= 0) {
      await prisma.panelServicePrice.deleteMany({ where: { panelId: panel.id, serviceId, level: lv } });
    } else {
      await prisma.panelServicePrice.upsert({
        where: { panelId_serviceId_level: { panelId: panel.id, serviceId, level: lv } },
        create: { panelId: panel.id, serviceId, level: lv, price },
        update: { price },
      });
    }
  }
  back("/panel-admin/dich-vu", "msg", `Đã lưu giá riêng theo bậc cho "${svc.name}"`);
}

export async function deletePanelServicePriceAction(formData: FormData) {
  const user = await requireUser();
  const panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  if (!panel) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Bạn chưa có panel");
  const id = parseInt(String(formData.get("id") || "0"));
  await prisma.panelServicePrice.deleteMany({ where: { id, panelId: panel.id } });
  back("/panel-admin/dich-vu", "msg", "Đã xoá giá riêng");
}

/** Chủ panel gán cấp bậc cho khách CỦA PANEL MÌNH (không đụng được khách ngoài panel) */
export async function setPanelMemberLevelAction(formData: FormData) {
  const user = await requireUser();
  const panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  if (!panel) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Bạn chưa có panel");
  const memberId = parseInt(String(formData.get("memberId")));
  const level = String(formData.get("level") || "MEMBER");
  if (!["MEMBER", "RESELLER", "AGENCY", "VIP"].includes(level)) back("/panel-admin/khach-hang", "err", "Cấp bậc không hợp lệ");
  const member = await prisma.user.findFirst({ where: { id: memberId, panelId: panel.id } });
  if (!member) back("/panel-admin/khach-hang", "err", "Khách này không thuộc panel của bạn");
  await prisma.user.update({ where: { id: memberId }, data: { level: level as any } });
  back("/panel-admin/khach-hang", "msg", `Đã đặt cấp bậc cho ${member.username}`);
}

export async function buyPremiumAction(formData: FormData) {
  const user = await requireUser();
  if ((await getSettings()).module_premium === "0") back("/premium", "err", "Mảng Premium đang tạm ngưng");
  const variantId = parseInt(String(formData.get("variantId") || "0"));
  const quantity = parseInt(String(formData.get("quantity") || "1"));
  const buyerInfo = String(formData.get("buyerInfo") || "") || undefined;
  const slug = String(formData.get("slug") || "");
  // Trường tuỳ chỉnh của sản phẩm (form gửi cf_0, cf_1... theo thứ tự trường đã định nghĩa)
  let customData: Record<string, string> | undefined;
  const variantRow = variantId ? await prisma.premiumVariant.findUnique({ where: { id: variantId }, include: { product: { select: { customFields: true } } } }) : null;
  const fields = parsePremiumFields(variantRow?.product.customFields);
  if (fields.length > 0) {
    customData = {};
    fields.forEach((f, i) => { customData![f.label] = String(formData.get(`cf_${i}`) || ""); });
  }
  try {
    const fresh = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    const order = await createPremiumOrder({ user: fresh, variantId, quantity, buyerInfo, customData, promoCode: String(formData.get("promoCode") || "") || undefined });
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
  const { notifyTelegram } = await import("@/lib/telegram");
  const t = await prisma.ticket.create({
    data: { userId: user.id, subject, category, messages: { create: { body } } },
  });
  await notifyTelegram(`Ticket mới #${t.id} từ ${user.username}: ${subject}`);
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
  const webhookUrl = String(formData.get("webhookUrl") || "").trim();
  if (webhookUrl && !/^https?:\/\/.+/i.test(webhookUrl)) back("/dashboard/ho-so", "err", "Webhook URL phải bắt đầu bằng http:// hoặc https://");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      fullName: String(formData.get("fullName") || "").trim() || null,
      phone: String(formData.get("phone") || "").trim() || null,
      webhookUrl: webhookUrl || null,
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

/* ---------- Nạp tiền qua cổng quốc tế (PayPal / Stripe) ---------- */
export async function startStripeCheckoutAction(formData: FormData) {
  const user = await requireUser();
  const s = await getSettings();
  const { MIN_USD, createPendingDeposit, attachExternalId, failDeposit, stripeCreateCheckout, siteOrigin } = await import("@/lib/payments");
  if (s.stripe_enabled !== "1" || !s.stripe_secret_key) back("/dashboard/nap-tien", "err", "Stripe chưa được cấu hình");
  const usd = parseFloat(String(formData.get("usd") || "0"));
  if (!usd || usd < MIN_USD) back("/dashboard/nap-tien", "err", `Số tiền tối thiểu $${MIN_USD}`);
  const usdCents = Math.round(usd * 100);
  const amountVnd = Math.round(usd * (parseInt(s.usd_rate || "25000", 10) || 25000));
  const dep = await createPendingDeposit(user.id, "STRIPE", amountVnd, usdCents);
  const origin = await siteOrigin();
  let url = "";
  try {
    const sess = await stripeCreateCheckout(s.stripe_secret_key, {
      amountCents: usdCents,
      depositCode: dep.code,
      successUrl: `${origin}/api/payments/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/dashboard/nap-tien?err=${encodeURIComponent("Đã huỷ thanh toán Stripe")}`,
    });
    await attachExternalId(dep.id, sess.id);
    url = sess.url;
  } catch (e: any) {
    await failDeposit(dep.id, `Stripe: ${e?.message || e}`);
    back("/dashboard/nap-tien", "err", "Không tạo được phiên thanh toán Stripe, vui lòng thử lại sau");
  }
  redirect(url);
}

export async function startPaypalCheckoutAction(formData: FormData) {
  const user = await requireUser();
  const s = await getSettings();
  const { MIN_USD, createPendingDeposit, attachExternalId, failDeposit, paypalAccessToken, paypalCreateOrder, siteOrigin } = await import("@/lib/payments");
  if (s.paypal_enabled !== "1" || !s.paypal_client_id || !s.paypal_client_secret) back("/dashboard/nap-tien", "err", "PayPal chưa được cấu hình");
  const usd = parseFloat(String(formData.get("usd") || "0"));
  if (!usd || usd < MIN_USD) back("/dashboard/nap-tien", "err", `Số tiền tối thiểu $${MIN_USD}`);
  const usdCents = Math.round(usd * 100);
  const amountVnd = Math.round(usd * (parseInt(s.usd_rate || "25000", 10) || 25000));
  const dep = await createPendingDeposit(user.id, "PAYPAL", amountVnd, usdCents);
  const origin = await siteOrigin();
  let url = "";
  try {
    const token = await paypalAccessToken(s.paypal_client_id, s.paypal_client_secret, s.paypal_mode || "sandbox");
    const order = await paypalCreateOrder(token, s.paypal_mode || "sandbox", {
      amountUsd: (usdCents / 100).toFixed(2),
      depositCode: dep.code,
      returnUrl: `${origin}/api/payments/paypal/return`,
      cancelUrl: `${origin}/api/payments/paypal/cancel`,
    });
    await attachExternalId(dep.id, order.id);
    url = order.approveUrl;
  } catch (e: any) {
    await failDeposit(dep.id, `PayPal: ${e?.message || e}`);
    back("/dashboard/nap-tien", "err", "Không tạo được phiên thanh toán PayPal, vui lòng thử lại sau");
  }
  redirect(url);
}

/** Nạp USDT: khách khai số USDT + mã giao dịch (tx hash) — admin đối chiếu ví rồi duyệt ở /admin/nap-tien. */
export async function createPanelBankDepositAction(formData: FormData) {
  const user = await requireUser();
  if (!user.panelId) back("/dashboard/nap-tien", "err", "Tài khoản không thuộc gian hàng nào");
  const panel = await prisma.childPanel.findUnique({ where: { id: user.panelId } });
  if (!panel || panel.status !== "ACTIVE" || !panel.bankAccount) back("/dashboard/nap-tien", "err", "Gian hàng chưa cài tài khoản ngân hàng riêng");
  const amount = parseInt(String(formData.get("amount") || "0"));
  if (!amount || amount < 10000) back("/dashboard/nap-tien", "err", "Số tiền tối thiểu 10.000đ");
  const settings = await getSettings();
  const bonus = calcBonus(amount, settings.deposit_bonus_tiers);
  const dep = await prisma.deposit.create({
    data: { code: "TMP", userId: user.id, method: "BANK", amount, bonus, status: "PENDING", content: `Chuyển khoản ngân hàng của shop ${panel.name} — chờ chủ shop duyệt` },
  });
  await prisma.deposit.update({ where: { id: dep.id }, data: { code: genCode("NAP", dep.id) } });
  back("/dashboard/nap-tien", "msg", "Đã gửi yêu cầu — chủ gian hàng sẽ duyệt và cộng tiền sau khi nhận được chuyển khoản");
}

export async function createUsdtDepositAction(formData: FormData) {
  const user = await requireUser();
  const settings = await getSettings();
  // Khách panel: nếu chủ panel đã cài ví USDT riêng thì nạp về ví của panel (chủ panel duyệt)
  const userPanel = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId } }) : null;
  const panelUsdt = userPanel && userPanel.status === "ACTIVE" && userPanel.usdtAddress ? userPanel : null;
  if (!panelUsdt && (settings.usdt_enabled !== "1" || !settings.usdt_address)) back("/dashboard/nap-tien", "err", "Nạp USDT đang tạm đóng");
  const usdt = parseFloat(String(formData.get("usdt") || "0"));
  const txHash = String(formData.get("txHash") || "").trim();
  if (!usdt || usdt < 5) back("/dashboard/nap-tien", "err", "Số USDT tối thiểu là 5");
  if (txHash.length < 20) back("/dashboard/nap-tien", "err", "Mã giao dịch (tx hash) chưa hợp lệ");
  const rate = panelUsdt ? (panelUsdt.usdtRate || parseInt(settings.usdt_rate || "") || parseInt(settings.usd_rate || "25400")) : parseInt(settings.usdt_rate || "") || parseInt(settings.usd_rate || "25400");
  const amount = Math.round(usdt * rate);
  const bonus = calcBonus(amount, settings.deposit_bonus_tiers);
  try {
    const dep = await prisma.deposit.create({
      data: { code: "TMP", userId: user.id, method: "USDT", amount, bonus, status: "PENDING", content: txHash, externalId: `usdt:${txHash.toLowerCase()}`, usdCents: Math.round(usdt * 100) },
    });
    await prisma.deposit.update({ where: { id: dep.id }, data: { code: genCode("NAP", dep.id) } });
  } catch {
    back("/dashboard/nap-tien", "err", "Mã giao dịch này đã được khai báo trước đó");
  }
  back("/dashboard/nap-tien", "msg", "Đã ghi nhận — admin sẽ đối chiếu giao dịch USDT và cộng tiền trong ít phút");
}
