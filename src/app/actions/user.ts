"use server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { cleanAttachments } from "@/lib/attachments";
import { requireUser } from "@/lib/auth";
import { createSmmOrder, createPremiumOrder } from "@/lib/orders";
import { notifyUser } from "@/lib/notify";
import { applyBalance } from "@/lib/wallet";
import { getSettings, calcBonus, bonusTiersFor, usdtRateOf } from "@/lib/settings";
import { moduleOn } from "@/lib/modules";
import { getPanelAccess } from "@/lib/panel-access";
import { rateLimitExceeded } from "@/lib/rate-limit";
import { passwordError } from "@/lib/security";
import { randomKey, genCode, parsePremiumFields } from "@/lib/format";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function panelPeriodMs(): Promise<number> {
  const days = Math.max(1, parseInt((await getSettings()).panel_period_days || "") || 30);
  return days * 86400000;
}

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}

export async function placeSmmOrderAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`ordsmm|${user.id}`, 60, 60000)) back("/dashboard/dat-hang", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  if ((await getSettings()).module_smm === "0") back("/dashboard/dat-hang", "err", "Đặt đơn SMM đang tạm ngưng");
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
  if (!(await moduleOn("bulk", user.panelId))) back("/dashboard/dat-hang-loat", "err", "Tính năng đặt hàng loạt đang tắt");
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

/* ---------- Panel con (child panel) ---------- */
const RESERVED_SLUGS = ["admin", "api", "dashboard", "cua-hang", "login", "register", "dich-vu", "premium", "manifest.webmanifest", "icon.svg"];
const PANEL_ACCENTS = ["blue", "violet", "emerald", "orange", "rose", "teal"];

function panelSlug(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** API key nhập ở trang setup lần đầu: key của tài khoản mẹ mà panel liên kết.
 *  Để trống = dùng key của chính chủ panel. Trả null nếu key không tồn tại. */
async function panelApiLink(formData: FormData, fallback: { apiKey: string | null; apiUserId: number | null }, allowedOwnerIds: number[] = []) {
  const key = String(formData.get("apiKey") || "").trim();
  if (!key) return fallback;
  const owner = await prisma.user.findUnique({ where: { apiKey: key } });
  if (!owner) return null;
  // Chỉ liên kết được key của CHÍNH mình (hoặc tài khoản đã liên kết sẵn / tài
  // khoản quản trị của chính panel) — dán key của người khác là tiêu tiền của họ.
  if (!allowedOwnerIds.includes(owner.id)) return null;
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

/** Phí tạo website con áp cho một tài khoản: khách của panel nào thì theo phí panel
 *  đó tự đặt (tiền thuộc về chủ panel); khách web mẹ thì theo phí trong Cấu hình của mẹ. */
async function panelCreationFeeFor(userId: number) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { panelId: true, balance: true } });
  if (u?.panelId) {
    const parent = await prisma.childPanel.findUnique({ where: { id: u.panelId }, select: { id: true, panelFee: true, ownerId: true, name: true } });
    if (parent) return { fee: Math.max(0, parent.panelFee || 0), parent, balance: u.balance };
  }
  const settings = await getSettings();
  return { fee: Math.max(0, parseInt(settings.panel_fee || "0") || 0), parent: null as null | { id: number; panelFee: number; ownerId: number; name: string }, balance: u?.balance ?? 0 };
}

/** Trừ phí tạo website con trong cùng giao dịch tạo panel; khách panel tạo thì chủ
 *  panel được cộng đúng số phí đó (loại giao dịch PANEL_FEE). */
async function chargePanelCreation(tx: any, user: { id: number; username: string }, feeInfo: { fee: number; parent: { id: number; ownerId: number } | null }, panelId: number, label: string) {
  if (feeInfo.fee <= 0) return;
  await applyBalance(tx, user.id, -feeInfo.fee, "PANEL_FEE", `PANEL-${panelId}`, `Phí tạo website con ${label}`);
  if (feeInfo.parent) {
    await applyBalance(tx, feeInfo.parent.ownerId, feeInfo.fee, "PANEL_FEE", `PANEL-${panelId}`, `Thu phí tạo website con từ khách ${user.username}`);
  }
}

export async function createPanelAction(formData: FormData) {
  const user = await requireUser();
  if ((await getSettings()).module_panels === "0") back("/dashboard", "err", "Tính năng mở panel con đang tạm đóng");
  const name = String(formData.get("name") || "").trim();
  const slug = panelSlug(String(formData.get("slug") || ""));
  const markup = Math.min(200, Math.max(0, parseInt(String(formData.get("markup") || (await getSettings()).panel_default_markup || "20")) || 0));
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
  const link = await panelApiLink(formData, { apiKey: me?.apiKey || null, apiUserId: user.id }, [user.id]);
  if (!link) back("/dashboard/panel-cua-toi/thiet-lap", "err", "API key không hợp lệ — hãy dán key của tài khoản mẹ (lấy tại mục API đại lý)");
  const feeInfo = await panelCreationFeeFor(user.id);
  if (feeInfo.fee > feeInfo.balance) back("/dashboard/panel-cua-toi/thiet-lap", "err", `Số dư không đủ để tạo website con — phí tạo là ${feeInfo.fee.toLocaleString("vi-VN")}₫, số dư hiện tại ${feeInfo.balance.toLocaleString("vi-VN")}₫`);
  await prisma.$transaction(async (tx) => {
    const created = await tx.childPanel.create({
    data: {
      ownerId: user.id, name, slug, markup, accent, tagline, support, domain: domainRaw, parentPanelId: feeInfo.parent?.id ?? null, expiresAt: feeInfo.fee > 0 ? new Date(Date.now() + (await panelPeriodMs())) : null, 
      apiKey: link.apiKey, apiUserId: link.apiUserId,
      ...panelDiscounts(formData),
      setupDone: formData.get("setupDone") === "1",
    },
    });
    await chargePanelCreation(tx, user, feeInfo, created.id, name);
  });
  back("/panel-admin", "msg", `Đã tạo panel ${name} — website của bạn: /cua-hang/${slug}`);
}

/** Đăng ký website con đúng mô hình panel mẫu (thatim): form chỉ có 1 ô TÊN MIỀN —
 *  không đường dẫn kiểu /cua-hang, không tên/slug cho khách nhập. Tên + slug hệ thống
 *  tự suy từ tên miền; API tự liên kết bằng key của chính chủ panel; việc tuỳ chỉnh
 *  (logo, màu, giá bán, API token) làm tiếp ngay trên website con. */
export async function registerChildSiteAction(formData: FormData) {
  const user = await requireUser();
  if ((await getSettings()).module_panels === "0") back("/dashboard/panel-cua-toi", "err", "Tính năng mở website con đang tạm đóng");
  const domain = String(formData.get("domain") || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (domain.length < 4 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    back("/dashboard/panel-cua-toi", "err", "Tên miền chưa hợp lệ — chỉ chứa chữ thường, số, dấu chấm và gạch ngang (vd: myshop.vn)");
  }
  const dup = await prisma.childPanel.findFirst({ where: { domain } });
  if (dup) back("/dashboard/panel-cua-toi", "err", "Tên miền này đã được đăng ký cho website con khác");
  let slug = panelSlug(domain);
  if (slug.length < 3) slug = `site-${user.id}`;
  if (RESERVED_SLUGS.includes(slug) || (await prisma.childPanel.findUnique({ where: { slug } }))) slug = `${slug}-${user.id}`;
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { apiKey: true } });
  const link = await panelApiLink(formData, { apiKey: me?.apiKey || null, apiUserId: user.id }, [user.id]);
  if (!link) back("/dashboard/panel-cua-toi", "err", "Không liên kết được API — vui lòng thử lại sau");
  const linkedKey = link ? link.apiKey : null;
  const linkedUser = link ? link.apiUserId : null;
  const feeInfo = await panelCreationFeeFor(user.id);
  const st = await getSettings();
  const parentCfg = feeInfo.parent ? await prisma.childPanel.findUnique({ where: { id: feeInfo.parent.id }, select: { panelDefaultMarkup: true, discountMember: true, discountReseller: true, discountAgency: true, discountVip: true } }) : null;
  if (feeInfo.fee > feeInfo.balance) back("/dashboard/panel-cua-toi", "err", `Số dư không đủ để tạo website con — phí tạo là ${feeInfo.fee.toLocaleString("vi-VN")}₫, số dư hiện tại ${feeInfo.balance.toLocaleString("vi-VN")}₫`);
  await prisma.$transaction(async (tx) => {
    const created = await tx.childPanel.create({
    data: {
      ownerId: user.id, name: domain, slug, markup: (parentCfg?.panelDefaultMarkup ?? parseInt(st.panel_default_markup)), accent: "blue", domain, parentPanelId: feeInfo.parent?.id ?? null, expiresAt: feeInfo.fee > 0 ? new Date(Date.now() + (await panelPeriodMs())) : null, 
      apiKey: linkedKey, apiUserId: linkedUser,
      discountMember: parentCfg ? parentCfg.discountMember : parseInt(st.level_discount_MEMBER) || 0, discountReseller: parentCfg ? parentCfg.discountReseller : parseInt(st.level_discount_RESELLER) || 0, discountAgency: parentCfg ? parentCfg.discountAgency : parseInt(st.level_discount_AGENCY) || 0, discountVip: parentCfg ? parentCfg.discountVip : parseInt(st.level_discount_VIP) || 0,
      setupDone: false,
    },
    });
    await chargePanelCreation(tx, user, feeInfo, created.id, domain);
  });
  back("/dashboard/panel-cua-toi", "msg", `Đã đăng ký website con ${domain} — trỏ NameServer của tên miền theo thông tin trên trang này, rồi đăng nhập website con để tuỳ chỉnh`);
}

/** Tạo Child Panel theo WIZARD 5 bước (đúng giao diện mẫu Tín gửi 2026-11-06):
 *  B1 tên miền (kiểm tra trực tiếp qua /api/panels/wizard-check) -> B2 tạo tài khoản
 *  QUẢN TRỊ VIÊN riêng cho panel (PanelStaff role "ADMIN" = toàn quyền trong Panel Admin,
 *  đăng nhập ngay trên website con) -> B3 xem lại + trừ phí từ số dư và tạo panel.
 *  Panel + tài khoản admin + phí nằm trong MỘT transaction. Người tạo vẫn là CHỦ panel
 *  (ownerId — hưởng phí panel con và hoa hồng); tài khoản admin là tài khoản vận hành.
 *  Tạo xong chuyển sang B4 (trỏ NameServer) rồi B5 (hoàn tất) trên cùng trang. */
export async function createPanelWizardAction(formData: FormData) {
  const user = await requireUser();
  if ((await getSettings()).module_panels === "0") back("/dashboard/panel-cua-toi", "err", "Tính năng mở website con đang tạm đóng");

  // Bước 1: tên miền (cùng luật với registerChildSiteAction)
  const domain = String(formData.get("domain") || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (domain.length < 4 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    back("/dashboard/panel-cua-toi", "err", "Tên miền chưa hợp lệ — chỉ chứa chữ thường, số, dấu chấm và gạch ngang (vd: myshop.vn)");
  }
  if (await prisma.childPanel.findFirst({ where: { domain } })) back("/dashboard/panel-cua-toi", "err", "Tên miền này đã được đăng ký cho website con khác");

  // Bước 2: tài khoản quản trị viên của panel
  const fullName = String(formData.get("adminName") || "").trim();
  const email = String(formData.get("adminEmail") || "").trim().toLowerCase();
  const phone = String(formData.get("adminPhone") || "").replace(/[\s.]/g, "");
  const username = String(formData.get("adminUsername") || "").trim().toLowerCase();
  const password = String(formData.get("adminPassword") || "");
  const password2 = String(formData.get("adminPassword2") || "");
  if (fullName.length < 2 || fullName.length > 128) back("/dashboard/panel-cua-toi", "err", "Họ và tên quản trị viên phải từ 2-128 ký tự");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("/dashboard/panel-cua-toi", "err", "Email quản trị viên chưa đúng định dạng");
  if (await prisma.user.findFirst({ where: { email } })) back("/dashboard/panel-cua-toi", "err", "Email này đã được đăng ký — hãy dùng email khác cho tài khoản quản trị");
  if (!/^[0-9]{10,15}$/.test(phone)) back("/dashboard/panel-cua-toi", "err", "Số điện thoại phải gồm 10-15 chữ số");
  if (!/^[a-z0-9-]{6,32}$/.test(username)) back("/dashboard/panel-cua-toi", "err", "Tên đăng nhập phải 6-32 ký tự: chữ thường, số, dấu gạch ngang");
  if (await prisma.user.findFirst({ where: { username } })) back("/dashboard/panel-cua-toi", "err", "Tên đăng nhập này đã có người dùng — hãy chọn tên khác");
  const pwErr = passwordError(password, await getSettings());
  if (pwErr) back("/dashboard/panel-cua-toi", "err", pwErr);
  if (password !== password2) back("/dashboard/panel-cua-toi", "err", "Mật khẩu xác nhận không khớp");
  if (formData.get("agree") !== "1") back("/dashboard/panel-cua-toi", "err", "Bạn cần đồng ý với điều khoản sử dụng để tiếp tục");
  if (formData.get("confirm") !== "1") back("/dashboard/panel-cua-toi", "err", "Bạn cần tích xác nhận đã kiểm tra kỹ thông tin trước khi tạo");

  // Bước 3: phí + liên kết API tự động bằng key của chính chủ panel (như luồng đăng ký thường)
  let slug = panelSlug(domain);
  if (slug.length < 3) slug = `site-${user.id}`;
  if (RESERVED_SLUGS.includes(slug) || (await prisma.childPanel.findUnique({ where: { slug } }))) slug = `${slug}-${user.id}`;
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { apiKey: true } });
  const link = await panelApiLink(formData, { apiKey: me?.apiKey || null, apiUserId: user.id }, [user.id]);
  if (!link) back("/dashboard/panel-cua-toi", "err", "Không liên kết được API — vui lòng thử lại sau");
  const feeInfo = await panelCreationFeeFor(user.id);
  const st = await getSettings();
  const parentCfg = feeInfo.parent ? await prisma.childPanel.findUnique({ where: { id: feeInfo.parent.id }, select: { panelDefaultMarkup: true, discountMember: true, discountReseller: true, discountAgency: true, discountVip: true } }) : null;
  if (feeInfo.fee > feeInfo.balance) back("/dashboard/panel-cua-toi", "err", `Số dư không đủ để tạo website con — phí tạo là ${feeInfo.fee.toLocaleString("vi-VN")}₫, số dư hiện tại ${feeInfo.balance.toLocaleString("vi-VN")}₫`);
  const passwordHash = await bcrypt.hash(password, 10);
  let createdId = 0;
  await prisma.$transaction(async (tx) => {
    const created = await tx.childPanel.create({
      data: {
        ownerId: user.id, name: domain, slug, markup: (parentCfg?.panelDefaultMarkup ?? parseInt(st.panel_default_markup)), accent: "blue", domain, parentPanelId: feeInfo.parent?.id ?? null, expiresAt: feeInfo.fee > 0 ? new Date(Date.now() + (await panelPeriodMs())) : null, 
        apiKey: link.apiKey, apiUserId: link.apiUserId,
        discountMember: parentCfg ? parentCfg.discountMember : parseInt(st.level_discount_MEMBER) || 0, discountReseller: parentCfg ? parentCfg.discountReseller : parseInt(st.level_discount_RESELLER) || 0, discountAgency: parentCfg ? parentCfg.discountAgency : parseInt(st.level_discount_AGENCY) || 0, discountVip: parentCfg ? parentCfg.discountVip : parseInt(st.level_discount_VIP) || 0,
        setupDone: false,
      },
    });
    const admin = await tx.user.create({
      data: {
        username, email, phone, fullName, passwordHash, panelId: created.id,
        apiKey: randomKey(32),
        depositCode: randomKey(6).toUpperCase(), refCode: randomKey(8).toUpperCase(),
      },
    });
    await tx.panelStaff.create({ data: { panelId: created.id, userId: admin.id, role: "ADMIN" } });
    createdId = created.id;
    await chargePanelCreation(tx, user, feeInfo, created.id, domain);
  });
  redirect(`/dashboard/panel-cua-toi?step=4&panel=${createdId}`);
}

/** Gia hạn thủ công 1 website con thêm 30 ngày (phí theo tháng trừ vào số dư;
 *  panel đang EXPIRED được mở lại ngay). Chủ panel bấm ở bảng danh sách website con. */
export async function renewPanelAction(formData: FormData) {
  const user = await requireUser();
  const id = parseInt(String(formData.get("panelId") || "0"));
  const panel = id ? await prisma.childPanel.findUnique({ where: { id } }) : null;
  if (!panel || panel.ownerId !== user.id) back("/dashboard/panel-cua-toi", "err", "Không tìm thấy website con của bạn");
  const feeInfo = await panelCreationFeeFor(user.id);
  if (feeInfo.fee <= 0) back("/dashboard/panel-cua-toi", "msg", "Website con đang miễn phí — không cần gia hạn");
  if (feeInfo.fee > feeInfo.balance) back("/dashboard/panel-cua-toi", "err", `Số dư không đủ để gia hạn — phí tháng là ${feeInfo.fee.toLocaleString("vi-VN")}₫, số dư hiện tại ${feeInfo.balance.toLocaleString("vi-VN")}₫`);
  const now = new Date();
  const base = panel!.expiresAt && panel!.expiresAt > now ? panel!.expiresAt : now;
  const expiresAt = new Date(base.getTime() + (await panelPeriodMs()));
  await prisma.$transaction(async (tx) => {
    await chargePanelCreation(tx, user, feeInfo, panel!.id, panel!.domain || panel!.name);
    await tx.childPanel.update({ where: { id: panel!.id }, data: { expiresAt, autoRenew: true, ...(panel!.status === "EXPIRED" ? { status: "ACTIVE" } : {}) } });
  });
  back("/dashboard/panel-cua-toi", "msg", `Đã gia hạn ${panel!.domain || panel!.name} đến ${expiresAt.toLocaleDateString("vi-VN")}`);
}

export async function updatePanelAction(formData: FormData) {
  const user = await requireUser();
  const access = await getPanelAccess(user.id);
  const panel = access?.panel ?? null;
  if (!panel) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Bạn chưa có panel");
  // Tiền/giá/cấu hình là quyền CHỦ panel (staff vai ADMIN được isOwner=true theo thiết kế);
  // nhân viên thường chỉ xử lý đơn + ticket + xem danh sách.
  if (!access!.isOwner) back("/panel-admin/cau-hinh", "err", "Chỉ chủ panel mới thay đổi được cấu hình panel");
  // Cập nhật TỪNG PHẦN: form nào gửi trường nào thì cập nhật trường đó (Panel Admin có
  // nhiều form riêng: giá chung ở trang Dịch vụ & Giá, thông tin ở trang Cài đặt...)
  const backToRaw = String(formData.get("back") || "");
  const backTo = backToRaw.startsWith("/panel-admin") || backToRaw.startsWith("/dashboard/panel-cua-toi") ? backToRaw : "/panel-admin/cau-hinh";
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
    const staffRows = await prisma.panelStaff.findMany({ where: { panelId: panel.id }, select: { userId: true } });
    const link = await panelApiLink(formData, { apiKey: panel.apiKey, apiUserId: panel.apiUserId }, [user.id, panel.apiUserId || -1, ...staffRows.map((r) => r.userId)]);
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
  const access = await getPanelAccess(user.id);
  const panel = access?.panel ?? null;
  if (!panel) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Bạn chưa có panel");
  if (!access!.isOwner) back("/panel-admin/dich-vu", "err", "Chỉ chủ panel mới đặt được giá riêng");
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
  const access = await getPanelAccess(user.id);
  const panel = access?.panel ?? null;
  if (!panel) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Bạn chưa có panel");
  if (!access!.isOwner) back("/panel-admin/dich-vu", "err", "Chỉ chủ panel mới đặt được giá riêng");
  const id = parseInt(String(formData.get("id") || "0"));
  await prisma.panelServicePrice.deleteMany({ where: { id, panelId: panel.id } });
  back("/panel-admin/dich-vu", "msg", "Đã xoá giá riêng");
}

/** Chủ panel gán cấp bậc cho khách CỦA PANEL MÌNH (không đụng được khách ngoài panel) */
export async function setPanelMemberLevelAction(formData: FormData) {
  const user = await requireUser();
  const access = await getPanelAccess(user.id);
  const panel = access?.panel ?? null;
  if (!panel) back("/dashboard/panel-cua-toi/thiet-lap", "err", "Bạn chưa có panel");
  if (!access!.isOwner) back("/panel-admin/khach-hang", "err", "Chỉ chủ panel mới đổi được cấp bậc khách");
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
  if (rateLimitExceeded(`ordpre|${user.id}`, 60, 60000)) back("/dashboard/premium", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
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
    if (String((e as any)?.digest || "").startsWith("NEXT_REDIRECT")) throw e; // back()/done() ném redirect — không được nuốt thành thông báo lỗi
    const rt = String(formData.get("returnTo") || "");
    const errTarget = rt.startsWith("/dashboard/premium/") || rt.startsWith("/premium/") ? rt : slug ? `/premium/${slug}` : "/premium";
    back(errTarget, "err", String(e?.message || "Mua thất bại"));
  }
}

export async function createDepositAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`dep|${user.id}`, 10, 3600000)) back("/dashboard/nap-tien", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  const amount = parseInt(String(formData.get("amount") || "0"));
  const method = String(formData.get("method") || "BANK") as any;
  // Chỉ BANK/MOMO là nạp tay chờ duyệt — cổng tự động (Stripe/PayPal/USDT) có
  // action riêng; nhận method lạ từ form là tạo yêu cầu nạp giả gây nhiễu hàng duyệt.
  if (!["BANK", "MOMO"].includes(method)) back("/dashboard/nap-tien", "err", "Phương thức nạp không hợp lệ");
  const settings = await getSettings();
  // Khách panel: dùng nạp tối thiểu + mốc thưởng RIÊNG của panel nếu chủ panel đã đặt
  const myPanelCfg = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { depositMin: true, depositBonusTiers: true } }) : null;
  const min = myPanelCfg?.depositMin || parseInt(settings.deposit_min);
  if (!amount || amount < min) back("/dashboard/nap-tien", "err", `Số tiền nạp tối thiểu là ${min.toLocaleString("vi-VN")}đ`);
  const bonus = calcBonus(amount, bonusTiersFor(myPanelCfg?.depositBonusTiers, !!user.panelId, settings.deposit_bonus_tiers));
  const dep = await prisma.deposit.create({
    data: { code: "TMP", userId: user.id, method, amount, bonus, status: "PENDING", content: `SMM ${user.depositCode}` },
  });
  const depCode = genCode("NAP", dep.id);
  await prisma.deposit.update({ where: { id: dep.id }, data: { code: depCode } });
  void (async () => {
    const { alertMother, alertPanelOwner } = await import("@/lib/alerts");
    await alertMother("deposit_pending", `Yêu cầu nạp chờ duyệt ${depCode}`, `${user.username} · ${method} · ${amount.toLocaleString("vi-VN")}đ`);
    if (user.panelId) await alertPanelOwner(user.panelId, "deposit_pending", `Yêu cầu nạp chờ duyệt ${depCode}`, `${user.username} · ${method} · ${amount.toLocaleString("vi-VN")}đ`);
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
  if (!(await moduleOn("tickets", user.panelId))) back("/dashboard/ticket", "err", "Tính năng hỗ trợ / ticket đang tắt");
  const subject = String(formData.get("subject") || "").trim();
  const category = String(formData.get("category") || "other");
  const body = String(formData.get("body") || "").trim();
  if (!subject || !body) back("/dashboard/ticket", "err", "Nhập đủ tiêu đề và nội dung");
  const attachments = cleanAttachments(formData.get("attachments"));
  const t = await prisma.ticket.create({
    data: { userId: user.id, subject, category, messages: { create: { body, attachments } } },
  });
  void (async () => {
    const { alertMother, alertPanelOwner } = await import("@/lib/alerts");
    await alertMother("ticket", `Ticket mới #${t.id}`, `${user.username}: ${subject}`);
    if (user.panelId) await alertPanelOwner(user.panelId, "ticket", `Ticket mới #${t.id}`, `${user.username}: ${subject}`);
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
  back("/dashboard/api", "msg", "Đã tạo API key mới. Key cũ đã bị vô hiệu ngay lập tức.");
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
  // Khách panel đang xem điều khoản của panel mình -> ghi nhận theo phiên bản của panel.
  if (user.panelId) {
    const panel = await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { termsEnabled: true, termsContent: true, termsVersion: true } });
    if (panel?.termsEnabled && panel.termsContent?.trim()) {
      await prisma.user.update({ where: { id: user.id }, data: { termsAcceptedVersion: panel.termsVersion } });
      redirect("/dashboard");
    }
  }
  const s = await getSettings();
  await prisma.user.update({ where: { id: user.id }, data: { termsAcceptedVersion: parseInt(s.terms_version || "1") || 1 } });
  redirect("/dashboard");
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
  if (!(await bcrypt.compare(old, fresh.passwordHash))) back("/dashboard/ho-so", "err", "Mật khẩu hiện tại không đúng");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10), sessionVersion: { increment: 1 } } });
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

/** Nạp USDT: khách khai số USDT + mã giao dịch (tx hash) — admin đối chiếu ví rồi duyệt ở /admin/nap-tien. */
export async function createPanelBankDepositAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`dep|${user.id}`, 10, 3600000)) back("/dashboard/nap-tien", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  if (!user.panelId) back("/dashboard/nap-tien", "err", "Tài khoản không thuộc website nào");
  const panel = await prisma.childPanel.findUnique({ where: { id: user.panelId } });
  if (!panel || panel.status !== "ACTIVE" || !panel.bankAccount) back("/dashboard/nap-tien", "err", "Website chưa cài tài khoản ngân hàng riêng");
  const amount = parseInt(String(formData.get("amount") || "0"));
  const minBank = panel.depositMin || 10000;
  if (!amount || amount < minBank) back("/dashboard/nap-tien", "err", `Số tiền tối thiểu ${minBank.toLocaleString("vi-VN")}đ`);
  const settings = await getSettings();
  const bonus = calcBonus(amount, bonusTiersFor(panel.depositBonusTiers, true, settings.deposit_bonus_tiers));
  const dep = await prisma.deposit.create({
    data: { code: "TMP", userId: user.id, method: "BANK", amount, bonus, status: "PENDING", content: `Chuyển khoản ngân hàng của shop ${panel.name} — chờ chủ shop duyệt` },
  });
  const depCode2 = genCode("NAP", dep.id);
  await prisma.deposit.update({ where: { id: dep.id }, data: { code: depCode2 } });
  void (async () => { const { alertPanelOwner } = await import("@/lib/alerts"); await alertPanelOwner(panel.id, "deposit_pending", `Yêu cầu nạp chờ duyệt ${depCode2}`, `${user.username} · BANK · ${amount.toLocaleString("vi-VN")}đ — khách chuyển vào ngân hàng của panel`); })();
  back("/dashboard/nap-tien", "msg", "Đã gửi yêu cầu — chủ website sẽ duyệt và cộng tiền sau khi nhận được chuyển khoản");
}

export async function createUsdtDepositAction(formData: FormData) {
  const user = await requireUser();
  if (rateLimitExceeded(`dep|${user.id}`, 10, 3600000)) back("/dashboard/nap-tien", "err", "Thao tác quá nhanh, vui lòng thử lại sau ít phút");
  const settings = await getSettings();
  // Khách panel: nếu chủ panel đã cài ví USDT riêng thì nạp về ví của panel (chủ panel duyệt)
  const userPanel = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId } }) : null;
  const panelUsdt = userPanel && userPanel.status === "ACTIVE" && userPanel.usdtAddress ? userPanel : null;
  if (!panelUsdt && (settings.usdt_enabled !== "1" || !settings.usdt_address)) back("/dashboard/nap-tien", "err", "Nạp USDT đang tạm đóng");
  const usdt = parseFloat(String(formData.get("usdt") || "0"));
  const txHash = String(formData.get("txHash") || "").trim();
  const minUsdt = parseFloat(settings.usdt_min || "") || 5;
  if (!usdt || usdt < minUsdt) back("/dashboard/nap-tien", "err", `Số USDT tối thiểu là ${minUsdt}`);
  if (txHash.length < 20) back("/dashboard/nap-tien", "err", "Mã giao dịch (tx hash) chưa hợp lệ");
  const rate = panelUsdt ? (panelUsdt.usdtRate || usdtRateOf(settings)) : usdtRateOf(settings);
  const amount = Math.round(usdt * rate);
  const bonus = calcBonus(amount, bonusTiersFor(userPanel?.depositBonusTiers, !!user.panelId, settings.deposit_bonus_tiers));
  try {
    const dep = await prisma.deposit.create({
      data: { code: "TMP", userId: user.id, method: "USDT", amount, bonus, status: "PENDING", content: txHash, externalId: `usdt:${txHash.toLowerCase()}`, usdCents: Math.round(usdt * 100) },
    });
    const depCode3 = genCode("NAP", dep.id);
    await prisma.deposit.update({ where: { id: dep.id }, data: { code: depCode3 } });
    void (async () => {
      const { alertMother, alertPanelOwner } = await import("@/lib/alerts");
      const msg = `${user.username} · USDT · ${amount.toLocaleString("vi-VN")}đ`;
      if (panelUsdt) await alertPanelOwner(panelUsdt.id, "deposit_pending", `Yêu cầu nạp USDT chờ duyệt ${depCode3}`, msg);
      else await alertMother("deposit_pending", `Yêu cầu nạp USDT chờ duyệt ${depCode3}`, msg);
    })();
  } catch {
    back("/dashboard/nap-tien", "err", "Mã giao dịch này đã được khai báo trước đó");
  }
  back("/dashboard/nap-tien", "msg", "Đã ghi nhận — admin sẽ đối chiếu giao dịch USDT và cộng tiền trong ít phút");
}

/** Trần link mỗi lần đặt: panel có đặt riêng thì theo panel, không thì theo cấu hình chung. */
async function orderMaxLinksFor(userId: number): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { panelId: true } });
  if (u?.panelId) {
    const p = await prisma.childPanel.findUnique({ where: { id: u.panelId }, select: { orderMaxLinks: true } });
    if (p?.orderMaxLinks && p.orderMaxLinks > 0) return p.orderMaxLinks;
  }
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
