"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin, assertStepUp, currentIp } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";
import { alertMother } from "@/lib/alerts";
import { PANEL_SECRET_FIELDS, panelHasPlaintextSecrets } from "@/lib/panel-secrets";
import { encryptSecret } from "@/lib/secret-box";

const PAGE = "/admin/trung-tam-bao-mat";
const str = (fd: FormData, k: string) => String(fd.get(k) || "").trim();
function back(key: "msg" | "err", text: string): never {
  redirect(`${PAGE}?${key}=${encodeURIComponent(text)}`);
}

/** Bật/tắt khoá khẩn cấp (Emergency Lockdown) — thao tác nhạy cảm: bắt buộc step-up
 *  + ghi AuditLog + báo Telegram/Discord/Email của admin nếu đã cấu hình. */
export async function toggleLockdownAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertStepUp(admin.id, PAGE);
  const enable = str(formData, "enable") === "1";
  const reason = str(formData, "reason").slice(0, 300);
  await setSetting("emergency_lockdown", enable ? "1" : "0");
  if (enable) await setSetting("lockdown_reason", reason);
  await writeAudit({
    actorId: admin.id, actorName: admin.username, role: admin.role, scope: "mother", panelId: null,
    action: enable ? "lockdown.on" : "lockdown.off", targetType: "setting", targetId: "emergency_lockdown",
    detail: enable ? (reason || "Bật khoá khẩn cấp") : "Tắt khoá khẩn cấp", ip: currentIp(),
  });
  await alertMother("system", enable ? "KHOÁ KHẨN CẤP ĐÃ BẬT" : "Khoá khẩn cấp đã tắt",
    enable ? `Admin ${admin.username} vừa BẬT khoá khẩn cấp. Lý do: ${reason || "(không ghi)"}. Khách không đăng nhập/đặt hàng được cho tới khi tắt khoá.` : `Admin ${admin.username} vừa TẮT khoá khẩn cấp — hệ thống hoạt động bình thường.`).catch(() => {});
  back("msg", enable ? "Đã BẬT khoá khẩn cấp — khách bị chặn đăng nhập & giao dịch" : "Đã TẮT khoá khẩn cấp — hệ thống mở lại bình thường");
}

/** Mã hoá toàn bộ secret còn dạng rõ trên các ChildPanel (chạy một lần từ Security
 *  Center; chỉ ADMIN web mẹ, qua step-up). Giá trị đã enc: được bỏ qua. */
export async function encryptAllPanelSecretsAction() {
  const admin = await requireAdmin();
  if (admin.role !== "ADMIN") back("err", "Chỉ ADMIN mới chạy được thao tác này");
  await assertStepUp(admin.id, PAGE);
  const panels = await prisma.childPanel.findMany({ select: { id: true, ...Object.fromEntries(PANEL_SECRET_FIELDS.map((f) => [f, true])) } as any });
  let count = 0;
  for (const p of panels as any[]) {
    if (!panelHasPlaintextSecrets(p)) continue;
    const data: Record<string, string> = {};
    for (const f of PANEL_SECRET_FIELDS) {
      const v = p[f];
      if (typeof v === "string" && v && !v.startsWith("enc:")) data[f] = encryptSecret(v);
    }
    if (Object.keys(data).length) {
      await prisma.childPanel.update({ where: { id: p.id }, data });
      count++;
    }
  }
  await writeAudit({
    actorId: admin.id, actorName: admin.username, role: admin.role, scope: "mother", panelId: null,
    action: "panel.secrets.encrypt_all", targetType: "panel", targetId: "all",
    detail: `Đã mã hoá secret cho ${count} website con`, ip: currentIp(),
  });
  back("msg", count > 0 ? `Đã mã hoá secret cho ${count} website con` : "Không còn secret dạng rõ nào trên các website con");
}
