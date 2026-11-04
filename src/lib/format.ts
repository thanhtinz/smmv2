export const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + "đ";
export const num = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
export const dt = (d: Date | string) =>
  new Date(d).toLocaleString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" });
export const dshort = (d: Date | string) =>
  new Date(d).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

/** Giá 1 đơn SMM: rate/1000 * quantity, làm tròn lên đồng */
export const smmCharge = (ratePer1000: number, qty: number) => Math.ceil((ratePer1000 * qty) / 1000);

export const LEVEL_DISCOUNT: Record<string, number> = {
  MEMBER: 0,
  RESELLER: 5,
  AGENCY: 10,
  VIP: 15,
};
export const LEVEL_NAME: Record<string, string> = {
  MEMBER: "Thành viên",
  RESELLER: "Đại lý",
  AGENCY: "Tổng đại lý",
  VIP: "VIP",
};

export const SMM_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chờ xử lý", cls: "bg-amber-100 text-amber-800" },
  PROCESSING: { label: "Đang xử lý", cls: "bg-sky-100 text-sky-800" },
  IN_PROGRESS: { label: "Đang chạy", cls: "bg-indigo-100 text-indigo-800" },
  COMPLETED: { label: "Hoàn thành", cls: "bg-emerald-100 text-emerald-800" },
  PARTIAL: { label: "Hoàn một phần", cls: "bg-orange-100 text-orange-800" },
  CANCELED: { label: "Đã huỷ", cls: "bg-rose-100 text-rose-800" },
  REFUNDED: { label: "Đã hoàn tiền", cls: "bg-slate-200 text-slate-700" },
};
export const PRE_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chờ giao", cls: "bg-amber-100 text-amber-800" },
  DELIVERED: { label: "Đã giao", cls: "bg-emerald-100 text-emerald-800" },
  COMPLETED: { label: "Hoàn thành", cls: "bg-emerald-100 text-emerald-800" },
  WARRANTY: { label: "Đang bảo hành", cls: "bg-indigo-100 text-indigo-800" },
  CANCELED: { label: "Đã huỷ", cls: "bg-rose-100 text-rose-800" },
  REFUNDED: { label: "Đã hoàn tiền", cls: "bg-slate-200 text-slate-700" },
};
export const DEP_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Đã cộng tiền", cls: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Bị từ chối", cls: "bg-rose-100 text-rose-800" },
};
export const PLATFORMS: Record<string, string> = {
  facebook: "Facebook",
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  telegram: "Telegram",
  shopee: "Shopee",
  x: "X (Twitter)",
  spotify: "Spotify",
  other: "Khác",
};

export function genCode(prefix: string, id: number) {
  return `${prefix}${100000 + id}`;
}

/** Trường tuỳ chỉnh của sản phẩm premium — khách điền khi mua (vd Gmail nâng cấp, link, loại thiết bị).
 *  Admin định nghĩa theo từng sản phẩm; lưu JSON trên PremiumProduct.customFields. */
export type PremiumCustomField = {
  label: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  placeholder?: string;
  options?: string[];
};

export function parsePremiumFields(json?: string | null): PremiumCustomField[] {
  try {
    const a = JSON.parse(json || "[]");
    if (!Array.isArray(a)) return [];
    return a
      .filter((f) => f && typeof f.label === "string" && f.label.trim())
      .map((f) => ({
        label: String(f.label).slice(0, 80),
        type: f.type === "textarea" || f.type === "select" ? f.type : ("text" as const),
        required: !!f.required,
        placeholder: f.placeholder ? String(f.placeholder).slice(0, 120) : undefined,
        options: Array.isArray(f.options) ? f.options.map((o: unknown) => String(o).slice(0, 60)).filter(Boolean).slice(0, 12) : undefined,
      }))
      .slice(0, 8);
  } catch {
    return [];
  }
}

export function normalizePremiumFieldsJson(raw: string): string | null {
  const f = parsePremiumFields(raw);
  return f.length ? JSON.stringify(f) : null;
}
export function randomKey(bytes = 24) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  arr.forEach((b) => (s += chars[b % chars.length]));
  return s;
}
