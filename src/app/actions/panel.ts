"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

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
