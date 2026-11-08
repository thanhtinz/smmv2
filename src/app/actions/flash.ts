"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin, getCurrentUser } from "@/lib/auth";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}
function str(fd: FormData, k: string) { return String(fd.get(k) || "").trim(); }
function int(fd: FormData, k: string) { return parseInt(str(fd, k)) || 0; }

function parseSale(fd: FormData) {
  const name = str(fd, "name");
  const percent = Math.min(90, Math.max(1, int(fd, "percent")));
  const startsAt = new Date(str(fd, "startsAt"));
  const endsAt = new Date(str(fd, "endsAt"));
  // Phạm vi loại đơn: ALL (chung) | SMM | PREMIUM — mặc định SMM như hành vi cũ
  const rawScope = str(fd, "applyScope").toUpperCase();
  const scope = rawScope === "ALL" || rawScope === "PREMIUM" ? rawScope : "SMM";
  let serviceIds: string | null = null;
  if (str(fd, "svcScope") === "some") {
    const ids = str(fd, "serviceIds").split(/[,\s]+/).map((x) => parseInt(x)).filter((n) => n > 0);
    serviceIds = JSON.stringify(ids);
  }
  let productIds: string | null = null;
  if (str(fd, "prodScope") === "some") {
    const ids = fd.getAll("productIds").map((x) => parseInt(String(x))).filter((n) => n > 0);
    productIds = JSON.stringify(ids);
  }
  return { name, percent, startsAt, endsAt, scope, serviceIds, productIds };
}

function validate(path: string, d: ReturnType<typeof parseSale>) {
  if (!d.name) back(path, "err", "Nhập tên chương trình flash sale");
  if (isNaN(d.startsAt.getTime()) || isNaN(d.endsAt.getTime()) || d.endsAt <= d.startsAt) back(path, "err", "Khung giờ không hợp lệ: giờ kết thúc phải sau giờ bắt đầu");
}

/* ----- Web mẹ ----- */
export async function createFlashSaleAction(formData: FormData) {
  await requireAdmin();
  const path = "/admin/khuyen-mai";
  const d = parseSale(formData);
  validate(path, d);
  await prisma.flashSale.create({ data: { ...d, panelId: null, active: true } });
  back(path, "msg", `Đã tạo flash sale "${d.name}" — giảm ${d.percent}%`);
}

export async function toggleFlashSaleAction(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id");
  const cur = await prisma.flashSale.findFirst({ where: { id, panelId: null } });
  if (cur) await prisma.flashSale.update({ where: { id }, data: { active: !cur.active } });
  back("/admin/khuyen-mai", "msg", "Đã cập nhật flash sale");
}

export async function deleteFlashSaleAction(formData: FormData) {
  await requireAdmin();
  await prisma.flashSale.deleteMany({ where: { id: int(formData, "id"), panelId: null } });
  back("/admin/khuyen-mai", "msg", "Đã xoá flash sale");
}
