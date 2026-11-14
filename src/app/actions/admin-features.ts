"use server";
import { prisma } from "@/lib/db";
import { requireAdmin, assertStepUp, currentIp } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { setSetting, getSettings } from "@/lib/settings";
import { sendMail, smtpConfigured } from "@/lib/mailer";
import { redirect } from "next/navigation";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}
const done = (path: string, text = "Đã lưu") => back(path, "msg", text);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string) => parseInt(str(fd, k) || "0") || 0;
const dtOrNull = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

function slugify(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 200) || "bai-viet";
}

/* ---------- Mã giảm giá ---------- */
export async function saveDiscountCodeAction(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id");
  const code = str(formData, "code").toUpperCase().replace(/\s+/g, "");
  if (!code) back("/admin/ma-giam-gia", "err", "Chưa nhập mã");
  const data = {
    code,
    type: str(formData, "type") === "FIXED" ? "FIXED" : "PERCENT",
    value: Math.max(1, int(formData, "value")),
    minOrder: Math.max(0, int(formData, "minOrder")),
    maxDiscount: Math.max(0, int(formData, "maxDiscount")),
    usageLimit: Math.max(0, int(formData, "usageLimit")),
    scope: ["ALL", "PREMIUM"].includes(str(formData, "scope")) ? str(formData, "scope") : "ALL",
    startsAt: dtOrNull(formData, "startsAt"),
    endsAt: dtOrNull(formData, "endsAt"),
    active: formData.get("active") === "on",
    isPublic: formData.get("isPublic") === "on",
  };
  try {
    if (id) await prisma.discountCode.update({ where: { id }, data });
    else await prisma.discountCode.create({ data });
  } catch {
    back("/admin/ma-giam-gia", "err", `Mã "${code}" đã tồn tại`);
  }
  done("/admin/ma-giam-gia", id ? "Đã cập nhật mã giảm giá" : "Đã tạo mã giảm giá");
}

export async function deleteDiscountCodeAction(formData: FormData) {
  await requireAdmin();
  await prisma.discountCode.delete({ where: { id: int(formData, "id") } });
  done("/admin/ma-giam-gia", "Đã xoá mã giảm giá");
}

/* ---------- Ngân hàng ---------- */
export async function saveBankAction(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id");
  const data = {
    bankName: str(formData, "bankName"),
    accountNumber: str(formData, "accountNumber"),
    holder: str(formData, "holder"),
    branch: str(formData, "branch") || null,
    qrImage: str(formData, "qrImage") || null,
    note: str(formData, "note") || null,
    sort: int(formData, "sort"),
    active: formData.get("active") === "on",
  };
  if (!data.bankName || !data.accountNumber || !data.holder) back("/admin/ngan-hang", "err", "Thiếu tên ngân hàng / số tài khoản / chủ tài khoản");
  if (id) await prisma.bankAccount.update({ where: { id }, data });
  else await prisma.bankAccount.create({ data });
  done("/admin/ngan-hang", id ? "Đã cập nhật ngân hàng" : "Đã thêm ngân hàng");
}

export async function deleteBankAction(formData: FormData) {
  await requireAdmin();
  await prisma.bankAccount.delete({ where: { id: int(formData, "id") } });
  done("/admin/ngan-hang", "Đã xoá ngân hàng");
}

/* ---------- Bài viết ---------- */
export async function savePostCategoryAction(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id");
  const name = str(formData, "name");
  if (!name) back("/admin/bai-viet/danh-muc", "err", "Chưa nhập tên danh mục");
  const data = { name, slug: str(formData, "slug") || slugify(name), description: str(formData, "description") || null, active: formData.get("active") === "on" };
  try {
    if (id) await prisma.postCategory.update({ where: { id }, data });
    else await prisma.postCategory.create({ data });
  } catch {
    back("/admin/bai-viet/danh-muc", "err", "Slug danh mục đã tồn tại");
  }
  done("/admin/bai-viet/danh-muc");
}

export async function deletePostCategoryAction(formData: FormData) {
  await requireAdmin();
  await prisma.postCategory.delete({ where: { id: int(formData, "id") } });
  done("/admin/bai-viet/danh-muc", "Đã xoá danh mục");
}

export async function savePostAction(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id");
  const title = str(formData, "title");
  if (!title) back("/admin/bai-viet", "err", "Chưa nhập tiêu đề");
  const content = str(formData, "content");
  if (!content) back("/admin/bai-viet", "err", "Chưa nhập nội dung");
  const data = {
    title,
    slug: str(formData, "slug") || slugify(title),
    excerpt: str(formData, "excerpt") || null,
    content,
    coverUrl: str(formData, "coverUrl") || null,
    categoryId: int(formData, "categoryId") || null,
    published: formData.get("published") === "on",
    pinned: formData.get("pinned") === "on",
  };
  try {
    if (id) await prisma.post.update({ where: { id }, data });
    else await prisma.post.create({ data });
  } catch {
    back("/admin/bai-viet", "err", "Slug bài viết đã tồn tại");
  }
  done("/admin/bai-viet", id ? "Đã cập nhật bài viết" : "Đã tạo bài viết");
}

export async function deletePostAction(formData: FormData) {
  await requireAdmin();
  await prisma.post.delete({ where: { id: int(formData, "id") } });
  done("/admin/bai-viet", "Đã xoá bài viết");
}

/* ---------- Bảo mật: chặn IP ---------- */
export async function saveIpBanAction(formData: FormData) {
  await requireAdmin();
  const ip = str(formData, "ip");
  if (!ip) back("/admin/bao-mat", "err", "Chưa nhập IP");
  try {
    await prisma.ipBan.create({ data: { ip, reason: str(formData, "reason") || null } });
  } catch {
    back("/admin/bao-mat", "err", "IP này đã có trong danh sách chặn");
  }
  done("/admin/bao-mat", `Đã chặn IP ${ip}`);
}

export async function deleteIpBanAction(formData: FormData) {
  await requireAdmin();
  await prisma.ipBan.delete({ where: { id: int(formData, "id") } });
  done("/admin/bao-mat", "Đã bỏ chặn IP");
}

/* ---------- Chính sách mật khẩu + bảo mật đăng ký (trang Bảo mật nâng cao) ---------- */
export async function saveSecurityPolicyAction(formData: FormData) {
  const actor = await requireAdmin();
  // GĐ2: đổi Admin IP whitelist hoặc tắt bắt buộc 2FA là thao tác nhạy cảm — phải xác thực lại
  if (formData.get("admin_ip_whitelist") !== null || formData.get("admin_2fa_required") !== null) {
    await assertStepUp(actor.id, "/admin/bao-mat");
  }
  const { setSetting } = await import("@/lib/settings");
  const keys = [
    "password_min_length", "pw_require_upper", "pw_require_number", "pw_require_special",
    "reg_honeypot", "reg_block_disposable", "reg_max_per_ip_hour", "reg_banned_domains",
    "bf_enabled", "bf_max_attempts", "bf_lock_seconds",
    "admin_2fa_required", "admin_ip_whitelist",
  ];
  const saved: string[] = [];
  for (const k of keys) {
    const v = formData.get(k);
    if (v !== null) { await setSetting(k, String(v).trim()); saved.push(k); }
  }
  await writeAudit({ actorId: actor.id, actorName: actor.username, role: actor.role, action: "security.policy", targetType: "setting", targetId: "saveSecurityPolicy", detail: `Lưu chính sách bảo mật: ${saved.join(", ")}`, ip: currentIp() });
  done("/admin/bao-mat", "Đã lưu cấu hình bảo mật");
}

/* ---------- Cấp bậc: % giảm giá ---------- */
/* ---------- Hệ thống: dọn dẹp ---------- */
export async function cleanupSystemAction(formData: FormData) {
  await requireAdmin();
  const kind = str(formData, "kind");
  const keepDays = Math.max(1, parseInt((await getSettings()).cleanup_retention_days || "") || 30);
  const d30 = new Date(Date.now() - keepDays * 86400000);
  let n = 0;
  if (kind === "apilog") n = (await prisma.apiLog.deleteMany({ where: { createdAt: { lt: d30 } } })).count;
  else if (kind === "notifications") n = (await prisma.notification.deleteMany({ where: { read: true, createdAt: { lt: d30 } } })).count;
  else if (kind === "events") n = (await prisma.orderEvent.deleteMany({ where: { createdAt: { lt: d30 } } })).count;
  else back(str(formData, "from") || "/admin/he-thong", "err", "Loại dọn dẹp không hợp lệ");
  done(str(formData, "from") || "/admin/he-thong", `Đã dọn ${n} bản ghi cũ`);
}

/* ---------- Liên hệ: kênh hỗ trợ + widget nổi + AI tư vấn ---------- */
export async function saveContactAction(formData: FormData) {
  await requireAdmin();
  await setSetting("support_widget_enabled", formData.get("support_widget_enabled") === "on" ? "1" : "0");
  await setSetting("livechat_enabled", formData.get("livechat_enabled") === "on" ? "1" : "0");
  done("/admin/lien-he", "Đã lưu công tắc widget");
}

/* ---------- Widget Liên hệ: danh sách kênh hiển thị trên website ---------- */
function widgetData(formData: FormData) {
  const name = str(formData, "name").slice(0, 120);
  const link = str(formData, "link").slice(0, 500);
  const imageRaw = String(formData.get("image") || "");
  const image = imageRaw.startsWith("data:image/") && imageRaw.length < 14_000_000 ? imageRaw : null;
  return { name, link, image, active: formData.get("active") === "on" };
}
export async function saveContactWidgetAction(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id");
  const d = widgetData(formData);
  if (!d.name) back("/admin/lien-he", "err", "Tên hiển thị không được trống");
  if (id) {
    const old = await prisma.contactWidget.findFirst({ where: { id, panelId: null } });
    if (!old) back("/admin/lien-he", "err", "Không tìm thấy liên hệ");
    await prisma.contactWidget.update({ where: { id }, data: { ...d, image: formData.get("image") === "" ? null : d.image ?? old!.image } });
  } else {
    const last = await prisma.contactWidget.findFirst({ where: { panelId: null }, orderBy: { sort: "desc" } });
    await prisma.contactWidget.create({ data: { panelId: null, ...d, sort: (last?.sort ?? 0) + 1 } });
  }
  done("/admin/lien-he", id ? "Đã sửa liên hệ" : "Đã thêm liên hệ");
}
export async function deleteContactWidgetAction(formData: FormData) {
  await requireAdmin();
  await prisma.contactWidget.deleteMany({ where: { id: int(formData, "id"), panelId: null } });
  done("/admin/lien-he", "Đã xoá liên hệ");
}
export async function toggleContactWidgetAction(formData: FormData) {
  await requireAdmin();
  const w = await prisma.contactWidget.findFirst({ where: { id: int(formData, "id"), panelId: null } });
  if (w) await prisma.contactWidget.update({ where: { id: w.id }, data: { active: !w.active } });
  done("/admin/lien-he", w ? `Đã ${w.active ? "ẩn" : "hiện"} liên hệ ${w.name}` : "Đã lưu");
}
export async function seedContactWidgetsAction() {
  await requireAdmin();
  const { getSettings } = await import("@/lib/settings");
  const s = await getSettings();
  const legacy: [string, string][] = [["Zalo", s.support_zalo], ["Telegram", s.support_telegram], ["Facebook", s.support_facebook], ["Hotline", s.support_hotline]];
  let n = 0;
  for (const [name, value] of legacy) {
    if (value && value.trim()) { await prisma.contactWidget.create({ data: { panelId: null, name, link: value.trim(), sort: ++n } }); }
  }
  done("/admin/lien-he", n ? `Đã đưa ${n} kênh cũ vào danh sách widget` : "Không có kênh cũ nào để đưa vào");
}

/* ---------- Dọn dẹp: xoá cache (trang / route / số dư nguồn đệm) ---------- */
export async function clearCacheAction(formData: FormData) {
  await requireAdmin();
  const { revalidatePath } = await import("next/cache");
  const kind = str(formData, "kind");
  const from = str(formData, "from") || "/admin/don-dep";
  if (kind === "pages" || kind === "all") {
    for (const p of ["/", "/dich-vu", "/premium", "/bai-viet", "/cua-hang/[slug]", "/api/display-config"]) revalidatePath(p);
  }
  if (kind === "routes" || kind === "all") revalidatePath("/", "layout");
  if (kind === "providers" || kind === "all") await prisma.provider.updateMany({ data: { balanceCache: 0 } });
  if (!["pages", "routes", "providers", "all"].includes(kind)) back(from, "err", "Loại cache không hợp lệ");
  done(from, kind === "all" ? "Đã xoá toàn bộ cache" : "Đã xoá cache");
}

/* ---------- Dọn dẹp: chạy tất cả việc dọn dữ liệu cũ một lượt ---------- */
export async function cleanupAllAction(formData: FormData) {
  await requireAdmin();
  const from = str(formData, "from") || "/admin/don-dep";
  const keepDays = Math.max(1, parseInt((await getSettings()).cleanup_retention_days || "") || 30);
  const d30 = new Date(Date.now() - keepDays * 86400000);
  const a = (await prisma.apiLog.deleteMany({ where: { createdAt: { lt: d30 } } })).count;
  const b = (await prisma.notification.deleteMany({ where: { read: true, createdAt: { lt: d30 } } })).count;
  const c = (await prisma.orderEvent.deleteMany({ where: { createdAt: { lt: d30 } } })).count;
  done(from, `Đã dọn dẹp hệ thống: ${a + b + c} bản ghi cũ (nhật ký API ${a} · thông báo ${b} · dòng thời gian đơn ${c})`);
}

/* ---------- Tiền tệ: tỉ giá quy đổi hiển thị ---------- */
export async function saveRatesAction(formData: FormData) {
  await requireAdmin();
  if (str(formData, "rates_form_full") === "1") {
    // Form tỉ giá ĐẦY ĐỦ (trang Cấu hình nạp tiền): tỉ giá tay + khoá tay từng
    // tiền tệ + biên an toàn + công tắc auto + thêm tiền tệ — qua lib/rates.
    const { saveFxSettingsForm } = await import("@/lib/rates");
    await saveFxSettingsForm(formData);
  } else {
    // Form tỉ giá gọn (trang Tiền tệ): số admin nhập là tỉ giá TAY — ghi vào
    // fx_manual_* rồi đồng bộ tỉ giá đang dùng (auto không khoá tay vẫn theo auto).
    const LEGACY: Record<string, string> = { usd_rate: "usd", rate_eur: "eur", rate_cny: "cny", rate_thb: "thb", rate_jpy: "jpy", rate_krw: "krw", usdt_rate: "usdt" };
    let touched = false;
    for (const [k, lc] of Object.entries(LEGACY)) {
      const v = parseFloat(str(formData, k).replace(",", "."));
      if (!isNaN(v) && v > 0) { await setSetting(`fx_manual_${lc}`, String(v)); touched = true; }
    }
    if (touched) {
      const { syncAllEffectiveRates } = await import("@/lib/rates");
      await syncAllEffectiveRates();
    }
  }
  const minUsd = parseInt(str(formData, "intl_min_usd"));
  if (!isNaN(minUsd) && minUsd >= 1) await setSetting("intl_min_usd", String(minUsd));
  const backTo = str(formData, "back");
  done(backTo.startsWith("/admin/") ? backTo : "/admin/tien-te", "Đã lưu tỉ giá");
}

/* ---------- Email Marketing ---------- */
export async function sendMarketingEmailAction(formData: FormData) {
  await requireAdmin();
  const segment = str(formData, "segment");
  const subject = str(formData, "subject");
  const body = str(formData, "body");
  if (!subject || !body) back("/admin/email-marketing", "err", "Thiếu tiêu đề hoặc nội dung");
  if (!(await smtpConfigured())) back("/admin/email-marketing", "err", "Chưa cấu hình SMTP — vào Cấu hình → tab Email để điền trước");
  const where: any = { email: { not: null }, status: "ACTIVE" }; // email marketing gửi mọi khách của web mẹ (child panel đã bỏ — panelId không còn ý nghĩa)
  if (segment === "new") where.createdAt = { gte: new Date(Date.now() - 30 * 86400000) };
  if (segment === "deposited") where.totalDeposited = { gt: 0 };
  const users = await prisma.user.findMany({ where, select: { email: true } });
  const emails = users.map((u) => u.email!).filter(Boolean);
  if (!emails.length) back("/admin/email-marketing", "err", "Không có người nhận nào trong nhóm đã chọn");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${body.replace(/\n/g, "<br/>")}</div>`;
  try {
    const sent = await sendMail(emails, subject, html);
    await prisma.apiLog.create({ data: { kind: "email_marketing", ok: true, ref: subject.slice(0, 80), detail: `Gửi ${sent} email — nhóm ${segment}` } });
    done("/admin/email-marketing", `Đã gửi email tới ${sent} người dùng`);
  } catch (e: any) {
    if (String((e as any)?.digest || "").startsWith("NEXT_REDIRECT")) throw e; // back()/done() ném redirect — không được nuốt thành thông báo lỗi
    back("/admin/email-marketing", "err", "Gửi thất bại: " + (e?.message || "lỗi SMTP"));
  }
}

/* ---------- Giá thông minh: chỉnh giá bán hàng loạt ---------- */
/* ---------- Mô-đun bật/tắt ---------- */
export async function saveModulesAction(formData: FormData) {
  await requireAdmin();
  for (const k of [
    "module_premium", "module_affiliate", "module_register",
    "module_promo", "module_tickets",
    "module_api", "module_blog", "livechat_enabled", "support_widget_enabled",
    // Công tắc mục Telegram (khu tách riêng của FZR) nằm cùng trang Mô-đun
    // từ 2026-11-08 — trang Cài đặt Telegram riêng đã bỏ.
    "telegram_enabled",
    // Đợt 126 (luật module 2026-11-13): gom nốt các công tắc từng nằm rải
    // rác về đây — Pass (trước ở tab Pass của Cấu hình), Trang trí mùa
    // (trước ở Cấu hình) — và các công tắc mới: Banner trang chủ, Flash
    // Sale, 5 khu riêng của FZR. Từ nay MỌI công tắc module chỉ lưu ở
    // action này (một công tắc một chỗ).
    "pass_enabled", "seasonal_decor_enabled",
    "hero_banner_enabled", "module_flashsale",
    "area_steam_enabled", "area_gamekey_enabled", "area_giftcard_enabled",
    "area_topup_enabled", "area_manual_enabled",
  ]) {
    await setSetting(k, formData.get(k) === "on" ? "1" : "0");
  }
  done("/admin/mo-dun", "Đã lưu trạng thái mô-đun");
}

/* ---------- Gửi thử email để kiểm tra cấu hình SMTP ---------- */
export async function testSmtpAction(formData: FormData) {
  await requireAdmin();
  const to = str(formData, "to");
  if (!/^\S+@\S+\.\S+$/.test(to)) back("/admin/email-marketing", "err", "Địa chỉ email nhận thử chưa hợp lệ");
  const { smtpConfigured, sendMail } = await import("@/lib/mailer");
  if (!(await smtpConfigured())) back("/admin/email-marketing", "err", "SMTP chưa được cấu hình — vào Cấu hình → tab Email trước");
  try {
    await sendMail([to], "Email thử từ hệ thống", "<p>Đây là email thử. Nếu bạn nhận được thư này, cấu hình SMTP đã hoạt động đúng.</p>");
    done("/admin/email-marketing", `Đã gửi email thử tới ${to}`);
  } catch (e: any) {
    if (String((e as any)?.digest || "").startsWith("NEXT_REDIRECT")) throw e; // back()/done() ném redirect — không được nuốt thành thông báo lỗi
    back("/admin/email-marketing", "err", `Gửi thử thất bại: ${String(e?.message || e).slice(0, 180)}`);
  }
}
