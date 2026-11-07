import { createHash } from "crypto";
import { prisma } from "./db";

/* Nhật ký kiểm toán bất biến (bảo mật Enterprise GĐ2).
   Mỗi dòng: hash = sha256(prevHash | nội dung dòng). Sửa hoặc xoá bất kỳ dòng nào
   cũng làm đứt chuỗi — kiểm chứng bằng verifyAuditChain().
   Chỉ có đường GHI: không tồn tại action sửa/xoá AuditLog ở bất cứ đâu. */

export type AuditInput = {
  actorId?: number | null;
  actorName: string;
  role: string;
  scope?: "mother" | "panel";
  panelId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  detail?: string | null;
  ip?: string | null;
};

function bodyOf(d: {
  actorId: number | null; actorName: string; role: string; scope: string; panelId: number | null;
  action: string; targetType: string | null; targetId: string | null; detail: string | null;
  ip: string | null; createdAt: Date;
}): string {
  return [
    d.actorId ?? "", d.actorName, d.role, d.scope, d.panelId ?? "", d.action,
    d.targetType ?? "", d.targetId ?? "", d.detail ?? "", d.ip ?? "", d.createdAt.toISOString(),
  ].join("|");
}

export function auditHash(prevHash: string, body: string): string {
  return createHash("sha256").update(prevHash + "|" + body).digest("hex");
}

/** Ghi 1 dòng audit. Truyền tx (Prisma transaction client) để ghi cùng transaction
 *  với thao tác nhạy cảm khi khả thi; lỗi ghi log không làm hỏng thao tác chính
 *  ngoài transaction, nhưng TRONG transaction thì để lỗi nổi lên (nguyên tử). */
export async function writeAudit(input: AuditInput, tx?: unknown): Promise<void> {
  const db = (tx as typeof prisma) ?? prisma;
  const data = {
    actorId: input.actorId ?? null,
    actorName: input.actorName,
    role: input.role,
    scope: input.scope ?? "mother",
    panelId: input.panelId ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId != null ? String(input.targetId) : null,
    detail: input.detail ?? null,
    ip: input.ip ?? null,
    createdAt: new Date(),
  };
  const run = async (client: typeof prisma) => {
    const last = await client.auditLog.findFirst({ orderBy: { id: "desc" }, select: { hash: true } });
    const prevHash = last?.hash ?? "GENESIS";
    const hash = auditHash(prevHash, bodyOf(data));
    await client.auditLog.create({ data: { ...data, prevHash, hash } });
  };
  if (tx) {
    await run(db);
  } else {
    try {
      await run(db);
    } catch (e) {
      console.error("[audit] ghi log thất bại:", e);
    }
  }
}

/** Kiểm chứng toàn chuỗi: trả về dòng đầu tiên bị đứt (nếu có) */
export async function verifyAuditChain(): Promise<{ ok: boolean; count: number; brokenAt?: number }> {
  const rows = await prisma.auditLog.findMany({ orderBy: { id: "asc" } });
  let prev = "GENESIS";
  for (const r of rows) {
    if (r.prevHash !== prev) return { ok: false, count: rows.length, brokenAt: r.id };
    const expect = auditHash(r.prevHash, bodyOf({
      actorId: r.actorId, actorName: r.actorName, role: r.role, scope: r.scope, panelId: r.panelId,
      action: r.action, targetType: r.targetType, targetId: r.targetId, detail: r.detail, ip: r.ip, createdAt: r.createdAt,
    }));
    if (expect !== r.hash) return { ok: false, count: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
