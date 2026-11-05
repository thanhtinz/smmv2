"use server";
import { prisma } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { applyBalance, clawbackReferralCommission } from "@/lib/wallet";
import { refundSmmOrder, syncSmmOrderStatus, syncPremiumOrderStatus } from "@/lib/orders";
import { orderTransition } from "@/lib/notify";
import { providerBalance, syncProviderServices, syncProviderPremium } from "@/lib/provider";
import { setSetting } from "@/lib/settings";
import { genCode, normalizePremiumFieldsJson } from "@/lib/format";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}
const done = (path: string, text = "Đã lưu") => back(path, "msg", text);

/* ---------- Người dùng ---------- */
export async function adminAdjustBalance(formData: FormData) {
  await requireAdmin();
  const userId = parseInt(String(formData.get("userId")));
  const amount = parseInt(String(formData.get("amount") || "0"));
  const note = String(formData.get("note") || "Admin điều chỉnh số dư");
  if (!userId || !amount) back("/admin/nguoi-dung", "err", "Số tiền không hợp lệ");
  await prisma.$transaction(async (tx) => {
    await applyBalance(tx, userId, amount, "ADJUST", undefined, note);
  });
  revalidatePath("/admin/nguoi-dung");
  done(`/admin/nguoi-dung/${userId}`, amount > 0 ? `Đã cộng ${amount.toLocaleString("vi-VN")}đ` : `Đã trừ ${Math.abs(amount).toLocaleString("vi-VN")}đ`);
}

export async function adminUpdateUser(formData: FormData) {
  await requireAdmin();
  const userId = parseInt(String(formData.get("userId")));
  const data: any = {
    level: String(formData.get("level") || "MEMBER"),
    status: String(formData.get("status") || "ACTIVE"),
    // Đổi vai trò: chỉ ADMIN (requireAdmin đã chốt cứng ở trên)
    role: String(formData.get("role") || "USER"),
  };
  await prisma.user.update({ where: { id: userId }, data });
  done(`/admin/nguoi-dung/${userId}`, "Đã cập nhật người dùng");
}

/* ---------- Danh mục + dịch vụ SMM ---------- */
export async function adminSaveCategory(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id") || "0"));
  const data = {
    platform: String(formData.get("platform") || "other"),
    name: String(formData.get("name") || "").trim(),
    sort: parseInt(String(formData.get("sort") || "0")),
    active: formData.get("active") === "on",
  };
  if (!data.name) back("/admin/danh-muc", "err", "Thiếu tên danh mục");
  if (id) await prisma.smmCategory.update({ where: { id }, data });
  else await prisma.smmCategory.create({ data });
  done("/admin/danh-muc", "Đã lưu danh mục");
}

export async function adminDeleteCategory(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const count = await prisma.smmService.count({ where: { categoryId: id } });
  if (count) back("/admin/danh-muc", "err", "Danh mục còn dịch vụ — hãy chuyển dịch vụ sang danh mục khác trước");
  await prisma.smmCategory.delete({ where: { id } });
  done("/admin/danh-muc", "Đã xoá danh mục");
}

export async function adminSaveService(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id") || "0"));
  const fulfillment = String(formData.get("fulfillment") || "MANUAL") as "API" | "MANUAL";
  const data: any = {
    categoryId: parseInt(String(formData.get("categoryId"))),
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "") || null,
    rate: parseInt(String(formData.get("rate") || "0")),
    costRate: parseInt(String(formData.get("costRate") || "0")),
    min: parseInt(String(formData.get("min") || "10")),
    max: parseInt(String(formData.get("max") || "100000")),
    avgTime: String(formData.get("avgTime") || "") || null,
    type: String(formData.get("type") || "Default"),
    customMarkup: formData.get("customMarkup") === "" || formData.get("customMarkup") == null ? null : parseInt(String(formData.get("customMarkup"))),
    refill: formData.get("refill") === "on",
    cancelable: formData.get("cancelable") === "on",
    dripfeed: formData.get("dripfeed") === "on",
    fulfillment,
    providerId: fulfillment === "API" && formData.get("providerId") ? parseInt(String(formData.get("providerId"))) : null,
    providerServiceId: fulfillment === "API" ? String(formData.get("providerServiceId") || "") || null : null,
    backupProviderId: fulfillment === "API" && formData.get("backupProviderId") ? parseInt(String(formData.get("backupProviderId"))) : null,
    backupProviderServiceId: fulfillment === "API" ? String(formData.get("backupProviderServiceId") || "") || null : null,
    backupCostRate: parseInt(String(formData.get("backupCostRate") || "0")),
    autoRefill: formData.get("autoRefill") === "on",
    active: formData.get("active") === "on",
    sort: parseInt(String(formData.get("sort") || "0")),
  };
  if (!data.name || !data.categoryId) back("/admin/dich-vu", "err", "Thiếu tên hoặc danh mục");
  if (id) await prisma.smmService.update({ where: { id }, data });
  else await prisma.smmService.create({ data });
  done("/admin/dich-vu", "Đã lưu dịch vụ");
}

export async function adminDeleteService(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const count = await prisma.smmOrder.count({ where: { serviceId: id } });
  if (count) {
    await prisma.smmService.update({ where: { id }, data: { active: false } });
    done("/admin/dich-vu", "Dịch vụ đã có đơn nên chỉ tắt bán (không xoá để giữ lịch sử)");
  }
  await prisma.smmService.delete({ where: { id } });
  done("/admin/dich-vu", "Đã xoá dịch vụ");
}

/* ---------- Nhà cung cấp API ---------- */
export async function adminSaveProvider(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id") || "0"));
  const rawKey = String(formData.get("apiKey") || "").trim();
  const data: any = {
    kind: (String(formData.get("kind") || "BOTH") as "SMM" | "PREMIUM" | "BOTH"),
    name: String(formData.get("name") || "").trim(),
    apiUrl: String(formData.get("apiUrl") || "").trim(),
    apiKey: String(formData.get("apiKey") || "").trim(),
    currency: String(formData.get("currency") || "VND"),
    exchangeRate: parseInt(String(formData.get("exchangeRate") || "1")),
    markupPercent: parseInt(String(formData.get("markupPercent") || "30")),
    syncServices: formData.get("syncServices") !== "off",
    syncCategories: formData.get("syncCategories") !== "off",
    autoUpdatePrice: formData.get("autoUpdatePrice") !== "off",
    minBalanceAlert: parseInt(String(formData.get("minBalanceAlert") || "0")),
    dailyLimit: parseInt(String(formData.get("dailyLimit") || "0")),
    active: formData.get("active") === "on",
    note: String(formData.get("note") || "") || null,
  };
  if (!data.name || !data.apiUrl) back("/admin/nha-cung-cap", "err", "Thiếu tên hoặc API URL");
  if (id && (!rawKey || rawKey.includes("•"))) { const oldP = await prisma.provider.findUnique({ where: { id } }); if (oldP) data["api" + "Key"] = (oldP as any)["api" + "Key"]; }
  if (!data.apiKey) back("/admin/nha-cung-cap", "err", "Thiếu API key");
  if (id) await prisma.provider.update({ where: { id }, data });
  else await prisma.provider.create({ data });
  done("/admin/nha-cung-cap", "Đã lưu nhà cung cấp");
}

export async function adminDeleteProvider(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  await prisma.smmService.updateMany({ where: { providerId: id }, data: { fulfillment: "MANUAL", providerId: null, providerServiceId: null } });
  await prisma.provider.delete({ where: { id } });
  done("/admin/nha-cung-cap", "Đã xoá nhà cung cấp — các dịch vụ liên kết đã chuyển về xử lý thủ công");
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
    const parts: string[] = [];
    if (provider.kind === "SMM" || provider.kind === "BOTH") {
      const r = await syncProviderServices(provider);
      parts.push(`SMM: tổng ${r.total}, mới ${r.created}, cập nhật ${r.updated}`);
    }
    if (provider.kind === "PREMIUM" || provider.kind === "BOTH") {
      try {
        const rp = await syncProviderPremium(provider);
        parts.push(`Premium: tổng ${rp.total}, mới ${rp.created}, cập nhật ${rp.updated}, ${rp.variants} gói`);
      } catch (e: any) {
        parts.push(`Premium lỗi: ${String(e?.message || e)}`);
      }
    }
    done("/admin/nha-cung-cap", `Đã đồng bộ ${provider.name} — ${parts.join(" · ")}`);
  } catch (e: any) {
    back("/admin/nha-cung-cap", "err", String(e?.message || "Lỗi provider"));
  }
}


export async function adminToggleService(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const sv = await prisma.smmService.findUnique({ where: { id }, select: { active: true } });
  if (sv) await prisma.smmService.update({ where: { id }, data: { active: !sv.active } });
  done("/admin/dich-vu", sv?.active ? "Đã tắt dịch vụ" : "Đã bật dịch vụ");
}

export async function adminToggleCategory(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const c = await prisma.smmCategory.findUnique({ where: { id }, select: { active: true } });
  if (c) await prisma.smmCategory.update({ where: { id }, data: { active: !c.active } });
  done("/admin/danh-muc", c?.active ? "Đã tắt danh mục" : "Đã bật danh mục");
}

export async function adminTogglePlatform(formData: FormData) {
  await requireAdmin();
  const platform = String(formData.get("platform"));
  const target = formData.get("target") === "on";
  await prisma.smmCategory.updateMany({ where: { platform }, data: { active: target } });
  done("/admin/danh-muc", target ? "Đã bật cả nền tảng" : "Đã tắt cả nền tảng");
}

export async function adminReorderCategories(formData: FormData) {
  await requireAdmin();
  const ids = JSON.parse(String(formData.get("ids") || "[]")) as number[];
  await prisma.$transaction(ids.map((id, i) => prisma.smmCategory.update({ where: { id }, data: { sort: i } })));
  done("/admin/danh-muc", "Đã lưu thứ tự danh mục");
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
      if (p.kind === "SMM" || p.kind === "BOTH") {
        const r = await syncProviderServices(p);
        parts.push(`${p.name}: ${r.total} dịch vụ`);
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

/* ---------- Đơn SMM ---------- */
export async function adminSmmOrderAction(formData: FormData) {
  await requireStaff();
  const id = parseInt(String(formData.get("id")));
  const kind = String(formData.get("kind"));
  const order = await prisma.smmOrder.findUnique({ where: { id } });
  if (!order) back("/admin/don-smm", "err", "Không tìm thấy đơn");
  const path = `/admin/don-smm/${id}`;
  if (kind === "sync") {
    try {
      await syncSmmOrderStatus(order);
      done(path, "Đã đồng bộ trạng thái từ nhà cung cấp");
    } catch (e: any) {
      back(path, "err", String(e?.message || "Đồng bộ thất bại"));
    }
  }
  if (kind === "cancel") {
    await refundSmmOrder(id, order.charge - order.refundedAmount, "Admin huỷ đơn — hoàn tiền", "CANCELED");
    done(path, "Đã huỷ đơn và hoàn tiền");
  }
  // kind = update: cập nhật tay
  const status = String(formData.get("status") || order.status) as any;
  const startCount = formData.get("startCount") ? parseInt(String(formData.get("startCount"))) : order.startCount;
  const remains = formData.get("remains") !== null && formData.get("remains") !== "" ? parseInt(String(formData.get("remains"))) : order.remains;
  const adminNote = String(formData.get("adminNote") || "") || null;
  if (status === "PARTIAL" && remains && remains > 0) {
    // hoàn phần chưa chạy trước, refundSmmOrder sẽ set status — ghi đè lại sau
    const unit = order.charge / order.quantity;
    const amt = Math.min(Math.floor(unit * remains), order.charge - order.refundedAmount);
    if (amt > 0) await refundSmmOrder(id, amt, "Hoàn phần chưa chạy", "PARTIAL");
    await prisma.smmOrder.update({ where: { id }, data: { startCount, remains, adminNote } });
    done(path, `Đã cập nhật đơn + hoàn ${amt.toLocaleString("vi-VN")}đ phần chưa chạy`);
  }
  await prisma.smmOrder.update({ where: { id }, data: { status, startCount, remains, adminNote } });
  if (status !== order.status) await orderTransition(order, status, "Admin cập nhật thủ công");
  done(path, "Đã cập nhật đơn");
}

/* ---------- Premium ---------- */
export async function adminSavePremiumCategory(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id") || "0"));
  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || "").trim().toLowerCase();
  if (!name || !slug) back("/admin/premium", "err", "Thiếu tên hoặc slug");
  const data = { name, slug, sort: parseInt(String(formData.get("sort") || "0")), active: formData.get("active") === "on" };
  if (id) await prisma.premiumCategory.update({ where: { id }, data });
  else await prisma.premiumCategory.create({ data });
  done("/admin/premium", "Đã lưu danh mục premium");
}

export async function adminSaveProduct(formData: FormData) {
  await requireAdmin();
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
    imageUrl: String(formData.get("imageUrl") || "").trim().slice(0, 500) || null,
    usageGuide: String(formData.get("usageGuide") || "").trim() || null,
    warrantyInfo: String(formData.get("warrantyInfo") || "").trim() || null,
    active: formData.get("active") === "on",
    sort: parseInt(String(formData.get("sort") || "0")),
  };
  if (!data.name || !data.slug || !data.categoryId) back("/admin/premium", "err", "Thiếu tên, slug hoặc danh mục");
  if (id) await prisma.premiumProduct.update({ where: { id }, data });
  else await prisma.premiumProduct.create({ data });
  done("/admin/premium", "Đã lưu sản phẩm");
}

export async function adminDeleteProduct(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const count = await prisma.premiumOrder.count({ where: { variant: { productId: id } } });
  if (count) {
    await prisma.premiumProduct.update({ where: { id }, data: { active: false } });
    done("/admin/premium", "Sản phẩm đã có đơn nên chỉ tắt bán");
  }
  await prisma.premiumVariant.deleteMany({ where: { productId: id } });
  await prisma.premiumProduct.delete({ where: { id } });
  done("/admin/premium", "Đã xoá sản phẩm");
}

export async function adminSaveVariant(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id") || "0"));
  const productId = parseInt(String(formData.get("productId")));
  const data = {
    productId,
    name: String(formData.get("name") || "").trim(),
    price: parseInt(String(formData.get("price") || "0")),
    cost: parseInt(String(formData.get("cost") || "0")),
    warrantyDays: parseInt(String(formData.get("warrantyDays") || "0")),
    providerCycle: formData.get("providerCycle") ? parseInt(String(formData.get("providerCycle"))) : null,
    active: formData.get("active") === "on",
    sort: parseInt(String(formData.get("sort") || "0")),
  };
  if (!data.name || !data.price) back(`/admin/premium/${productId}`, "err", "Thiếu tên gói hoặc giá");
  if (id) await prisma.premiumVariant.update({ where: { id }, data });
  else await prisma.premiumVariant.create({ data });
  done(`/admin/premium/${productId}`, "Đã lưu gói bán");
}

export async function adminDeleteVariant(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const productId = parseInt(String(formData.get("productId")));
  const count = await prisma.premiumOrder.count({ where: { variantId: id } });
  if (count) {
    await prisma.premiumVariant.update({ where: { id }, data: { active: false } });
    done(`/admin/premium/${productId}`, "Gói đã có đơn nên chỉ tắt bán");
  }
  await prisma.premiumStock.deleteMany({ where: { variantId: id } });
  await prisma.premiumVariant.delete({ where: { id } });
  done(`/admin/premium/${productId}`, "Đã xoá gói");
}

/* ---------- Kho premium ---------- */
export async function adminImportStock(formData: FormData) {
  await requireAdmin();
  const variantId = parseInt(String(formData.get("variantId")));
  const bulk = String(formData.get("bulk") || "");
  const items = bulk.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (!variantId || !items.length) back("/admin/kho-premium", "err", "Chọn gói và nhập ít nhất 1 dòng kho");
  await prisma.premiumStock.createMany({ data: items.map((payload) => ({ variantId, payload })) });
  done("/admin/kho-premium", `Đã nhập ${items.length} mục vào kho`);
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
  const order = await prisma.premiumOrder.findUnique({ where: { id } });
  if (!order) back("/admin/don-premium", "err", "Không tìm thấy đơn");
  const path = `/admin/don-premium/${id}`;
  if (kind === "sync") {
    try {
      const after = await syncPremiumOrderStatus(order);
      done(path, after?.deliveryData ? "Đã đồng bộ — nhà cung cấp đã bàn giao, đơn chuyển Đã giao" : "Đã đồng bộ — nhà cung cấp chưa bàn giao");
    } catch (e: any) {
      back(path, "err", String(e?.message || "Đồng bộ thất bại"));
    }
  }
  if (kind === "cancel") {
    if (order.status === "REFUNDED") back(path, "err", "Đơn đã hoàn tiền trước đó");
    const panelOwner = order.panelId ? await prisma.childPanel.findUnique({ where: { id: order.panelId }, select: { ownerId: true } }) : null;
    await prisma.$transaction(async (tx) => {
      await applyBalance(tx, order.userId, order.total, "REFUND", order.code, "Admin huỷ đơn premium — hoàn tiền");
      if (panelOwner && order.commission > 0) {
        await applyBalance(tx, panelOwner.ownerId, -order.commission, "PANEL_COMMISSION", order.code, "Thu hồi hoa hồng — đơn premium bị huỷ");
      }
      await tx.premiumOrder.update({ where: { id }, data: { status: "REFUNDED" } });
    });
    await clawbackReferralCommission(order.userId, order.total, order.code);
    done(path, "Đã huỷ đơn và hoàn tiền");
  }
  const deliveryData = String(formData.get("deliveryData") || "") || order.deliveryData;
  const status = String(formData.get("status") || order.status) as any;
  const adminNote = String(formData.get("adminNote") || "") || order.adminNote;
  await prisma.premiumOrder.update({ where: { id }, data: { status, deliveryData, adminNote } });
  done(path, "Đã cập nhật đơn premium");
}

/* ---------- Nạp tiền ---------- */
export async function adminDepositAction(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const kind = String(formData.get("kind"));
  const dep = await prisma.deposit.findUnique({ where: { id } });
  if (!dep || dep.status !== "PENDING") back("/admin/nap-tien", "err", "Yêu cầu nạp không còn chờ duyệt");
  if (kind === "reject") {
    await prisma.deposit.update({ where: { id }, data: { status: "REJECTED", adminNote: String(formData.get("adminNote") || "") || null } });
    done("/admin/nap-tien", "Đã từ chối yêu cầu nạp");
  }
  await prisma.$transaction(async (tx) => {
    await tx.deposit.update({ where: { id }, data: { status: "APPROVED" } });
    await applyBalance(tx, dep.userId, dep.amount, "DEPOSIT", dep.code, "Admin duyệt nạp tiền");
    if (dep.bonus > 0) await applyBalance(tx, dep.userId, dep.bonus, "BONUS", dep.code, "Thưởng nạp tiền");
  });
  done("/admin/nap-tien", `Đã cộng ${dep.amount.toLocaleString("vi-VN")}đ cho khách`);
}

export async function adminManualDeposit(formData: FormData) {
  await requireAdmin();
  const userId = parseInt(String(formData.get("userId")));
  const amount = parseInt(String(formData.get("amount") || "0"));
  if (!userId || amount <= 0) back("/admin/nap-tien", "err", "Chọn khách và số tiền hợp lệ");
  const dep = await prisma.deposit.create({
    data: { code: "TMP", userId, method: "BANK", amount, status: "APPROVED", content: "Admin cộng tay" },
  });
  const code = genCode("NAP", dep.id);
  await prisma.$transaction(async (tx) => {
    await tx.deposit.update({ where: { id: dep.id }, data: { code } });
    await applyBalance(tx, userId, amount, "DEPOSIT", code, "Admin cộng tiền tay");
  });
  done("/admin/nap-tien", `Đã cộng ${amount.toLocaleString("vi-VN")}đ`);
}

/* ---------- Ticket ---------- */
export async function adminPanelAction(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id")));
  const kind = String(formData.get("kind"));
  const panel = await prisma.childPanel.findUnique({ where: { id } });
  if (!panel) back("/admin/panel-con", "err", "Không tìm thấy panel");
  if (kind === "toggle") {
    await prisma.childPanel.update({ where: { id }, data: { status: panel.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" } });
    done("/admin/panel-con", `Đã ${panel.status === "ACTIVE" ? "khoá" : "mở lại"} panel ${panel.name}`);
  }
  back("/admin/panel-con", "err", "Thao tác không hợp lệ");
}

export async function adminReplyTicket(formData: FormData) {
  await requireStaff();
  const ticketId = parseInt(String(formData.get("ticketId")));
  const body = String(formData.get("body") || "").trim();
  const close = formData.get("close") === "on";
  if (body) await prisma.ticketMessage.create({ data: { ticketId, body, fromAdmin: true } });
  await prisma.ticket.update({ where: { id: ticketId }, data: { status: close ? "CLOSED" : "ANSWERED" } });
  redirect(`/admin/ticket/${ticketId}`);
}

/* ---------- Cấu hình + thông báo ---------- */
export async function adminSaveSettings(formData: FormData) {
  await requireAdmin();
  const keys = [
    "site_name", "site_tagline", "support_telegram", "support_facebook", "support_zalo", "support_hotline",
    "bank_name", "bank_account", "bank_holder", "bank_branch",
    "momo_phone", "momo_name", "deposit_min", "deposit_bonus_tiers", "maintenance", "announcement_bar", "affiliate_percent",
    "usd_rate", "paypal_enabled", "paypal_client_id", "paypal_client_secret", "paypal_mode",
    "stripe_enabled", "stripe_publishable_key", "stripe_secret_key", "stripe_webhook_secret", "profit_protection",
    "default_accent", "default_mode",
    "smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "smtp_secure",
    "telegram_bot_token", "telegram_chat_id", "telegram_notify",
    "custom_head_html", "custom_body_html", "password_min_length",
    "ai_enabled", "ai_provider", "ai_base_url", "ai_api_key", "ai_model",
    "google_enabled", "google_client_id", "google_client_secret",
    "usdt_enabled", "usdt_address", "usdt_network", "usdt_rate",
    "rate_eur", "rate_cny", "rate_thb", "rate_jpy", "rate_krw",
  ];
  for (const k of keys) {
    const v = formData.get(k);
    if (v !== null) await setSetting(k, String(v).trim());
  }
  done("/admin/cau-hinh", "Đã lưu cấu hình");
}

export async function adminSaveAnnouncement(formData: FormData) {
  await requireAdmin();
  const id = parseInt(String(formData.get("id") || "0"));
  const data = {
    title: String(formData.get("title") || "").trim(),
    body: String(formData.get("body") || "").trim(),
    active: formData.get("active") === "on",
  };
  if (!data.title || !data.body) back("/admin/thong-bao", "err", "Thiếu tiêu đề hoặc nội dung");
  if (formData.get("delete") === "1") {
    await prisma.announcement.delete({ where: { id } });
    done("/admin/thong-bao", "Đã xoá thông báo");
  }
  if (id) await prisma.announcement.update({ where: { id }, data });
  else await prisma.announcement.create({ data });
  done("/admin/thong-bao", "Đã lưu thông báo");
}
