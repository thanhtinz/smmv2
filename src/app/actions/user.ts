"use server";
import { hashPassword, verifyPassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";
import { lockdownState, userCanBypassLockdown, lockdownMessage } from "@/lib/lockdown";
import { prisma } from "@/lib/db";
import { cleanAttachments } from "@/lib/attachments";
import { requireUser, currentIp } from "@/lib/auth";
import { createSmmOrder, createPremiumOrder } from "@/lib/orders";
import { notifyUser } from "@/lib/notify";
import { applyBalance } from "@/lib/wallet";
import { getSettings, calcBonus, bonusTiersFor, usdtRateOf } from "@/lib/settings";
import { moduleOn } from "@/lib/modules";
import { rateLimitExceeded } from "@/lib/rate-limit";
import { passwordError } from "@/lib/security";
import { randomKey, genCode, parsePremiumFields } from "@/lib/format";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";


function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

/** GĐ2: khoá khẩn cấp — chặn khách thường đặt đơn/nạp/mua, quản trị được miễn */
async function lockdownBlock(user: { id: number; role: string }, path: string) {
  const ld = await lockdownState();
  if (ld.on && !(await userCanBypassLockdown(user))) back(path, "err", lockdownMessage(ld.reason));
}

/** GĐ3: tài khoản rủi ro cao (>= ngưỡng hạn chế, chưa được duyệt lại) không tạo
 *  đơn/nạp mới được — lớp chặn ở action cho thông báo thân thiện, lớp chính ở lib/orders. */
async function riskBlock(user: { id: number }, path: string) {
  const { isRiskRestricted, RISK_RESTRICT_MESSAGE } = await import("@/lib/risk");
  if (await isRiskRestricted(user.id)) back(path, "err", RISK_RESTRICT_MESSAGE);
}

export async function placeSmmOrderAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`ordsmm|${user.id}`, 60, 60000)) back("/dashboard/dat-hang", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  if ((await getSettings()).module_smm === "0") back("/dashboard/dat-hang", "err", "Đặt đơn SMM đang tạm ngưng");
  await lockdownBlock(user, "/dashboard/dat-hang");
  await riskBlock(user, "/dashboard/dat-hang");
  const serviceId = parseInt(String(formData.get("serviceId") || "0"));
  // campaignId lấy từ form phải là chiến dịch của CHÍNH người đặt — không kiểm
  // là gắn được đơn của mình vào thống kê/ngân sách chiến dịch của người khác.
  const rawCampaignId = parseInt(String(formData.get("campaignId") || "0")) || 0;
  let campaignId: number | undefined;
  if (rawCampaignId) {
    const own = await prisma.campaign.findFirst({ where: { id: rawCampaignId, userId: user.id }, select: { id: true } });
    if (own) campaignId = own.id;
  }
  // Toggle "Nhiều link": mỗi dòng của ô links là 1 đơn riêng (trùng dòng thì gộp 1)
  const multiLinks = Array.from(new Set(String(formData.get("links") || "").split("\n").map((l) => l.trim()).filter(Boolean)));
  const link = String(formData.get("link") || "") || multiLinks[0] || "";
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
  // Schedule / Loop (gói định kỳ) ĐÃ GỠ khỏi khu khách (lệnh Tín 2026-11-07): form cũ
  // còn gửi cờ schedule/loop thì báo rõ đã ngừng hỗ trợ thay vì tạo gói không chạy.
  if (formData.get("schedule") === "1" || formData.get("loop") === "1") {
    back("/dashboard/dat-hang", "err", "Tính năng đặt lịch / lặp lại đã ngừng hỗ trợ — vui lòng đặt đơn trực tiếp.");
  }
  // Chế độ nhiều link: tạo lần lượt từng đơn độc lập; mã giảm giá chỉ áp cho đơn đầu tiên
  if (multiLinks.length > 1) {
    const maxLinks = await orderMaxLinksFor(user.id);
    if (multiLinks.length > maxLinks) back("/dashboard/dat-hang", "err", `Tối đa ${maxLinks} link mỗi lần đặt`);
    const codes: string[] = [];
    const errors: string[] = [];
    for (let i = 0; i < multiLinks.length; i++) {
      try {
        const fresh = (await prisma.user.findUnique({ where: { id: user.id } }))!;
        const order = await createSmmOrder({ user: fresh, serviceId, link: multiLinks[i], quantity, note, extra, dripfeed, silentNotify: true, promoCode: i === 0 ? String(formData.get("promoCode") || "") || undefined : undefined, campaignId });
        codes.push(order.code);
      } catch (e: any) {
        errors.push(`link ${i + 1}: ${String(e?.message || "lỗi")}`);
      }
    }
    if (codes.length > 0) await notifyUser(user.id, "Đặt đơn thành công", `Đã đặt ${codes.length} đơn: ${codes.join(", ")}`, "/dashboard/don-hang");
    if (codes.length === 0) back("/dashboard/dat-hang", "err", `Đặt thất bại cả ${multiLinks.length} link — ${errors[0] || ""}`);
    back("/dashboard/don-hang", "msg", `Đã đặt ${codes.length}/${multiLinks.length} đơn: ${codes.join(", ")}${errors.length ? ` — lỗi ở ${errors.slice(0, 3).join("; ")}` : ""}`);
  }
  try {
    const fresh = (await prisma.user.findUnique({ where: { id: user.id } }))!;
    const order = await createSmmOrder({ user: fresh, serviceId, link, quantity, note, extra, dripfeed, promoCode: String(formData.get("promoCode") || "") || undefined, campaignId });
    back("/dashboard/don-hang", "msg", `Đặt đơn ${order.code} thành công — trạng thái: ${order.status === "REFUNDED" ? "provider từ chối, đã hoàn tiền" : "đang xử lý"}`);
  } catch (e: any) {
    if (String((e as any)?.digest || "").startsWith("NEXT_REDIRECT")) throw e; // back()/done() ném redirect — không được nuốt thành thông báo lỗi
    back("/dashboard/dat-hang", "err", String(e?.message || "Đặt đơn thất bại"));
  }
}

/**
 * Đặt hàng loạt (bulk orders): mỗi dòng "service_id | link | quantity" là một đơn riêng.
 * Xử lý từng dòng độc lập — dòng lỗi không chặn các dòng còn lại; trả về tóm tắt.
 */
export async function bulkPlaceOrdersAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`ordbulk|${user.id}`, 10, 60000)) back("/dashboard/dat-hang", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  await lockdownBlock(user, "/dashboard/dat-hang");
  await riskBlock(user, "/dashboard/dat-hang");
  if (!(await moduleOn("bulk"))) back("/dashboard/dat-hang-loat", "err", "Tính năng đặt hàng loạt đang tắt");
  const raw = String(formData.get("bulk") || "");
  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) back("/dashboard/dat-hang-loat", "err", "Chưa có dòng nào để đặt");
  const maxLines = await orderMaxLinksFor(user.id);
  if (lines.length > maxLines) back("/dashboard/dat-hang-loat", "err", `Tối đa ${maxLines} dòng mỗi lần đặt hàng loạt`);
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
      const order = await createSmmOrder({ user: fresh, serviceId, link, quantity, silentNotify: true });
      ok++;
      codes.push(order.code);
    } catch (e: any) {
      errors.push(`dòng ${i + 1}: ${String(e?.message || "lỗi")}`);
    }
  }
  await prisma.apiLog.create({ data: { kind: "bulk_order", ref: fresh.username, ok: errors.length === 0, detail: `ok=${ok}/${lines.length} codes=${codes.join(",")}` } });
  if (ok > 0) await notifyUser(fresh.id, "Đặt đơn thành công", `Đặt hàng loạt: ${ok}/${lines.length} đơn thành công (${codes.slice(0, 5).join(", ")}${codes.length > 5 ? "…" : ""})`, "/dashboard/don-hang");
  if (ok === 0) back("/dashboard/dat-hang-loat", "err", `Không đặt được đơn nào. ${errors.slice(0, 3).join("; ")}`);
  const tail = errors.length ? ` ${errors.length} dòng lỗi: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}` : "";
  back("/dashboard/don-hang", "msg", `Đặt hàng loạt xong: ${ok}/${lines.length} đơn thành công (${codes.slice(0, 5).join(", ")}${codes.length > 5 ? "…" : ""}).${tail}`);
}

export async function buyPremiumAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`ordpre|${user.id}`, 60, 60000)) back("/dashboard/premium", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  if ((await getSettings()).module_premium === "0") back("/premium", "err", "Mảng Premium đang tạm ngưng");
  await lockdownBlock(user, "/dashboard/premium");
  await riskBlock(user, "/dashboard/premium");
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
    if (String((e as any)?.digest || "").startsWith("NEXT_REDIRECT")) throw e; // back()/done() ném redirect — không được nuốt thành thông báo lỗi
    const rt = String(formData.get("returnTo") || "");
    const errTarget = rt.startsWith("/dashboard/premium/") || rt.startsWith("/premium/") ? rt : slug ? `/premium/${slug}` : "/premium";
    back(errTarget, "err", String(e?.message || "Mua thất bại"));
  }
}

export async function createDepositAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`dep|${user.id}`, 10, 3600000)) back("/dashboard/nap-tien", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  await lockdownBlock(user, "/dashboard/nap-tien");
  await riskBlock(user, "/dashboard/nap-tien");
  const amount = parseInt(String(formData.get("amount") || "0"));
  const method = String(formData.get("method") || "BANK") as any;
  // Chỉ BANK/MOMO là nạp tay chờ duyệt — cổng tự động (Stripe/PayPal/USDT) có
  // action riêng; nhận method lạ từ form là tạo yêu cầu nạp giả gây nhiễu hàng duyệt.
  if (!["BANK", "MOMO"].includes(method)) back("/dashboard/nap-tien", "err", "Phương thức nạp không hợp lệ");
  const settings = await getSettings();
  const min = parseInt(settings.deposit_min);
  if (!amount || amount < min) back("/dashboard/nap-tien", "err", `Số tiền nạp tối thiểu là ${min.toLocaleString("vi-VN")}đ`);
  const bonus = calcBonus(amount, bonusTiersFor(null, false, settings.deposit_bonus_tiers));
  const dep = await prisma.deposit.create({
    data: { code: "TMP", userId: user.id, method, amount, bonus, status: "PENDING", content: `SMM ${user.depositCode}` },
  });
  const depCode = genCode("NAP", dep.id);
  await prisma.deposit.update({ where: { id: dep.id }, data: { code: depCode } });
  void (async () => {
    const { alertMother } = await import("@/lib/alerts");
    await alertMother("deposit_pending", `Yêu cầu nạp chờ duyệt ${depCode}`, `${user.username} · ${method} · ${amount.toLocaleString("vi-VN")}đ`);
  })();
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
  if (rateLimitExceeded(`ticket|${user.id}`, 30, 3600000)) back("/dashboard/ticket", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  if (!(await moduleOn("tickets"))) back("/dashboard/ticket", "err", "Tính năng hỗ trợ / ticket đang tắt");
  const subject = String(formData.get("subject") || "").trim();
  const category = String(formData.get("category") || "other");
  const body = String(formData.get("body") || "").trim();
  if (!subject || !body) back("/dashboard/ticket", "err", "Nhập đủ tiêu đề và nội dung");
  const attachments = cleanAttachments(formData.get("attachments"));
  const t = await prisma.ticket.create({
    data: { userId: user.id, subject, category, messages: { create: { body, attachments } } },
  });
  void (async () => {
    const { alertMother } = await import("@/lib/alerts");
    await alertMother("ticket", `Ticket mới #${t.id}`, `${user.username}: ${subject}`);
  })();
  redirect(`/dashboard/ticket/${t.id}`);
}

export async function replyTicketAction(formData: FormData) {
  const user = await requireUser();
  const ticketId = parseInt(String(formData.get("ticketId") || "0"));
  const body = String(formData.get("body") || "").trim();
  const t = await prisma.ticket.findFirst({ where: { id: ticketId, userId: user.id } });
  if (!t || !body) redirect("/dashboard/ticket");
  await prisma.ticketMessage.create({ data: { ticketId, body, attachments: cleanAttachments(formData.get("attachments")) } });
  await prisma.ticket.update({ where: { id: ticketId }, data: { status: "OPEN" } });
  revalidatePath(`/dashboard/ticket/${ticketId}`);
  redirect(`/dashboard/ticket/${ticketId}`);
}

export async function regenApiKeyAction() {
  const user = await requireUser();
  if (rateLimitExceeded(`regenkey|${user.id}`, 5, 3600000)) back("/dashboard/ho-so", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  await prisma.user.update({ where: { id: user.id }, data: { apiKey: randomKey(32) } });
  await writeAudit({ actorId: user.id, actorName: user.username, role: user.role, action: "apikey.regen", targetType: "user", targetId: user.id, detail: "Tạo mới API key (key cũ vô hiệu)", ip: currentIp() });
  back("/dashboard/api", "msg", "Đã tạo API key mới. Key cũ đã bị vô hiệu ngay lập tức.");
}

/** GĐ3: whitelist IP cho API key — chỉ các IP/CIDR trong danh sách mới gọi được
 *  /api/v2 bằng key của tài khoản này; để trống = không giới hạn. */
export async function saveApiKeyIpsAction(formData: FormData) {
  const user = await requireUser();
  const { parseIpList, ipMatchesRule } = await import("@/lib/ip-match");
  const raw = String(formData.get("apiKeyIps") || "").slice(0, 2000);
  const rules = parseIpList(raw);
  if (rules.length > 50) back("/dashboard/ho-so?tab=api", "err", "Tối đa 50 dòng IP/CIDR");
  for (const r of rules) {
    // Kiểm tra cú pháp bằng chính matcher: địa chỉ nền phải tự khớp luật của nó
    // (IP đơn khớp chính nó; nền CIDR nằm trong dải của nó; IPv6 khớp chuỗi chính xác)
    if (!ipMatchesRule(r.split("/")[0], r)) {
      back("/dashboard/ho-so?tab=api", "err", `Dòng IP/CIDR không hợp lệ: ${r}`);
    }
  }
  const value = rules.join("\n");
  await prisma.user.update({ where: { id: user.id }, data: { apiKeyIps: value || null } });
  await writeAudit({
    actorId: user.id, actorName: user.username, role: user.role,
    scope: "mother", panelId: null,
    action: "apikey.ip_whitelist", targetType: "user", targetId: user.id,
    detail: value ? `Đặt whitelist IP cho API key: ${rules.length} dòng` : "Xoá whitelist IP cho API key (không giới hạn)",
    ip: currentIp(),
  });
  back("/dashboard/ho-so?tab=api", "msg", value ? "Đã lưu whitelist IP cho API key" : "Đã xoá whitelist IP — API key gọi được từ mọi IP");
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  const webhookUrl = String(formData.get("webhookUrl") || "").trim();
  if (webhookUrl && !/^https?:\/\/.+/i.test(webhookUrl)) back("/dashboard/ho-so", "err", "Webhook URL phải bắt đầu bằng http:// hoặc https://");
  const newEmail = String(formData.get("email") || "").trim().toLowerCase();
  const data: Record<string, unknown> = {
    fullName: String(formData.get("fullName") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    webhookUrl: webhookUrl || null,
  };
  let emailChanged = false;
  if (newEmail && newEmail !== user.email) {
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) back("/dashboard/ho-so", "err", "Email không hợp lệ");
    const dup = await prisma.user.findFirst({ where: { email: newEmail, id: { not: user.id } } });
    if (dup) back("/dashboard/ho-so", "err", "Email này đã được tài khoản khác sử dụng");
    data.email = newEmail;
    data.emailVerified = false; // đổi email = phải xác thực lại
    emailChanged = true;
  }
  await prisma.user.update({ where: { id: user.id }, data });
  if (emailChanged) {
    const { issueEmailVerification } = await import("@/lib/email-verify");
    await issueEmailVerification({ id: user.id, email: newEmail, username: user.username });
    back("/dashboard/ho-so", "msg", "Đã đổi email — hãy mở hộp thư để xác thực email mới");
  }
  back("/dashboard/ho-so", "msg", "Đã cập nhật hồ sơ");
}

/** Gửi lại email xác thực cho chính khách. */
export async function resendEmailVerificationAction() {
  const user = await requireUser();
  if (user.emailVerified) back("/dashboard/ho-so", "msg", "Email của bạn đã được xác thực");
  if (rateLimitExceeded(`verify-mail|${user.id}`, 5, 3600000)) back("/dashboard/ho-so", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  const { issueEmailVerification } = await import("@/lib/email-verify");
  await issueEmailVerification({ id: user.id, email: user.email, username: user.username });
  back("/dashboard/ho-so", "msg", "Đã tạo liên kết xác thực — nếu đã cấu hình SMTP, email sẽ được gửi tới hộp thư của bạn");
}

/** Lưu tuỳ chỉnh loại thông báo (chuông trên web). */
export async function saveNotifyPrefsAction(formData: FormData) {
  const user = await requireUser();
  const keys = ["order", "deposit", "refund", "promo", "system", "ticket"];
  const prefs: Record<string, boolean> = {};
  for (const k of keys) prefs[k] = formData.get(`np_${k}`) === "1";
  await prisma.user.update({ where: { id: user.id }, data: { notifyPrefs: JSON.stringify(prefs) } });
  back("/dashboard/thong-bao", "msg", "Đã lưu tuỳ chỉnh thông báo");
}

/** Đổi điểm tích luỹ ra số dư ví theo tỉ lệ setting points_value_vnd. */
export async function redeemPointsAction(formData: FormData) {
  const user = await requireUser();
  const s = await getSettings();
  const minRedeem = Math.max(1, parseInt(s.points_min_redeem || "10") || 10);
  const value = Math.max(1, parseInt(s.points_value_vnd || "100") || 100);
  const want = Math.floor(parseInt(String(formData.get("points") || "0")) || 0);
  if (want < minRedeem) back("/dashboard/ho-so", "err", `Tối thiểu đổi ${minRedeem} điểm mỗi lần`);
  const amount = want * value;
  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.user.updateMany({ where: { id: user.id, points: { gte: want } }, data: { points: { decrement: want } } });
      if (claim.count === 0) throw new Error("Số điểm không đủ");
      await applyBalance(tx, user.id, amount, "POINTS", undefined, `Đổi ${want} điểm ra số dư`);
    });
  } catch (e: any) {
    back("/dashboard/ho-so", "err", String(e?.message || "Đổi điểm thất bại"));
  }
  back("/dashboard/ho-so", "msg", `Đã đổi ${want} điểm thành ${amount.toLocaleString("vi-VN")}đ vào số dư`);
}

/** Khách chấm sao hỗ trợ cho ticket ĐÃ ĐÓNG. */
export async function rateTicketAction(formData: FormData) {
  const user = await requireUser();
  const ticketId = parseInt(String(formData.get("ticketId") || "0"));
  const rating = Math.min(5, Math.max(1, parseInt(String(formData.get("rating") || "0")) || 0));
  const note = String(formData.get("ratingNote") || "").trim().slice(0, 255);
  const t = await prisma.ticket.findFirst({ where: { id: ticketId, userId: user.id } });
  if (!t) redirect("/dashboard/ticket");
  if (t.status !== "CLOSED") back(`/dashboard/ticket/${ticketId}`, "err", "Chỉ chấm điểm được khi ticket đã đóng");
  if (!rating) back(`/dashboard/ticket/${ticketId}`, "err", "Hãy chọn số sao");
  await prisma.ticket.update({ where: { id: ticketId }, data: { rating, ratingNote: note || null } });
  back(`/dashboard/ticket/${ticketId}`, "msg", "Cảm ơn bạn đã đánh giá hỗ trợ");
}

/** Khách xác nhận điều khoản sử dụng (Cài đặt → Thông báo) — ghi phiên bản đã xác nhận. */
export async function acceptTermsAction() {
  const user = await requireUser();
  const s = await getSettings();
  await prisma.user.update({ where: { id: user.id }, data: { termsAcceptedVersion: parseInt(s.terms_version || "1") || 1 } });
  redirect("/");
}

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`pwchange|${user.id}`, 5, 3600000)) back("/dashboard/ho-so", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  const old = String(formData.get("oldPassword") || "");
  const next = String(formData.get("newPassword") || "");
  const confirmPw = String(formData.get("newPassword2") || "");
  if (confirmPw && confirmPw !== next) back("/dashboard/ho-so", "err", "Mật khẩu mới nhập lại không khớp");
  const pwErr = passwordError(next, await getSettings());
  if (pwErr) back("/dashboard/ho-so", "err", pwErr);
  const fresh = (await prisma.user.findUnique({ where: { id: user.id } }))!;
  if (!(await verifyPassword(fresh.passwordHash, old))) back("/dashboard/ho-so", "err", "Mật khẩu hiện tại không đúng");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), sessionVersion: { increment: 1 } } });
    // GĐ2: đổi mật khẩu -> thu hồi mọi dòng phiên đã ghi (JWT cũ cũng chết theo sessionVersion)
    await tx.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  });
  back("/dashboard/ho-so", "msg", "Đã đổi mật khẩu");
}

export async function warrantyAction(formData: FormData) {
  const user = await requireUser();
  const orderId = parseInt(String(formData.get("orderId") || "0"));
  const note = String(formData.get("note") || "").trim();
  const o = await prisma.premiumOrder.findFirst({ where: { id: orderId, userId: user.id } });
  if (!o) redirect("/dashboard/don-premium");
  // Chỉ đơn đã giao/hoàn thành mới vào bảo hành được — đơn đã hoàn tiền hoặc đã
  // huỷ mà "hồi sinh" qua bảo hành sẽ được giao lại hàng trong khi tiền đã về ví.
  if (o.status !== "DELIVERED" && o.status !== "COMPLETED") back("/dashboard/don-premium", "err", "Chỉ đơn đã giao mới yêu cầu bảo hành được");
  await prisma.premiumOrder.update({
    where: { id: orderId },
    data: { status: "WARRANTY", adminNote: `${o.adminNote ? o.adminNote + "\n" : ""}[Bảo hành] ${note || "Khách yêu cầu bảo hành"} (${new Date().toLocaleString("vi-VN")})` },
  });
  back("/dashboard/don-premium", "msg", `Đã gửi yêu cầu bảo hành cho đơn ${o.code}`);
}

/* ---------- Nạp tiền qua cổng quốc tế (PayPal / Stripe) ---------- */
export async function startStripeCheckoutAction(formData: FormData) {
  const user = await requireUser();
  await lockdownBlock(user, "/dashboard/nap-tien");
  await riskBlock(user, "/dashboard/nap-tien");
  if (rateLimitExceeded(`dep|${user.id}`, 10, 3600000)) back("/dashboard/nap-tien", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  const { MIN_USD, createPendingDeposit, attachExternalId, failDeposit, stripeCreateCheckout, siteOrigin, resolveIntlConfig } = await import("@/lib/payments");
  const cfg = await resolveIntlConfig(user.id);
  if (!cfg.stripe) back("/dashboard/nap-tien", "err", "Stripe chưa được cấu hình");
  const usd = parseFloat(String(formData.get("usd") || "0"));
  const minUsd = cfg.minUsd || MIN_USD;
  if (!usd || usd < minUsd) back("/dashboard/nap-tien", "err", `Số tiền tối thiểu $${minUsd}`);
  const usdCents = Math.round(usd * 100);
  const amountVnd = Math.round(usd * cfg.rate);
  const dep = await createPendingDeposit(user.id, "STRIPE", amountVnd, usdCents);
  const origin = await siteOrigin();
  let url = "";
  try {
    const sess = await stripeCreateCheckout(cfg.stripe.secretKey, {
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
  await lockdownBlock(user, "/dashboard/nap-tien");
  await riskBlock(user, "/dashboard/nap-tien");
  if (rateLimitExceeded(`dep|${user.id}`, 10, 3600000)) back("/dashboard/nap-tien", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  const { MIN_USD, createPendingDeposit, attachExternalId, failDeposit, paypalAccessToken, paypalCreateOrder, siteOrigin, resolveIntlConfig } = await import("@/lib/payments");
  const cfg = await resolveIntlConfig(user.id);
  if (!cfg.paypal) back("/dashboard/nap-tien", "err", "PayPal chưa được cấu hình");
  const usd = parseFloat(String(formData.get("usd") || "0"));
  const minUsd = cfg.minUsd || MIN_USD;
  if (!usd || usd < minUsd) back("/dashboard/nap-tien", "err", `Số tiền tối thiểu $${minUsd}`);
  const usdCents = Math.round(usd * 100);
  const amountVnd = Math.round(usd * cfg.rate);
  const dep = await createPendingDeposit(user.id, "PAYPAL", amountVnd, usdCents);
  const origin = await siteOrigin();
  let url = "";
  try {
    const token = await paypalAccessToken(cfg.paypal.clientId, cfg.paypal.secret, cfg.paypal.mode);
    const order = await paypalCreateOrder(token, cfg.paypal.mode, {
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

/** Nạp USDT qua BoltUtil: khách nhập số tiền VND + chọn mạng — hệ thống tạo
 *  đơn phía BoltUtil (externalOrderId = DEP<id>), khách trả USDT trên trang
 *  thanh toán của cổng hoặc chuyển tay đúng địa chỉ/số lượng; tiền cộng tự động
 *  khi BoltUtil báo CONFIRMED (webhook hoặc cron đối soát). */
export async function createBoltDepositAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`dep|${user.id}`, 10, 3600000)) back("/dashboard/nap-tien", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  await lockdownBlock(user, "/dashboard/nap-tien");
  await riskBlock(user, "/dashboard/nap-tien");
  const settings = await getSettings();
  const { getBoltConfig, boltCreateOrder, boltEnabledNetworks } = await import("@/lib/boltutil");
  const cfg = await getBoltConfig();
  if (!cfg.enabled) back("/dashboard/nap-tien", "err", "Phương thức nạp USDT hiện không khả dụng");
  const amountVnd = parseInt(String(formData.get("vnd") || "0")) || 0;
  const enabledNetworks = boltEnabledNetworks(settings);
  const networkRaw = String(formData.get("network") || cfg.defaultNetwork).toUpperCase();
  const network = enabledNetworks.includes(networkRaw) ? networkRaw : (enabledNetworks.includes(cfg.defaultNetwork) ? cfg.defaultNetwork : enabledNetworks[0]);
  const rate = usdtRateOf(settings);
  const usd = Math.round((amountVnd / rate) * 100) / 100;
  const minUsdt = parseFloat(settings.usdt_min || "") || 5;
  if (amountVnd < 10000) back("/dashboard/nap-tien", "err", "Số tiền nạp tối thiểu là 10.000đ");
  if (!usd || usd < Math.max(minUsdt, 0.01)) back("/dashboard/nap-tien", "err", `Số USDT tối thiểu mỗi lần nạp là ${Math.max(minUsdt, 0.01)} USDT`);
  const dep = await prisma.deposit.create({
    data: {
      code: "TMP", userId: user.id, method: "USDT", amount: amountVnd, bonus: 0, status: "PENDING", auto: true,
      content: network, usdCents: Math.round(usd * 100),
      providerData: JSON.stringify({ rateVndPerUsd: rate, network, currency: "USDT", boltStatus: "CREATING" }),
    },
  });
  const code = genCode("NAP", dep.id);
  const externalOrderId = code; // externalOrderId phía BoltUtil = mã nạp của mình
  await prisma.deposit.update({ where: { id: dep.id }, data: { code, externalId: `bolt:${externalOrderId}` } });
  try {
    const order = await boltCreateOrder(cfg, { externalOrderId, amountUsd: usd, network });
    await prisma.deposit.update({
      where: { id: dep.id },
      data: {
        providerRef: order.orderId || null,
        providerData: JSON.stringify({
          rateVndPerUsd: rate, network, currency: "USDT", externalOrderId,
          checkoutUrl: order.checkoutUrl || order.paymentUrl || null,
          paymentAddress: order.paymentAddress || null,
          cryptoAmount: order.cryptoAmount != null ? String(order.cryptoAmount) : null,
          expiresAt: order.expiresAt || null,
          boltStatus: order.status || "PENDING",
        }),
      },
    });
  } catch (e: any) {
    const { failDeposit } = await import("@/lib/payments");
    await failDeposit(dep.id, `BoltUtil tạo đơn thất bại: ${String(e?.message || e).slice(0, 160)}`);
    back("/dashboard/nap-tien", "err", "Hệ thống nạp USDT đang bận, vui lòng thử lại sau ít phút");
  }
  back("/dashboard/nap-tien", "msg", `Đã tạo phiên nạp ${code} — chuyển USDT theo hướng dẫn bên dưới, tiền cộng tự động khi xác nhận xong`);
}

/** Trần link mỗi lần đặt theo cấu hình chung. */
async function orderMaxLinksFor(userId: number): Promise<number> {
  return parseInt((await getSettings()).order_max_links) || 50;
}

/** Đánh giá sản phẩm Premium — CHỈ khách đã mua (đơn không huỷ/hoàn tiền) mới
 *  được gửi; mỗi khách 1 đánh giá cho mỗi sản phẩm, gửi lại là sửa. */
export async function submitPremiumReviewAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`review|${user.id}`, 30, 3600000)) back("/dashboard/premium", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  const slug = String(formData.get("slug") || "");
  const returnToRaw = String(formData.get("returnTo") || "");
  const returnTo = returnToRaw.startsWith("/dashboard/premium/") || returnToRaw.startsWith("/premium/") ? returnToRaw : `/dashboard/premium/${slug}`;
  const product = await prisma.premiumProduct.findUnique({ where: { slug }, select: { id: true, variants: { select: { id: true } } } });
  if (!product) back(returnTo, "err", "Không tìm thấy sản phẩm");
  const bought = await prisma.premiumOrder.findFirst({
    where: { userId: user.id, variantId: { in: product.variants.map((v) => v.id) }, status: { notIn: ["CANCELED", "REFUNDED"] } },
    select: { id: true },
  });
  if (!bought) back(returnTo, "err", "Chỉ khách đã mua sản phẩm mới được đánh giá");
  const rating = Math.min(5, Math.max(1, parseInt(String(formData.get("rating") || "5")) || 5));
  const content = String(formData.get("content") || "").trim().slice(0, 1000);
  if (content.length < 3) back(returnTo, "err", "Vui lòng viết vài dòng nhận xét về sản phẩm");
  await prisma.premiumReview.upsert({
    where: { productId_userId: { productId: product.id, userId: user.id } },
    create: { productId: product.id, userId: user.id, rating, content },
    update: { rating, content },
  });
  revalidatePath(returnTo);
  back(returnTo, "msg", "Cảm ơn bạn đã đánh giá sản phẩm");
}

/** Đánh dấu "Hữu ích" cho một đánh giá Premium — mỗi tài khoản 1 lần, bấm lại là bỏ. */
export async function toggleReviewHelpfulAction(reviewId: number) {
  const user = await requireUser();
  if (rateLimitExceeded(`helpful|${user.id}`, 120, 3600000)) return;
  const existing = await prisma.premiumReviewHelpful.findUnique({
    where: { reviewId_userId: { reviewId, userId: user.id } },
    select: { id: true },
  });
  if (existing) await prisma.premiumReviewHelpful.delete({ where: { id: existing.id } });
  else await prisma.premiumReviewHelpful.create({ data: { reviewId, userId: user.id } });
}
