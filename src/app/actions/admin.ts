"use server";
import { prisma } from "@/lib/db";
import { cleanAttachments } from "@/lib/attachments";
import { requireAdmin, requireStaff, assertStepUp, currentIp } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { applyBalance, clawbackReferralCommission } from "@/lib/wallet";
import { clawbackPassCashback } from "@/lib/pass";
import { syncPremiumOrderStatus } from "@/lib/orders";
import { providerBalance, syncProviderPremium } from "@/lib/provider";
import { getSettings, setSetting, siteUrlFromSettings, normalizeSiteUrl } from "@/lib/settings";
import { fzrMarkupKey } from "@/lib/fzr-markup";
import { DICT } from "@/lib/i18n";
import { LANG_KEYS, sanitizeEnabled, sanitizeOverrides, type LangOverrides } from "@/lib/lang-config";
import { encryptSecret } from "@/lib/secret-box";
import { genCode, normalizePremiumFieldsJson } from "@/lib/format";
import { restoreVariantStock } from "@/lib/variant-stock";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}
const done = (path: string, text = "Đã lưu") => back(path, "msg", text);
/** Trang quản lý sản phẩm theo khu (Premium / Telegram / Steam — FIX7 E2/E3/E4)
 *  dùng CHUNG một editor: form gửi kèm returnTo để lưu xong quay về đúng trang
 *  đã mở, không bị văng về /admin/premium. Chỉ chấp nhận path /admin/*. */
const retTo = (formData: FormData) => {
  const r = String(formData.get("returnTo") || "");
  return r.startsWith("/admin/") ? r : "/admin/premium";
};

/* GĐ2: ghi audit bất biến cho thao tác nhạy cảm của admin web mẹ */
async function auditAdmin(actor: { id: number; username: string; role: string }, action: string, targetType: string, targetId: string | number, detail?: string) {
  await writeAudit({ actorId: actor.id, actorName: actor.username, role: actor.role, action, targetType, targetId, detail: detail ?? null, ip: currentIp() });
}

/* ---------- Người dùng ---------- */
/** (Tính năng website con đã gỡ — mọi tài khoản đều là khách của web mẹ.) */
async function assertMotherAccount(_userId: number, _path: string) {}

export async function adminAdjustBalance(formData: FormData) {
  const actor = await requireAdmin();
  const userId = parseInt(String(formData.get("userId")));
  await assertStepUp(actor.id, `/admin/nguoi-dung/${userId || ""}`);
  const amount = parseInt(String(formData.get("amount") || "0"));
  const note = String(formData.get("note") || "Admin điều chỉnh số dư");
  if (!userId || !amount) back("/admin/nguoi-dung", "err", "Số tiền không hợp lệ");
  await assertMotherAccount(userId, "/admin/nguoi-dung");
  await prisma.$transaction(async (tx) => {
    await applyBalance(tx, userId, amount, "ADJUST", undefined, note);
  });
  await auditAdmin(actor, "balance.adjust", "user", userId, `${amount > 0 ? "+" : ""}${amount}đ — ${note}`);
  revalidatePath("/admin/nguoi-dung");
  done(`/admin/nguoi-dung/${userId}`, amount > 0 ? `Đã cộng ${amount.toLocaleString("vi-VN")}đ` : `Đã trừ ${Math.abs(amount).toLocaleString("vi-VN")}đ`);
}

export async function adminUpdateUser(formData: FormData) {
  const actor = await requireAdmin();
  const userId = parseInt(String(formData.get("userId")));
  await assertMotherAccount(userId, "/admin/nguoi-dung");
  const data: any = {
    level: String(formData.get("level") || "MEMBER"),
    status: String(formData.get("status") || "ACTIVE"),
    // Đổi vai trò: chỉ ADMIN (requireAdmin đã chốt cứng ở trên)
    role: String(formData.get("role") || "USER"),
  };
  await prisma.user.update({ where: { id: userId }, data });
  await auditAdmin(actor, "user.update", "user", userId, `role=${data.role} status=${data.status} level=${data.level}`);
  done(`/admin/nguoi-dung/${userId}`, "Đã cập nhật người dùng");
}

/* ---------- Nhà cung cấp API ---------- */
const FZR_MARKUP_GROUPS = ["gamekeys", "giftcards", "topups", "manual", "telegram_stars", "telegram_premium", "steam_topup", "steam_gift"] as const;

export async function adminSaveProvider(formData: FormData) {
  const actor = await requireAdmin();
  const id = parseInt(String(formData.get("id") || "0"));
  const rawKey = String(formData.get("apiKey") || "").trim();
  // GĐ2: đặt API key nhà cung cấp mới = thao tác nhạy cảm, phải xác thực lại
  if (rawKey && !rawKey.includes("•")) await assertStepUp(actor.id, "/admin/nha-cung-cap");
  const data: any = {
    kind: (String(formData.get("kind") || "BOTH") as "SMM" | "PREMIUM" | "BOTH"),
    driver: String(formData.get("driver") || "STANDARD") === "FZR" ? "FZR" : "STANDARD",
    name: String(formData.get("name") || "").trim(),
    apiUrl: String(formData.get("apiUrl") || "").trim(),
    apiKey: String(formData.get("apiKey") || "").trim(),
    currency: String(formData.get("currency") || "VND"),
    exchangeRate: parseInt(String(formData.get("exchangeRate") || "1")),
    markupPercent: parseInt(String(formData.get("markupPercent") || "30")),
    syncServices: formData.get("syncServices") !== "off",
    syncCategories: formData.get("syncCategories") !== "off",
    autoUpdatePrice: formData.get("autoUpdatePrice") !== "off",
    syncContent: formData.get("syncContent") === "on",
    filterHtml: formData.get("filterHtml") !== "off",
    syncAdvanced: formData.get("syncAdvanced") === "on",
    coupon: String(formData.get("coupon") || "").trim() || null,
    cronSyncLimit: Math.max(1, parseInt(String(formData.get("cronSyncLimit") || "50")) || 50),
    minBalanceAlert: parseInt(String(formData.get("minBalanceAlert") || "0")),
    dailyLimit: parseInt(String(formData.get("dailyLimit") || "0")),
    active: formData.get("active") === "on",
    note: String(formData.get("note") || "") || null,
  };
  if (!data.name || !data.apiUrl) back("/admin/nha-cung-cap", "err", "Thiếu tên hoặc API URL");
  if (id && (!rawKey || rawKey.includes("•"))) { const oldP = await prisma.provider.findUnique({ where: { id } }); if (oldP) data["api" + "Key"] = (oldP as any)["api" + "Key"]; }
  if (data.apiKey) data.apiKey = encryptSecret(data.apiKey); // mã hoá khoá nhà cung cấp khi lưu (APP_ENC_KEY)
  if (!data.apiKey) back("/admin/nha-cung-cap", "err", "Thiếu API key");
  if (id) await prisma.provider.update({ where: { id }, data });
  else await prisma.provider.create({ data });
  // Webhook FazerCards là cấu hình DÙNG CHUNG của giao thức FZR (không thuộc
  // riêng nhà cung cấp nào) — form nhà cung cấp FZR mang theo field secret;
  // nhập mới thì ghi đè Setting fzr_webhook_secret (setSetting tự mã hoá),
  // để trống = giữ nguyên. Endpoint /api/webhooks/fzr đọc đúng khóa này.
  if (data.driver === "FZR") {
    const whSecret = String(formData.get("fzr_webhook_secret") || "").trim();
    if (whSecret) await setSetting("fzr_webhook_secret", whSecret);
    // Markup theo nhóm FZR cũng cấu hình ngay trong form nhà cung cấp — cùng
    // chỗ với API key, tỉ giá và markup chung — thay vì rải ở từng trang khu.
    // Field không được gửi lên thì giữ nguyên; gửi trống thì xoá override để
    // nhóm đó quay về markup chung của nhà cung cấp.
    for (const group of FZR_MARKUP_GROUPS) {
      const field = `fzr_markup_${group}`;
      if (!formData.has(field)) continue;
      const raw = String(formData.get(field) || "").trim();
      if (!raw) {
        await prisma.setting.deleteMany({ where: { key: fzrMarkupKey(group) } });
      } else {
        const n = Math.max(0, Math.min(1000, parseInt(raw) || 0));
        await setSetting(fzrMarkupKey(group), String(n));
      }
    }
  }
  await auditAdmin(actor, "provider.save", "provider", id || data.name, `${data.name} — ${data.apiUrl}${rawKey && !rawKey.includes("•") ? " (đặt API key mới)" : ""}`);
  done("/admin/nha-cung-cap", "Đã lưu nhà cung cấp");
}

export async function adminDeleteProvider(formData: FormData) {
  const actor = await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  await prisma.provider.delete({ where: { id } });
  await auditAdmin(actor, "provider.delete", "provider", id, "Xoá nhà cung cấp");
  done("/admin/nha-cung-cap", "Đã xoá nhà cung cấp");
}

export async function adminProviderAction(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const kind = String(formData.get("kind"));
  const provider = await prisma.provider.findUnique({ where: { id } });
  if (!provider) back("/admin/nha-cung-cap", "err", "Không tìm thấy nhà cung cấp");
  try {
    if (kind === "balance") {
      const b = await providerBalance(provider);
      done("/admin/nha-cung-cap", `Số dư ${provider.name}: ${b.raw} ${b.currency} (≈ ${b.vnd.toLocaleString("vi-VN")}đ)`);
    }
    if (provider.driver === "FZR") {
      // FazerCards: đồng bộ catalog số vào Premium. Nút "kèm Steam gift" mới gọi
      // danh sách game Steam (rate-limit 1 lần/3 phút phía FZR).
      const { syncFzrCatalog } = await import("@/lib/fzr-sync");
      const withSteam = kind === "sync-steam";
      const r = await syncFzrCatalog(provider, { includeSteamGifts: withSteam });
      done("/admin/nha-cung-cap", `Đã đồng bộ catalog FZR ${provider.name} — sản phẩm: tổng ${r.total}, mới ${r.created}, cập nhật ${r.updated} · ${r.variants} gói · tắt ${r.deactivated} gói hết hàng${withSteam ? " · có kèm Steam gift" : ""}`);
    }
    const parts: string[] = [];
    if (provider.kind === "PREMIUM" || provider.kind === "BOTH") {
      try {
        const rp = await syncProviderPremium(provider);
        parts.push(`Premium: tổng ${rp.total}, mới ${rp.created}, cập nhật ${rp.updated}, ${rp.variants} gói`);
      } catch (e: any) {
        if (String((e as any)?.digest || "").startsWith("NEXT_REDIRECT")) throw e; // back()/done() ném redirect — không được nuốt thành thông báo lỗi
        parts.push(`Premium lỗi: ${String(e?.message || e)}`);
      }
    }
    done("/admin/nha-cung-cap", `Đã đồng bộ ${provider.name} — ${parts.join(" · ")}`);
  } catch (e: any) {
    if (String((e as any)?.digest || "").startsWith("NEXT_REDIRECT")) throw e; // back()/done() ném redirect — không được nuốt thành thông báo lỗi
    back("/admin/nha-cung-cap", "err", String(e?.message || "Lỗi provider"));
  }
}


export async function adminProviderMarkup(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const markupPercent = parseInt(String(formData.get("markupPercent") || "0"));
  await prisma.provider.update({ where: { id }, data: { markupPercent } });
  done("/admin/nha-cung-cap", "Đã cập nhật tỷ lệ giá");
}

export async function adminSyncAllProviders() {
  await requireAdmin();
  const providers = await prisma.provider.findMany({ where: { active: true } });
  const parts: string[] = [];
  for (const p of providers) {
    try {
      if (p.driver === "FZR") {
        const { syncFzrCatalog } = await import("@/lib/fzr-sync");
        const rf = await syncFzrCatalog(p);
        parts.push(`${p.name} FZR: ${rf.total} sản phẩm`);
        continue;
      }
      if (p.kind === "PREMIUM" || p.kind === "BOTH") {
        const rp = await syncProviderPremium(p);
        parts.push(`${p.name} Premium: ${rp.total}`);
      }
    } catch (e: any) {
      parts.push(`${p.name} lỗi: ${String(e?.message || e).slice(0, 60)}`);
    }
  }
  done("/admin/nha-cung-cap", parts.length ? `Đã đồng bộ tất cả — ${parts.join(" · ")}` : "Chưa có nhà cung cấp đang bật");
}

/* ---------- Premium ---------- */
export async function adminSavePremiumCategory(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id") || "0"));
  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || "").trim().toLowerCase();
  if (!name || !slug) back("/admin/premium/danh-muc", "err", "Thiếu tên hoặc slug");
  const data = { name, slug, description: String(formData.get("description") || "") || null, icon: String(formData.get("icon") || "").trim() || null, sort: parseInt(String(formData.get("sort") || "0")), active: formData.get("active") === "on", metaTitle: String(formData.get("metaTitle") || "").trim().slice(0, 255) || null, metaDescription: String(formData.get("metaDescription") || "").trim().slice(0, 320) || null };
  if (id) await prisma.premiumCategory.update({ where: { id }, data });
  else await prisma.premiumCategory.create({ data });
  done("/admin/premium/danh-muc", "Đã lưu danh mục premium");
}


export async function adminDeletePremiumCategory(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const count = await prisma.premiumProduct.count({ where: { categoryId: id } });
  if (count) back("/admin/premium/danh-muc", "err", "Danh mục còn sản phẩm — hãy chuyển sản phẩm sang danh mục khác trước");
  await prisma.premiumCategory.delete({ where: { id } });
  done("/admin/premium/danh-muc", "Đã xoá danh mục premium");
}

export async function adminTogglePremiumCategory(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const c = await prisma.premiumCategory.findUnique({ where: { id }, select: { active: true } });
  if (c) await prisma.premiumCategory.update({ where: { id }, data: { active: !c.active } });
  done("/admin/premium/danh-muc", c?.active ? "Đã tạm dừng danh mục" : "Đã kích hoạt danh mục");
}

export async function adminToggleProduct(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const p = await prisma.premiumProduct.findUnique({ where: { id }, select: { active: true } });
  if (p) await prisma.premiumProduct.update({ where: { id }, data: { active: !p.active } });
  done(retTo(formData), p?.active ? "Đã tạm dừng sản phẩm" : "Đã mở bán sản phẩm");
}

export async function adminSaveProduct(formData: FormData) {
  await requireAdmin();
  const rt = retTo(formData);
  const id = parseInt(String(formData.get("id") || "0"));
  const data: any = {
    categoryId: parseInt(String(formData.get("categoryId"))),
    name: String(formData.get("name") || "").trim(),
    slug: String(formData.get("slug") || "").trim().toLowerCase(),
    tagline: String(formData.get("tagline") || "") || null,
    description: String(formData.get("description") || "") || null,
    color: String(formData.get("color") || "#3178fc"),
    fulfillment: String(formData.get("fulfillment") || "MANUAL"),
    providerId: String(formData.get("fulfillment")) === "API" && formData.get("providerId") ? parseInt(String(formData.get("providerId"))) : null,
    providerProductId: String(formData.get("fulfillment")) === "API" ? String(formData.get("providerProductId") || "") || null : null,
    customFields: normalizePremiumFieldsJson(String(formData.get("customFields") || "")),
    buyNote: String(formData.get("buyNote") || "").trim().slice(0, 500) || null,
    images: (() => { const list = formData.getAll("images").map((v) => String(v).trim()).filter(Boolean).slice(0, 10); return list.length ? JSON.stringify(list) : null; })(),
    imageUrl: (() => { const first = formData.getAll("images").map((v) => String(v).trim()).filter(Boolean)[0]; return first ? first.slice(0, 500) : null; })(),
    usageGuide: String(formData.get("usageGuide") || "").trim() || null,
    warrantyInfo: String(formData.get("warrantyInfo") || "").trim() || null,
    metaTitle: String(formData.get("metaTitle") || "").trim().slice(0, 255) || null,
    metaDescription: String(formData.get("metaDescription") || "").trim().slice(0, 320) || null,
    active: formData.get("active") === "on",
    sort: parseInt(String(formData.get("sort") || "0")),
  };
  if (!data.name || !data.slug || !data.categoryId) back(rt, "err", "Thiếu tên, slug hoặc danh mục");
  if (id) { await prisma.premiumProduct.update({ where: { id }, data }); done(rt, "Đã lưu sản phẩm"); }
  await prisma.premiumProduct.create({ data });
  // Vừa tạo từ trang theo khu: quay về kèm ?q=slug để sản phẩm mới hiện ngay
  // trong tầm nhìn (trang khu tìm theo tên/slug trên toàn catalog) — admin mở
  // Gói và gán nhóm NCC là sản phẩm vào đúng khu. Tự gắn msg vì back() sẽ
  // thêm "?msg=" thứ hai nếu path đã có "?".
  if (formData.get("returnTo")) redirect(`${rt}${rt.includes("?") ? "&" : "?"}q=${encodeURIComponent(data.slug)}&msg=${encodeURIComponent("Đã lưu sản phẩm")}`);
  done(rt, "Đã lưu sản phẩm");
}

export async function adminDeleteProduct(formData: FormData) {
  await requireAdmin();
  const rt = retTo(formData);
  const id = parseInt(String(formData.get("id")));
  const count = await prisma.premiumOrder.count({ where: { variant: { productId: id } } });
  if (count) {
    await prisma.premiumProduct.update({ where: { id }, data: { active: false } });
    done(rt, "Sản phẩm đã có đơn nên chỉ tắt bán");
  }
  await prisma.premiumVariant.deleteMany({ where: { productId: id } });
  await prisma.premiumProduct.delete({ where: { id } });
  done(rt, "Đã xoá sản phẩm");
}

export async function adminSaveVariant(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id") || "0"));
  const productId = parseInt(String(formData.get("productId")));
  // Kho + loại giao hàng theo gói: AUTO_STOCK theo dõi bằng dòng kho nên ép
  // stockQty = null + outOfStock = false (không đếm hai lần); MANUAL/API mới
  // đọc số lượng kho + cờ chặn bán từ form. deliveryType áp cho mọi hình thức.
  const product = await prisma.premiumProduct.findUnique({ where: { id: productId }, select: { fulfillment: true } });
  const isAutoStock = product?.fulfillment === "AUTO_STOCK";
  const deliveryRaw = String(formData.get("deliveryType") || "");
  const stockQtyRaw = String(formData.get("stockQty") ?? "").trim();
  const stockQtyParsed = stockQtyRaw === "" ? null : parseInt(stockQtyRaw);
  const data = {
    productId,
    name: String(formData.get("name") || "").trim(),
    price: parseInt(String(formData.get("price") || "0")),
    cost: parseInt(String(formData.get("cost") || "0")),
    warrantyDays: parseInt(String(formData.get("warrantyDays") || "0")),
    providerCycle: formData.get("providerCycle") ? parseInt(String(formData.get("providerCycle"))) : null,
    // Ánh xạ NCC theo GÓI (FIX7 E2): trước đây chỉ đồng bộ FZR mới ghi được 3
    // trường này, admin không sửa tay được nên không tự dựng/gỡ ánh xạ nổi.
    providerId: formData.get("providerId") ? parseInt(String(formData.get("providerId"))) || null : null,
    providerGroup: String(formData.get("providerGroup") || "").trim() || null,
    providerItemId: String(formData.get("providerItemId") || "").trim() || null,
    deliveryType: deliveryRaw === "FAST" || deliveryRaw === "SLOW" ? deliveryRaw : null,
    outOfStock: !isAutoStock && formData.get("outOfStock") === "on",
    stockQty: isAutoStock ? null : (stockQtyParsed != null && Number.isFinite(stockQtyParsed) && stockQtyParsed >= 0 ? stockQtyParsed : null),
    active: formData.get("active") === "on",
    sort: parseInt(String(formData.get("sort") || "0")),
  };
  const rt = retTo(formData);
  if (!data.name || !data.price) back(rt, "err", "Thiếu tên gói hoặc giá");
  if (id) await prisma.premiumVariant.update({ where: { id }, data });
  else await prisma.premiumVariant.create({ data });
  done(rt, "Đã lưu gói bán");
}

export async function adminDeleteVariant(formData: FormData) {
  await requireAdmin();
  const rt = retTo(formData);
  const id = parseInt(String(formData.get("id")));
  const count = await prisma.premiumOrder.count({ where: { variantId: id } });
  if (count) {
    await prisma.premiumVariant.update({ where: { id }, data: { active: false } });
    done(rt, "Gói đã có đơn nên chỉ tắt bán");
  }
  await prisma.premiumStock.deleteMany({ where: { variantId: id } });
  await prisma.premiumVariant.delete({ where: { id } });
  done(rt, "Đã xoá gói");
}

/* ---------- Kho premium ---------- */
export async function adminImportStock(formData: FormData) {
  await requireAdmin();
  const variantId = parseInt(String(formData.get("variantId")));
  const bulk = String(formData.get("bulk") || "");
  const rawItems = bulk.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (!variantId || !rawItems.length) back("/admin/kho-premium", "err", "Chọn gói và nhập ít nhất 1 dòng kho");
  // Khử trùng: trùng trong chính lô nhập + trùng với tài khoản ĐANG CÓ trong kho
  // của gói này — một tài khoản bị nhập 2 dòng AVAILABLE sẽ bị bán cho 2 khách.
  const items = Array.from(new Set(rawItems));
  const existing = await prisma.premiumStock.findMany({ where: { variantId, status: "AVAILABLE", payload: { in: items } }, select: { payload: true } });
  const dupSet = new Set(existing.map((x) => x.payload));
  const fresh = items.filter((x) => !dupSet.has(x));
  const skipped = rawItems.length - fresh.length;
  if (fresh.length) await prisma.premiumStock.createMany({ data: fresh.map((payload) => ({ variantId, payload })) });
  done("/admin/kho-premium", `Đã nhập ${fresh.length} mục vào kho${skipped > 0 ? ` — bỏ qua ${skipped} dòng trùng` : ""}`);
}

export async function adminDeleteStock(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  await prisma.premiumStock.delete({ where: { id } });
  revalidatePath("/admin/kho-premium");
  done("/admin/kho-premium", "Đã xoá mục kho");
}

/* ---------- Đơn premium ---------- */
export async function adminPremiumOrderAction(formData: FormData) {
  await requireStaff();
  const id = parseInt(String(formData.get("id")));
  const kind = String(formData.get("kind"));
  const order = await prisma.premiumOrder.findUnique({ where: { id }, include: { variant: { include: { product: { select: { panelId: true, name: true } } } } } });
  if (!order) back("/admin/don-premium", "err", "Không tìm thấy đơn");
  const path = `/admin/don-premium/${id}`;
  if (kind === "sync") {
    try {
      const prov = order.providerId ? await prisma.provider.findUnique({ where: { id: order.providerId }, select: { driver: true } }) : null;
      const { pollFzrPremiumOrder } = await import("@/lib/fzr-orders");
      const after = prov?.driver === "FZR" ? await pollFzrPremiumOrder(order) : await syncPremiumOrderStatus(order);
      done(path, after?.deliveryData ? "Đã đồng bộ — nhà cung cấp đã bàn giao, đơn chuyển Đã giao" : "Đã đồng bộ — nhà cung cấp chưa bàn giao");
    } catch (e: any) {
      if (String((e as any)?.digest || "").startsWith("NEXT_REDIRECT")) throw e; // back()/done() ném redirect — không được nuốt thành thông báo lỗi
      back(path, "err", String(e?.message || "Đồng bộ thất bại"));
    }
  }
  if (kind === "cancel") {
    if (order.status === "REFUNDED" || order.status === "CANCELED") back(path, "err", "Đơn đã kết thúc — không hoàn tiền thêm được");
    // Claim chuyển trạng thái sang REFUNDED TRƯỚC trong transaction: huỷ lần hai
    // (hoặc hai người cùng huỷ) sẽ claim trượt và không cộng tiền lần nữa.
    let claimed = false;
    await prisma.$transaction(async (tx) => {
      const claim = await tx.premiumOrder.updateMany({
        where: { id, status: { in: ["PENDING", "DELIVERED", "COMPLETED", "WARRANTY"] } },
        data: { status: "REFUNDED" },
      });
      if (claim.count === 0) return;
      claimed = true;
      // Đơn chưa giao (PENDING) bị huỷ -> trả kho số lượng đã trừ khi đặt
      if (order.status === "PENDING") await restoreVariantStock(tx, order.variantId, order.quantity);
      await applyBalance(tx, order.userId, order.total, "REFUND", order.code, "Admin huỷ đơn premium — hoàn tiền");
    });
    if (!claimed) back(path, "err", "Đơn đã kết thúc — không hoàn tiền thêm được");
    await clawbackReferralCommission(order.userId, order.total, order.code);
    await clawbackPassCashback(order.userId, order.total, order.code);
    // Đợt 119: mail hoàn tiền cho khách (admin huỷ đơn).
    {
      const { sendCustomerMail } = await import("@/lib/customer-mail");
      const { vnd } = await import("@/lib/format");
      const u = await prisma.user.findUnique({ where: { id: order.userId }, select: { balance: true } }).catch(() => null);
      void sendCustomerMail(order.userId, "order_refunded", {
        order_code: order.code, product_name: order.variant.product.name,
        refund_amount: vnd(order.total), balance: vnd(u?.balance ?? 0),
      });
    }
    done(path, "Đã huỷ đơn và hoàn tiền");
  }
  // Cập nhật thường: đơn đã REFUNDED/CANCELED là kết thúc — không cho "hồi sinh"
  // về trạng thái sống (hồi sinh rồi huỷ lại = hoàn tiền lần hai). Hoàn tiền chỉ
  // đi qua nút Huỷ ở trên, không đặt status REFUNDED trực tiếp ở form này.
  if (order.status === "REFUNDED" || order.status === "CANCELED") back(path, "err", "Đơn đã kết thúc — không sửa được nữa");
  const deliveryData = String(formData.get("deliveryData") || "") || order.deliveryData;
  const status = String(formData.get("status") || order.status) as any;
  if (!["PENDING", "DELIVERED", "COMPLETED", "WARRANTY"].includes(status)) back(path, "err", "Trạng thái không hợp lệ — muốn hoàn tiền hãy dùng nút Huỷ đơn");
  const adminNote = String(formData.get("adminNote") || "") || order.adminNote;
  await prisma.premiumOrder.update({ where: { id }, data: { status, deliveryData, adminNote } });
  // Đợt 119: admin vừa chuyển đơn sang Đã giao/Hoàn thành (từ trạng thái
  // chưa giao) -> mail cho khách kèm nội dung đã giao.
  if ((status === "DELIVERED" || status === "COMPLETED") && order.status !== "DELIVERED" && order.status !== "COMPLETED") {
    const { sendCustomerMail } = await import("@/lib/customer-mail");
    void sendCustomerMail(order.userId, "order_delivered", {
      order_code: order.code, product_name: order.variant.product.name, variant_name: order.variant.name,
      delivery_content: deliveryData || "",
    });
  }
  done(path, "Đã cập nhật đơn premium");
}

/* ---------- Nạp tiền ---------- */
/** Ghi log lần kiểm tra cổng gần nhất vào Settings — mở lại trang cấu hình
 *  là thấy lần test cuối (giờ + đạt/không + chi tiết). */
async function recordGatewayTest(method: "sepay" | "boltutil" | "paypal" | "stripe", ok: boolean, detail: string) {
  await setSetting(`gateway_test_${method}`, JSON.stringify({ at: new Date().toISOString(), ok, detail: detail.slice(0, 250) }));
}

/** Kiểm tra kết nối BoltUtil — tài liệu không có endpoint ping nên boltPing
 *  dò bằng POST /api/v1/order/status (404 = xác thực hợp lệ). Nút nằm TRONG
 *  thẻ BoltUtil, ưu tiên API key/secret admin vừa gõ trong form (chưa lưu)
 *  như các cổng khác. */
export async function adminBoltPingAction(formData?: FormData) {
  await requireAdmin();
  const s = await getSettings();
  const { getBoltConfig, boltPing } = await import("@/lib/boltutil");
  const base = await getBoltConfig();
  const cfg: Awaited<ReturnType<typeof getBoltConfig>> = { ...base };
  if (formData) {
    const k = pickSubmitted(formData, "boltutil_api_key", base.apiKey);
    if (k) cfg.apiKey = k;
    const w = pickSubmitted(formData, "boltutil_webhook_secret", base.webhookSecret);
    if (w) cfg.webhookSecret = w;
    const u = String(formData.get("boltutil_api_url") || "").trim();
    if (u) cfg.apiUrl = u;
  }
  if (!cfg.apiKey || !cfg.webhookSecret) {
    await recordGatewayTest("boltutil", false, "Chưa nhập API key / webhook secret");
    back("/admin/cau-hinh-nap-tien", "err", "Chưa nhập API key / webhook secret của BoltUtil");
  }
  // KHÔNG gọi back() trong try: back() ném NEXT_REDIRECT, catch sẽ nuốt mất
  // và biến kết quả thành công thành "thất bại: NEXT_REDIRECT".
  let pingErr = "";
  try {
    await boltPing(cfg);
  } catch (e: any) {
    pingErr = String(e?.message || e).slice(0, 160);
  }
  await recordGatewayTest("boltutil", !pingErr, pingErr || "API key và chữ ký hợp lệ (ping)");
  if (pingErr) back("/admin/cau-hinh-nap-tien", "err", `Kết nối BoltUtil thất bại: ${pingErr}`);
  back("/admin/cau-hinh-nap-tien", "msg", "Kết nối BoltUtil OK — API key và chữ ký hợp lệ");
}

/** Ưu tiên giá trị admin VỪA GÕ trong form (chưa lưu) để test trước khi lưu;
 *  trống hoặc còn dấu • che thì dùng giá trị đã lưu. */
const pickSubmitted = (formData: FormData, name: string, saved: string) => {
  const v = String(formData.get(name) || "").trim();
  return v && !v.includes("•") ? v : saved;
};

/** Kiểm tra kết nối Stripe (GET /v1/balance bằng Secret Key). */
export async function adminStripeTestAction(formData: FormData) {
  await requireAdmin();
  const s = await getSettings();
  const key = pickSubmitted(formData, "stripe_secret_key", String(s.stripe_secret_key || "").trim());
  if (!key) {
    await recordGatewayTest("stripe", false, "Chưa nhập Secret Key");
    back("/admin/cau-hinh-nap-tien", "err", "Chưa nhập Secret Key của Stripe");
  }
  const { stripeTestConnection } = await import("@/lib/payments");
  let detail = "";
  let testErr = "";
  try {
    detail = await stripeTestConnection(key);
  } catch (e: any) {
    testErr = String(e?.message || e).slice(0, 160);
  }
  await recordGatewayTest("stripe", !testErr, testErr || detail);
  if (testErr) back("/admin/cau-hinh-nap-tien", "err", `Kết nối Stripe thất bại: ${testErr}`);
  back("/admin/cau-hinh-nap-tien", "msg", `Kết nối Stripe OK — ${detail}`);
}

/** Kiểm tra kết nối PayPal (xin access token OAuth bằng Client ID/Secret). */
export async function adminPaypalTestAction(formData: FormData) {
  await requireAdmin();
  const s = await getSettings();
  const clientId = String(formData.get("paypal_client_id") || "").trim() || String(s.paypal_client_id || "").trim();
  const secret = pickSubmitted(formData, "paypal_client_secret", String(s.paypal_client_secret || "").trim());
  const mode = String(formData.get("paypal_mode") || s.paypal_mode || "sandbox");
  if (!clientId || !secret) {
    await recordGatewayTest("paypal", false, "Chưa nhập Client ID / Client Secret");
    back("/admin/cau-hinh-nap-tien", "err", "Chưa nhập Client ID / Client Secret của PayPal");
  }
  const { paypalTestConnection } = await import("@/lib/payments");
  let detail = "";
  let testErr = "";
  try {
    detail = await paypalTestConnection(clientId, secret, mode);
  } catch (e: any) {
    testErr = String(e?.message || e).slice(0, 160);
  }
  await recordGatewayTest("paypal", !testErr, testErr || detail);
  if (testErr) back("/admin/cau-hinh-nap-tien", "err", `Kết nối PayPal thất bại: ${testErr}`);
  back("/admin/cau-hinh-nap-tien", "msg", `Kết nối PayPal OK — ${detail}`);
}

/** Kiểm tra TRẠNG THÁI SePay — SePay không có API gọi thử tương đương cho
 *  secret webhook, nên mức kiểm tra trung thực là: URL webhook đã cấu hình
 *  + lần webhook gần nhất hệ thống nhận được (ApiLog kind "webhook" /
 *  WebhookReceipt). KHÔNG giả vờ đã gọi thử SePay. */
export async function adminSepayStatusAction() {
  await requireAdmin();
  const s = await getSettings();
  const base = siteUrlFromSettings(s) || "https://your-domain.vn";
  const url = `${base}/api/webhooks/sepay`;
  const lastLog = await prisma.apiLog.findFirst({ where: { kind: "webhook" }, orderBy: { id: "desc" }, select: { createdAt: true } });
  const lastReceipt = await prisma.webhookReceipt.findFirst({ orderBy: { id: "desc" }, select: { createdAt: true } });
  const lastAt = lastLog?.createdAt || lastReceipt?.createdAt || null;
  const lastText = lastAt ? new Date(lastAt).toLocaleString("vi-VN") : "chưa nhận webhook nào";
  if (!s.sepay_secret) {
    await recordGatewayTest("sepay", false, `Chưa cấu hình secret webhook · Webhook gần nhất: ${lastText}`);
    back("/admin/cau-hinh-nap-tien", "err", `SePay: chưa cấu hình secret webhook. URL webhook: ${url} · Lần nhận gần nhất: ${lastText}`);
  }
  const detail = `URL webhook đã cấu hình · Webhook gần nhất: ${lastText}`;
  await recordGatewayTest("sepay", true, detail);
  back("/admin/cau-hinh-nap-tien", "msg", `Trạng thái SePay — ${detail} (${url})`);
}

/** Cập nhật tỉ giá thị trường NGAY — lưu trước các ô tỉ giá đang có trong
 *  form (tay/khoá/biên/công tắc), rồi kéo số auto từ nguồn chính Frankfurter
 *  (lỗi thì dự phòng open.er-api). Đồng khoá tay không bị ghi đè. */
export async function adminFetchRatesNowAction(formData?: FormData) {
  await requireAdmin();
  const { applyMarketRates, saveFxSettingsForm } = await import("@/lib/rates");
  let result: Awaited<ReturnType<typeof applyMarketRates>> | null = null;
  let fetchErr = "";
  try {
    if (formData && String(formData.get("rates_form_full") || "") === "1") await saveFxSettingsForm(formData);
    result = await applyMarketRates({ force: true });
  } catch (e: any) {
    fetchErr = String(e?.message || e).slice(0, 160);
  }
  if (fetchErr || !result) back("/admin/cau-hinh-nap-tien", "err", `Cập nhật tỉ giá thất bại: ${fetchErr}`);
  const s = await getSettings();
  back("/admin/cau-hinh-nap-tien", "msg", `Đã kéo tỉ giá tự động (${result.updated.join(", ")}) từ ${result.source} — 1 USD đang dùng = ${Number(s.usd_rate || 0).toLocaleString("vi-VN")}đ`);
}

export async function adminDepositAction(formData: FormData) {
  const actor = await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const kind = String(formData.get("kind"));
  const dep = await prisma.deposit.findUnique({ where: { id }, include: { user: { select: { panelId: true } } } });
  if (!dep || dep.status !== "PENDING") back("/admin/nap-tien", "err", "Yêu cầu nạp không còn chờ duyệt");
  if (kind === "bolt-sync") {
    // Đồng bộ trạng thái 1 yêu cầu nạp BoltUtil ngay (hỏi cổng + đối soát cộng tiền)
    const { pollBoltutilDeposit } = await import("@/lib/boltutil");
    const r = await pollBoltutilDeposit(id).catch((e: any) => ({ ok: false, reason: String(e?.message || e) }));
    await auditAdmin(actor, "deposit.bolt_sync", "deposit", id, `${dep.code} — ${r.reason}`);
    if (r.ok && r.reason === "credited") done("/admin/nap-tien", `Đã cộng tiền cho ${dep.code} từ BoltUtil`);
    back("/admin/nap-tien", r.ok ? "msg" : "err", `BoltUtil: ${r.reason}`);
  }
  if (kind === "reject") {
    // Claim PENDING -> REJECTED nguyên tử: đã có người duyệt trước thì không ghi đè
    const claim = await prisma.deposit.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", adminNote: String(formData.get("adminNote") || "") || null } });
    if (claim.count === 0) back("/admin/nap-tien", "err", "Yêu cầu nạp không còn chờ duyệt");
    await auditAdmin(actor, "deposit.reject", "deposit", id, `${dep.code} — ${dep.amount}đ của user ${dep.userId}`);
    void (async () => { const { evaluateUserRisk } = await import("@/lib/risk"); await evaluateUserRisk(dep.userId); })();
    done("/admin/nap-tien", "Đã từ chối yêu cầu nạp");
  }
  // GĐ2: duyệt nạp từ ngưỡng cấu hình trở lên (mặc định 1.000.000đ; 0 = mọi lần) phải xác thực lại
  {
    const threshold = parseInt((await getSettings()).stepup_amount_threshold || "1000000") || 0;
    if (threshold === 0 || dep.amount >= threshold) await assertStepUp(actor.id, "/admin/nap-tien");
  }
  // Claim PENDING -> APPROVED TRONG transaction: hai lần duyệt đồng thời (2 tab,
  // double-click) chỉ một lần claim được và cộng tiền — lần sau count = 0, bỏ qua.
  let claimed = false;
  await prisma.$transaction(async (tx) => {
    const claim = await tx.deposit.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED" } });
    if (claim.count === 0) return;
    claimed = true;
    await applyBalance(tx, dep.userId, dep.amount, "DEPOSIT", dep.code, "Admin duyệt nạp tiền");
    if (dep.bonus > 0) await applyBalance(tx, dep.userId, dep.bonus, "BONUS", dep.code, "Thưởng nạp tiền");
  });
  if (!claimed) back("/admin/nap-tien", "err", "Yêu cầu nạp không còn chờ duyệt");
  await auditAdmin(actor, "deposit.approve", "deposit", id, `${dep.code} — cộng ${dep.amount}đ${dep.bonus > 0 ? ` + thưởng ${dep.bonus}đ` : ""} cho user ${dep.userId}`);
  // Đợt 119: mail nạp tiền thành công cho khách (admin duyệt nạp).
  {
    const { sendCustomerMail } = await import("@/lib/customer-mail");
    const { vnd } = await import("@/lib/format");
    const u = await prisma.user.findUnique({ where: { id: dep.userId }, select: { balance: true } }).catch(() => null);
    void sendCustomerMail(dep.userId, "deposit_success", {
      deposit_code: dep.code, amount: vnd(dep.amount), bonus: vnd(dep.bonus), balance: vnd(u?.balance ?? 0),
    });
  }
  void (async () => { const { evaluateUserRisk } = await import("@/lib/risk"); await evaluateUserRisk(dep.userId); })();
  done("/admin/nap-tien", `Đã cộng ${dep.amount.toLocaleString("vi-VN")}đ cho khách`);
}

export async function adminManualDeposit(formData: FormData) {
  const actor = await requireAdmin();
  await assertStepUp(actor.id, "/admin/nap-tien");
  const userId = parseInt(String(formData.get("userId")));
  const amount = parseInt(String(formData.get("amount") || "0"));
  if (!userId || amount <= 0) back("/admin/nap-tien", "err", "Chọn khách và số tiền hợp lệ");
  await assertMotherAccount(userId, "/admin/nap-tien");
  const dep = await prisma.deposit.create({
    data: { code: "TMP", userId, method: "BANK", amount, status: "APPROVED", content: "Admin cộng tay" },
  });
  const code = genCode("NAP", dep.id);
  await prisma.$transaction(async (tx) => {
    await tx.deposit.update({ where: { id: dep.id }, data: { code } });
    await applyBalance(tx, userId, amount, "DEPOSIT", code, "Admin cộng tiền tay");
  });
  await auditAdmin(actor, "deposit.manual", "user", userId, `Cộng tiền tay ${amount}đ (mã ${code})`);
  // Đợt 119: mail nạp tiền thành công cho khách (admin cộng tay).
  {
    const { sendCustomerMail } = await import("@/lib/customer-mail");
    const { vnd } = await import("@/lib/format");
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } }).catch(() => null);
    void sendCustomerMail(userId, "deposit_success", {
      deposit_code: code, amount: vnd(amount), bonus: vnd(0), balance: vnd(u?.balance ?? 0),
    });
  }
  done("/admin/nap-tien", `Đã cộng ${amount.toLocaleString("vi-VN")}đ`);
}

/* ---------- Ticket ---------- */

export async function adminReplyTicket(formData: FormData) {
  await requireStaff();
  const ticketId = parseInt(String(formData.get("ticketId")));
  const tk = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { userId: true, subject: true, user: { select: { panelId: true } } } });
  const body = String(formData.get("body") || "").trim();
  const close = formData.get("close") === "on";
  if (body) await prisma.ticketMessage.create({ data: { ticketId, body, fromAdmin: true, attachments: cleanAttachments(formData.get("attachments")) } });
  await prisma.ticket.update({ where: { id: ticketId }, data: { status: close ? "CLOSED" : "ANSWERED" } });
  // Đợt 119: mail cho khách khi nhân viên trả lời ticket (chỉ khi có nội dung trả lời).
  if (body && tk) {
    const { sendCustomerMail } = await import("@/lib/customer-mail");
    const { siteBaseUrl } = await import("@/lib/email-verify");
    const { getSiteUrl } = await import("@/lib/settings");
    const mailBase = (await getSiteUrl().catch(() => "")) || siteBaseUrl();
    void sendCustomerMail(tk.userId, "ticket_replied", {
      ticket_id: ticketId, ticket_subject: tk.subject, ticket_url: `${mailBase}/dashboard/ticket`,
    });
  }
  redirect(`/admin/ticket/${ticketId}`);
}

/* ---------- Cấu hình + thông báo ---------- */
export async function adminSaveSettings(formData: FormData) {
  const actor = await requireAdmin();
  // GĐ2: form chứa khoá bí mật/cấu hình thanh toán thì phải xác thực lại trước khi lưu
  const SENSITIVE_KEYS = ["sepay_secret", "stripe_secret_key", "stripe_webhook_secret", "paypal_client_secret", "usdt_address", "cron_secret", "tool_api_key", "smtp_pass", "google_client_secret", "telegram_bot_token", "ai_api_key", "ai_meta_api_key", "recaptcha_secret"];
  if (SENSITIVE_KEYS.some((k) => { const v = formData.get(k); return v !== null && String(v).trim() !== ""; })) {
    await assertStepUp(actor.id, "/admin/cau-hinh");
  }
  // Liên kết web (đợt 120): kiểm tra hợp lệ PHÍA MÁY CHỦ trước khi lưu bất
  // cứ thứ gì — giá trị lạ (không phải URL http/https đầy đủ) thì từ chối
  // cả lượt lưu kèm thông báo rõ, không để lọt vào DB rồi thành liên kết
  // gửi khách. Giá trị hợp lệ được lưu ở dạng ĐÃ CHUẨN HOÁ (bỏ "/" cuối).
  const rawSiteUrl = formData.get("site_url");
  if (rawSiteUrl !== null) {
    const trimmed = String(rawSiteUrl).trim();
    if (trimmed && !normalizeSiteUrl(trimmed)) {
      back("/admin/cau-hinh", "err", "Liên kết web không hợp lệ — phải là URL http/https đầy đủ, ví dụ https://bntshop.com");
    }
    if (trimmed) formData.set("site_url", normalizeSiteUrl(trimmed));
  }
  const keys = [
    "site_name", "site_url", "site_tagline", "support_telegram", "support_facebook", "support_zalo", "support_hotline",
    "child_ns1", "child_ns2",
    "bank_name", "bank_account", "bank_holder", "bank_branch",
    "deposit_min", "deposit_bonus_tiers", "maintenance", "announcement_bar", "sys_announce_enabled", "sys_announce_content", "affiliate_percent", "affiliate_withdraw_min",
    "usd_rate", "paypal_enabled", "paypal_client_id", "paypal_client_secret", "paypal_mode",
    "stripe_enabled", "stripe_publishable_key", "stripe_secret_key", "stripe_webhook_secret", "profit_protection",
    "default_accent", "default_mode",
    "smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "smtp_secure",
    "telegram_bot_token", "telegram_chat_id", "telegram_notify",
    "custom_head_html", "custom_body_html", "password_min_length",
    "ai_enabled", "ai_provider", "ai_base_url", "ai_api_key", "ai_model", "ai_meta_api_key", "ai_meta_model", "ai_check_enabled", "tool_api_key",
    "google_enabled", "google_client_id", "google_client_secret",
    "sepay_secret", "cron_secret",
    "usdt_enabled", "usdt_address", "usdt_network", "usdt_rate",
    "rate_eur", "rate_cny", "rate_thb", "rate_jpy", "rate_krw",
    "auth_style",
    "logo_url", "logo_menu_url", "favicon_url", "meta_description", "meta_keywords", "og_image_url", "contact_email", "footer_text",
    "home_modal_enabled", "home_modal_content",
    "terms_enabled", "terms_title", "terms_content", "terms_version", "terms_checkbox_text", "terms_button_text",
    "telegram_bots",
    "pw_require_upper", "pw_require_number", "pw_require_special",
    "recaptcha_enabled", "recaptcha_site_key", "recaptcha_secret", "recaptcha_login", "recaptcha_register",
    "bf_enabled", "bf_max_attempts", "bf_lock_seconds",
    "reg_honeypot", "reg_block_disposable", "reg_max_per_ip_hour", "reg_banned_domains",
    "smtp_enabled", "smtp_from_name", "module_affiliate", "session_days", "premium_max_qty", "order_max_links",
    "provider_low_balance_default", "subscription_max_active",
    "auto_refill_window_days", "auto_refill_settle_minutes", "cleanup_retention_days", "usdt_min",
    "points_per_100k", "points_value_vnd", "points_min_redeem", "ga_id", "gsc_verification",
    "seo_default_title", "seo_title_template", "og_title", "og_description", "twitter_card", "seo_indexing", "seo_home_title", "seo_home_description",
    "catalog_page_size", "history_page_size", "admin_product_page_size", "admin_list_page_size",
    "watermark_enabled", "watermark_text", "watermark_opacity",
    "password_reset_ttl_minutes", "email_verify_ttl_hours", "flash_max_percent",
    "seasonal_decor_enabled", "seasonal_theme",
    "pass_enabled", "pass_name", "pass_price_1m", "pass_price_3m", "pass_price_12m",
    "pass_cashback_percent", "pass_discount_percent", "pass_scope", "pass_gift_product_id", "pass_gift_variant_id",
  ];
  const savedKeys: string[] = [];
  for (const k of keys) {
    const v = formData.get(k);
    if (v !== null) { await setSetting(k, String(v).trim()); savedKeys.push(k); }
  }
  // Ô tỉ giá ở trang này là tỉ giá TAY: mirror sang fx_manual_* rồi đồng bộ
  // lại tỉ giá đang dùng (đồng đang dùng auto không khoá tay vẫn theo auto).
  const RATE_MIRROR: Record<string, string> = { usd_rate: "usd", rate_eur: "eur", rate_cny: "cny", rate_thb: "thb", rate_jpy: "jpy", rate_krw: "krw", usdt_rate: "usdt" };
  let mirrored = false;
  for (const [k, lc] of Object.entries(RATE_MIRROR)) {
    if (savedKeys.includes(k)) { await setSetting(`fx_manual_${lc}`, String(formData.get(k) || "").trim()); mirrored = true; }
  }
  if (mirrored) {
    const { syncAllEffectiveRates } = await import("@/lib/rates");
    await syncAllEffectiveRates();
  }
  await auditAdmin(actor, "settings.update", "setting", "adminSaveSettings", `Lưu ${savedKeys.length} mục cấu hình`);
  done("/admin/cau-hinh", "Đã lưu cấu hình");
}


/** Xoá giao dịch nạp: theo danh sách id đã chọn, hoặc toàn bộ (chỉ tài khoản web mẹ). */
export async function adminDeleteDepositsAction(formData: FormData) {
  await requireAdmin();
  // Không xoá yêu cầu nạp ĐÃ DUYỆT: tiền đã cộng vào số dư khách, xoá là mất
  // dấu vết kiểm toán giữa sổ giao dịch và yêu cầu nạp gốc.
  if (formData.get("all") === "1") {
    await prisma.deposit.deleteMany({ where: { status: { not: "APPROVED" } } });
  } else {
    const ids = formData.getAll("ids").map((x) => parseInt(String(x))).filter((n) => n > 0);
    if (ids.length) await prisma.deposit.deleteMany({ where: { id: { in: ids }, status: { not: "APPROVED" } } });
  }
  redirect("/admin/nap-tien?msg=" + encodeURIComponent("Đã xoá giao dịch nạp"));
}

/** Lưu cấu hình phương thức nạp + khuyến mãi (trang Cấu hình nạp tiền / Khuyến mãi).
 *  Chỉ lưu key có mặt trong form; secret để trống = giữ nguyên giá trị cũ. */
export async function adminSaveMethodsAction(formData: FormData) {
  const actor = await requireAdmin();
  const SECRET_KEYS = ["sepay_secret", "paypal_client_secret", "stripe_secret_key", "stripe_webhook_secret", "boltutil_api_key", "boltutil_webhook_secret"];
  if (SECRET_KEYS.some((k) => { const v = formData.get(k); return v !== null && String(v).trim() !== ""; })) {
    await assertStepUp(actor.id, "/admin/cau-hinh-nap-tien");
  }
  const keys = [
    "sepay_secret", "intl_min_usd", "usd_rate", "deposit_min", "deposit_bonus_tiers", "affiliate_percent",
    "usdt_rate", "usdt_min", "purchase_payment_expires_minutes",
    "boltutil_enabled", "boltutil_api_key", "boltutil_webhook_secret", "boltutil_api_url", "boltutil_default_network", "boltutil_expires_minutes", "boltutil_payment_method",
    "paypal_enabled", "paypal_client_id", "paypal_client_secret", "paypal_mode",
    "stripe_enabled", "stripe_publishable_key", "stripe_secret_key", "stripe_webhook_secret",
  ];
  for (const k of keys) {
    const v = formData.get(k);
    if (v === null) continue;
    const val = String(v).trim();
    if (!val && SECRET_KEYS.includes(k)) continue;
    await setSetting(k, val);
  }
  // Mạng BoltUtil là CHIP chọn sẵn (không gõ tay): nhiều checkbox cùng tên —
  // gom lại thành đúng định dạng cũ "TRON,BSC", chỉ nhận mã trong BOLT_NETWORKS.
  if (formData.get("boltutil_networks_present") === "1") {
    const { BOLT_NETWORKS } = await import("@/lib/boltutil");
    const nets = formData.getAll("boltutil_networks").map(String).filter((n) => (BOLT_NETWORKS as readonly string[]).includes(n));
    await setSetting("boltutil_networks", nets.filter((n, i) => nets.indexOf(n) === i).join(","));
  }
  // Tick "thanh toán trực tiếp khi mua hàng" từng cổng: form của cổng nào có
  // field ẩn *_present thì mới ghi (cả khi bỏ tick -> "0"), tránh form cổng
  // này ghi đè tick của cổng khác.
  for (const k of ["direct_sepay_enabled", "direct_boltutil_enabled", "direct_stripe_enabled", "direct_paypal_enabled"]) {
    if (formData.get(`${k}_present`) === "1") {
      await setSetting(k, formData.get(k) === "1" ? "1" : "0");
    }
  }
  // Tick mục đích "Nạp vào ví" (= setting *_enabled cũ của từng cổng; SePay
  // có setting riêng mặc định bật) — cùng cơ chế *_present như tick trực tiếp.
  for (const k of ["sepay_enabled", "boltutil_enabled", "paypal_enabled", "stripe_enabled"]) {
    if (formData.get(`${k}_present`) === "1") {
      await setSetting(k, formData.get(k) === "1" ? "1" : "0");
    }
  }
  await auditAdmin(actor, "settings.update", "setting", "adminSaveMethods", "Lưu cấu hình phương thức nạp/khuyến mãi");
  const backTo = String(formData.get("back") || "/admin/cau-hinh-nap-tien");
  redirect((backTo.startsWith("/admin/") ? backTo : "/admin/cau-hinh-nap-tien") + "?msg=" + encodeURIComponent("Đã lưu cấu hình"));
}

/* ---------- Quản lý ngôn ngữ (Admin → Ngôn ngữ) ---------- */
function readMotherLangOverrides(s: Record<string, string>): LangOverrides {
  try {
    return sanitizeOverrides(JSON.parse(s.lang_overrides || "{}"));
  } catch {
    return {};
  }
}
const langDest = (lang: string) => `/admin/ngon-ngu?lang=${encodeURIComponent(lang)}`;

export async function adminSaveLangSettingsAction(formData: FormData) {
  await requireAdmin();
  const enabled = formData.getAll("lang_enabled").map(String);
  const def = String(formData.get("default_lang") || "");
  if (!enabled.length) back("/admin/ngon-ngu", "err", "Phải bật ít nhất một ngôn ngữ");
  if (!LANG_KEYS.includes(def)) back("/admin/ngon-ngu", "err", "Ngôn ngữ mặc định không hợp lệ");
  if (!enabled.includes(def)) back("/admin/ngon-ngu", "err", "Ngôn ngữ mặc định phải nằm trong danh sách đang bật — hãy bật nó hoặc chọn mặc định khác");
  await setSetting("langs_enabled", JSON.stringify(sanitizeEnabled(enabled)));
  await setSetting("default_lang", def);
  done("/admin/ngon-ngu", "Đã lưu cấu hình ngôn ngữ");
}

export async function adminSaveLangOverridesAction(formData: FormData) {
  await requireAdmin();
  const lang = String(formData.get("lang") || "");
  if (!LANG_KEYS.includes(lang) || lang === "vi") back("/admin/ngon-ngu", "err", "Ngôn ngữ không hợp lệ");
  const s = await getSettings();
  const all = readMotherLangOverrides(s);
  const cur: Record<string, string> = { ...(all[lang] || {}) };
  const n = parseInt(String(formData.get("n") || "0")) || 0;
  for (let i = 0; i < n; i++) {
    const key = String(formData.get(`k_${i}`) || "");
    if (!key || !(key in DICT)) continue;
    const val = String(formData.get(`v_${i}`) || "").trim();
    const dictVal = (DICT[key] as unknown as Record<string, string>)?.[lang] || "";
    if (!val || val === dictVal) delete cur[key];
    else cur[key] = val;
  }
  if (Object.keys(cur).length) all[lang] = cur;
  else delete all[lang];
  await setSetting("lang_overrides", JSON.stringify(all));
  redirect(langDest(lang) + "&msg=" + encodeURIComponent("Đã lưu bản dịch tuỳ chỉnh — áp dụng ngay trên toàn bộ website"));
}

export async function adminResetLangOverrideAction(formData: FormData) {
  await requireAdmin();
  const lang = String(formData.get("lang") || "");
  const key = String(formData.get("rk") || "");
  if (!LANG_KEYS.includes(lang) || lang === "vi" || !key) back("/admin/ngon-ngu", "err", "Dữ liệu không hợp lệ");
  const s = await getSettings();
  const all = readMotherLangOverrides(s);
  if (all[lang]) {
    delete all[lang][key];
    if (!Object.keys(all[lang]).length) delete all[lang];
  }
  await setSetting("lang_overrides", JSON.stringify(all));
  redirect(langDest(lang) + "&msg=" + encodeURIComponent("Đã đưa chuỗi về bản dịch gốc"));
}

/* ---------- GĐ2: buộc đăng xuất mọi thiết bị của một tài khoản ---------- */
export async function adminForceLogoutAction(formData: FormData) {
  const actor = await requireAdmin();
  const userId = parseInt(String(formData.get("userId") || "0"));
  if (!userId) back("/admin/nguoi-dung", "err", "Thiếu tài khoản");
  await assertMotherAccount(userId, "/admin/nguoi-dung");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  });
  await auditAdmin(actor, "user.force_logout", "user", userId, "Buộc đăng xuất mọi thiết bị (tăng sessionVersion + thu hồi mọi phiên)");
  done(`/admin/nguoi-dung/${userId}`, "Đã đăng xuất tài khoản này khỏi mọi thiết bị");
}
