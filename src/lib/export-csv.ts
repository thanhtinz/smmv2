import { prisma } from "./db";

/** Xuất CSV báo cáo (đợt bổ sung): UTF-8 có BOM để Excel đọc đúng tiếng Việt.
 *  Phạm vi toàn hệ thống. Loại "smm" đã gỡ cùng đợt tách web (2026-11-12). */

export const EXPORT_TYPES = ["premium", "deposits", "transactions", "users"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

function esc(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function row(vals: unknown[]): string { return vals.map(esc).join(","); }
const dstr = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

export async function buildExportCsv(type: ExportType, from?: Date, to?: Date): Promise<{ csv: string; filename: string }> {
  const dateWhere = (from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
  const userScope = {};
  let lines: string[] = [];
  if (type === "premium") {
    const rows = await prisma.premiumOrder.findMany({ where: { user: userScope, ...dateWhere }, orderBy: { id: "desc" }, take: 5000, include: { user: { select: { username: true } }, variant: { include: { product: { select: { name: true } } } } } });
    lines = [row(["Mã đơn", "Khách", "Sản phẩm", "Gói", "Số lượng", "Tiền (VNĐ)", "Trạng thái", "Ngày tạo"]),
      ...rows.map((o) => row([o.code, o.user.username, o.variant.product.name, o.variant.name, o.quantity, o.total, o.status, dstr(o.createdAt)]))];
  } else if (type === "deposits") {
    const rows = await prisma.deposit.findMany({ where: { user: userScope, ...dateWhere }, orderBy: { id: "desc" }, take: 5000, include: { user: { select: { username: true } } } });
    lines = [row(["Mã nạp", "Khách", "Phương thức", "Số tiền (VNĐ)", "Thưởng (VNĐ)", "Trạng thái", "Ngày tạo"]),
      ...rows.map((o) => row([o.code, o.user.username, o.method, o.amount, o.bonus, o.status, dstr(o.createdAt)]))];
  } else if (type === "transactions") {
    const rows = await prisma.transaction.findMany({ where: { user: userScope, ...dateWhere }, orderBy: { id: "desc" }, take: 5000, include: { user: { select: { username: true } } } });
    lines = [row(["Khách", "Loại", "Số tiền (VNĐ)", "Số dư sau (VNĐ)", "Mã tham chiếu", "Ghi chú", "Ngày tạo"]),
      ...rows.map((o) => row([o.user.username, o.type, o.amount, o.balanceAfter, o.ref || "", o.note || "", dstr(o.createdAt)]))];
  } else {
    const rows = await prisma.user.findMany({ where: { ...userScope, ...dateWhere }, orderBy: { id: "desc" }, take: 5000 });
    lines = [row(["ID", "Tài khoản", "Email", "Email đã xác thực", "Họ tên", "Cấp bậc", "Số dư (VNĐ)", "Đã nạp (VNĐ)", "Đã chi (VNĐ)", "Điểm", "Ngày đăng ký"]),
      ...rows.map((u) => row([u.id, u.username, u.email, u.emailVerified ? "Có" : "Chưa", u.fullName || "", u.level, u.balance, u.totalDeposited, u.totalSpent, u.points, dstr(u.createdAt)]))];
  }
  return { csv: "﻿" + lines.join("\r\n"), filename: `bao-cao-${type}.csv` };
}

export function parseRange(sp: URLSearchParams): { from?: Date; to?: Date } {
  const f = sp.get("from"); const t = sp.get("to");
  const from = f ? new Date(`${f}T00:00:00`) : undefined;
  const to = t ? new Date(`${t}T23:59:59`) : undefined;
  return { from: from && !isNaN(from.getTime()) ? from : undefined, to: to && !isNaN(to.getTime()) ? to : undefined };
}
