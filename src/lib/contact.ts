import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export type FloatingContact = { name: string; href: string; image?: string | null; bg: string };

/** Chuẩn hoá link liên hệ tuỳ theo tên kênh: số Zalo → zalo.me, @user → t.me,
 *  số điện thoại/hotline → tel:, còn lại giữ nguyên (thêm https:// nếu thiếu). */
export function normalizeContactLink(name: string, raw: string): string {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^(https?:|tel:|mailto:)/i.test(v)) return v;
  const lower = name.toLowerCase();
  const digits = v.replace(/[\s.]/g, "");
  if (lower.includes("zalo")) return `https://zalo.me/${digits}`;
  if (lower.includes("telegram")) return `https://t.me/${v.replace(/^@/, "")}`;
  if (lower.includes("facebook") || lower.includes("fanpage") || lower.includes("messenger")) return `https://facebook.com/${v.replace(/^\//, "")}`;
  if (lower.includes("hotline") || lower.includes("điện thoại") || lower.includes("phone")) return `tel:${digits}`;
  if (/^0\d{8,10}$/.test(digits)) return `https://zalo.me/${digits}`;
  return `https://${v}`;
}

export function contactColor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("zalo")) return "#0068ff";
  if (lower.includes("telegram")) return "#229ed9";
  if (lower.includes("facebook") || lower.includes("fanpage") || lower.includes("messenger")) return "#1877f2";
  if (lower.includes("hotline") || lower.includes("điện thoại") || lower.includes("phone")) return "#059669";
  if (lower.includes("youtube")) return "#ff0000";
  if (lower.includes("tiktok")) return "#111827";
  if (lower.includes("discord")) return "#5865f2";
  return "#475569";
}

function fromLegacy(entries: { name: string; value?: string | null }[]): FloatingContact[] {
  return entries
    .filter((e) => e.value && e.value.trim())
    .map((e) => ({ name: e.name, href: normalizeContactLink(e.name, e.value!), image: null, bg: contactColor(e.name) }));
}

/** Danh sách nút liên hệ nổi: widget của web mẹ → kênh cấu hình cũ (settings). */
export async function getFloatingContacts(): Promise<FloatingContact[]> {
  const toDto = (rows: { name: string; link: string; image: string | null }[]): FloatingContact[] =>
    rows.map((r) => ({ name: r.name, href: normalizeContactLink(r.name, r.link), image: r.image, bg: contactColor(r.name) }));

  const mother = await prisma.contactWidget.findMany({ where: { panelId: null, active: true }, orderBy: [{ sort: "asc" }, { id: "asc" }] });
  if (mother.length) return toDto(mother);
  const s = await getSettings();
  return fromLegacy([
    { name: "Zalo", value: s.support_zalo },
    { name: "Telegram", value: s.support_telegram },
    { name: "Facebook", value: s.support_facebook },
    { name: "Hotline", value: s.support_hotline },
  ]);
}

/** Widget dạng DTO cho trang quản lý (gồm cả đang ẩn). */
export async function listContactWidgets() {
  const rows = await prisma.contactWidget.findMany({ where: { panelId: null }, orderBy: [{ sort: "asc" }, { id: "asc" }] });
  return rows.map((r) => ({ id: r.id, name: r.name, link: r.link, image: r.image, active: r.active, bg: contactColor(r.name) }));
}
