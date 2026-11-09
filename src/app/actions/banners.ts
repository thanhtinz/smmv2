"use server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

function back(path: string, key: "msg" | "err", text: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(text)}`);
}
const done = (path: string, text = "Đã lưu") => back(path, "msg", text);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string) => parseInt(str(fd, k) || "0") || 0;

const PAGE = "/admin/banner";
/** Ngôn ngữ banner hợp lệ — chỉ còn vi/en như ngôn ngữ hiển thị của site. */
const bannerLang = (fd: FormData) => (str(fd, "lang") === "en" ? "en" : "vi");
/** Ảnh banner: URL http(s), đường dẫn nội bộ, hoặc data-URL ảnh admin tải lên. */
const bannerImage = (fd: FormData) => {
  const v = str(fd, "image");
  return /^(https?:\/\/|\/|data:image\/)/.test(v) ? v : "";
};

/** Thêm mới / cập nhật banner trang chủ (id > 0 = sửa). */
export async function saveBannerAction(formData: FormData) {
  await requireAdmin();
  const id = int(formData, "id");
  const image = bannerImage(formData);
  if (!image) back(PAGE, "err", "Chưa có ảnh banner");
  const data = {
    image,
    href: str(formData, "href") || null,
    lang: bannerLang(formData),
    sort: int(formData, "sort"),
  };
  if (id > 0) {
    await prisma.homeBanner.update({ where: { id }, data });
    done(PAGE, "Đã lưu");
  }
  await prisma.homeBanner.create({ data });
  done(PAGE, "Đã thêm banner");
}

export async function deleteBannerAction(formData: FormData) {
  await requireAdmin();
  await prisma.homeBanner.deleteMany({ where: { id: int(formData, "id") } });
  done(PAGE, "Đã xoá banner");
}

export async function toggleBannerAction(formData: FormData) {
  await requireAdmin();
  const b = await prisma.homeBanner.findFirst({ where: { id: int(formData, "id") } });
  if (b) await prisma.homeBanner.update({ where: { id: b.id }, data: { active: !b.active } });
  done(PAGE, "Đã lưu");
}
