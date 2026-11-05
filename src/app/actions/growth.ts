"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { redirect } from "next/navigation";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string) => parseInt(str(fd, k) || "0") || 0;

/* ---------- Đăng ký định kỳ ---------- */
export async function createSubscriptionAction(formData: FormData) {
  const user = await requireUser();
  if (!(await moduleOn("subscriptions", user.panelId))) back("/dashboard/dinh-ky", "err", "Tính năng đăng ký định kỳ đang tắt");
  const serviceId = int(formData, "serviceId");
  const link = str(formData, "link");
  const quantity = int(formData, "quantity");
  const intervalDays = Math.max(1, Math.min(30, int(formData, "intervalDays") || 1));
  const dailyBudget = Math.max(0, int(formData, "dailyBudget"));
  const targetTotal = Math.max(0, int(formData, "targetTotal"));
  const service = await prisma.smmService.findUnique({ where: { id: serviceId } });
  if (!service || !service.active) back("/dashboard/dinh-ky", "err", "Dịch vụ không tồn tại hoặc đang tạm ngưng");
  if (!link) back("/dashboard/dinh-ky", "err", "Thiếu link cần tăng");
  if (quantity < service!.min || quantity > service!.max) back("/dashboard/dinh-ky", "err", `Số lượng mỗi lượt phải từ ${service!.min} đến ${service!.max}`);
  const count = await prisma.subscription.count({ where: { userId: user.id, active: true } });
  if (count >= 10) back("/dashboard/dinh-ky", "err", "Tối đa 10 gói định kỳ đang chạy cùng lúc");
  await prisma.subscription.create({
    data: { userId: user.id, serviceId, link, quantity, intervalDays, dailyBudget, targetTotal, nextRunAt: new Date() },
  });
  back("/dashboard/dinh-ky", "msg", "Đã tạo gói định kỳ — hệ thống sẽ đặt lượt đầu trong ít phút tới, các lượt sau đúng lịch bạn đặt");
}

export async function toggleSubscriptionAction(formData: FormData) {
  const user = await requireUser();
  const id = int(formData, "id");
  const sub = await prisma.subscription.findFirst({ where: { id, userId: user.id } });
  if (!sub) redirect("/dashboard/dinh-ky");
  await prisma.subscription.update({
    where: { id },
    data: sub!.active ? { active: false } : { active: true, nextRunAt: new Date(), lastError: null },
  });
  back("/dashboard/dinh-ky", "msg", sub!.active ? "Đã tạm dừng gói" : "Đã bật lại gói — lượt tiếp theo sẽ chạy ngay");
}

export async function deleteSubscriptionAction(formData: FormData) {
  const user = await requireUser();
  await prisma.subscription.deleteMany({ where: { id: int(formData, "id"), userId: user.id } });
  back("/dashboard/dinh-ky", "msg", "Đã xoá gói định kỳ");
}

/* ---------- Chiến dịch ---------- */
export async function createCampaignAction(formData: FormData) {
  const user = await requireUser();
  if (!(await moduleOn("campaigns", user.panelId))) back("/dashboard/chien-dich", "err", "Tính năng chiến dịch đang tắt");
  const name = str(formData, "name");
  if (!name) back("/dashboard/chien-dich", "err", "Chưa nhập tên chiến dịch");
  const c = await prisma.campaign.create({
    data: { userId: user.id, name, budget: Math.max(0, int(formData, "budget")), note: str(formData, "note") || null },
  });
  redirect(`/dashboard/chien-dich/${c.id}?msg=${encodeURIComponent("Đã tạo chiến dịch — đặt đơn và chọn chiến dịch này để gom chi tiêu")}`);
}

export async function updateCampaignAction(formData: FormData) {
  const user = await requireUser();
  const id = int(formData, "id");
  const own = await prisma.campaign.findFirst({ where: { id, userId: user.id } });
  if (!own) redirect("/dashboard/chien-dich");
  if (formData.get("delete") === "1") {
    await prisma.smmOrder.updateMany({ where: { campaignId: id }, data: { campaignId: null } });
    await prisma.campaign.delete({ where: { id } });
    back("/dashboard/chien-dich", "msg", "Đã xoá chiến dịch (đơn hàng vẫn giữ nguyên)");
  }
  await prisma.campaign.update({
    where: { id },
    data: { name: str(formData, "name") || own!.name, budget: Math.max(0, int(formData, "budget")), note: str(formData, "note") || null, active: formData.get("active") === "on" },
  });
  back(`/dashboard/chien-dich/${id}`, "msg", "Đã lưu chiến dịch");
}
