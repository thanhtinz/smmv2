"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { requireAdmin, assertStepUp, currentIp, invalidateSessionSecretsCache } from "@/lib/auth";
import { getSettings, setSetting } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";
import { alertMother } from "@/lib/alerts";
import { PANEL_SECRET_FIELDS, panelHasPlaintextSecrets } from "@/lib/panel-secrets";
import { encryptSecret } from "@/lib/secret-box";
import { evaluateUserRisk, markRiskReviewed } from "@/lib/risk";

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

/* ================= GĐ3: Rủi ro & gian lận ================= */

function backTo(fd: FormData, key: "msg" | "err", text: string): never {
  const next = str(fd, "next");
  const target = next.startsWith("/admin/") ? next : PAGE;
  const sep = target.includes("?") ? "&" : "?";
  redirect(`${target}${sep}${key}=${encodeURIComponent(text)}`);
}

/** Tính lại điểm rủi ro cho 1 tài khoản ngay lập tức */
export async function riskRecalcAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = parseInt(str(formData, "userId")) || 0;
  const target = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { username: true } }) : null;
  if (!target) backTo(formData, "err", "Không tìm thấy tài khoản");
  const r = await evaluateUserRisk(userId);
  backTo(formData, "msg", r ? `Đã tính lại: ${target!.username} — ${r.score} điểm (${r.level})` : "Tính điểm thất bại, thử lại sau");
}

/** Đánh dấu đã duyệt 1 tài khoản rủi ro: gỡ hạn chế cho tới khi có tín hiệu mới */
export async function riskReviewAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = parseInt(str(formData, "userId")) || 0;
  const target = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { username: true, riskScore: true } }) : null;
  if (!target) backTo(formData, "err", "Không tìm thấy tài khoản");
  await markRiskReviewed(userId, `admin ${admin.username}`);
  await writeAudit({
    actorId: admin.id, actorName: admin.username, role: admin.role, scope: "mother", panelId: null,
    action: "risk.review", targetType: "user", targetId: userId,
    detail: `Duyệt điểm rủi ro cho ${target!.username} (${target!.riskScore} điểm) — gỡ hạn chế tới khi có tín hiệu mới`, ip: currentIp(),
  });
  backTo(formData, "msg", `Đã duyệt ${target!.username} — tài khoản giao dịch lại bình thường cho tới khi có tín hiệu rủi ro mới`);
}

/** Lưu ngưỡng + trọng số rủi ro (toàn bộ từ form Trung tâm bảo mật) */
const RISK_SETTING_KEYS = [
  "risk_watch", "risk_restrict", "risk_critical",
  "risk_w_shared", "risk_w_faillogin", "risk_w_login_locked", "risk_w_ipban",
  "risk_w_deposit_reject", "risk_w_deposit_velocity", "risk_deposit_velocity_count",
  "risk_w_young_big", "risk_young_days", "risk_big_deposit_vnd",
  "risk_w_order_burst", "risk_order_burst_count", "risk_w_cancel_ratio",
  "risk_w_api_errors", "risk_api_error_count", "risk_w_refunds",
];
export async function riskSaveSettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  for (const k of RISK_SETTING_KEYS) {
    const v = parseInt(str(formData, k));
    if (Number.isFinite(v) && v >= 0) await setSetting(k, String(v));
  }
  await writeAudit({
    actorId: admin.id, actorName: admin.username, role: admin.role, scope: "mother", panelId: null,
    action: "risk.settings", targetType: "setting", targetId: "risk",
    detail: `Đổi ngưỡng/trọng số rủi ro: theo dõi ${str(formData, "risk_watch")}, hạn chế ${str(formData, "risk_restrict")}, nghiêm trọng ${str(formData, "risk_critical")}`, ip: currentIp(),
  });
  back("msg", "Đã lưu cấu hình điểm rủi ro");
}

/* ================= GĐ3: Xoay vòng khoá (secret rotation) ================= */

/** Xoay vòng khoá ký phiên: khoá hiện hành xuống làm khoá cũ (còn hiệu lực 7 ngày
 *  để phiên đang đăng nhập không bị văng), sinh khoá mới lưu vào DB. */
export async function rotateSessionSecretAction() {
  const admin = await requireAdmin();
  await assertStepUp(admin.id, PAGE);
  const s = await getSettings();
  const effectiveCurrent = (s.session_secret || "").trim() || process.env.AUTH_SECRET || "";
  const fresh = randomBytes(48).toString("hex");
  if (effectiveCurrent) await setSetting("session_secret_prev", effectiveCurrent);
  await setSetting("session_secret", fresh);
  await setSetting("session_secret_rotated_at", String(Date.now()));
  invalidateSessionSecretsCache();
  await writeAudit({
    actorId: admin.id, actorName: admin.username, role: admin.role, scope: "mother", panelId: null,
    action: "secret.rotate_session", targetType: "setting", targetId: "session_secret",
    detail: "Xoay vòng khoá ký phiên — khoá cũ còn hiệu lực 7 ngày cho các phiên đang đăng nhập", ip: currentIp(),
  });
  back("msg", "Đã xoay vòng khoá phiên — phiên đang đăng nhập vẫn dùng được (khoá cũ còn hạn 7 ngày), đăng nhập mới ký bằng khoá mới");
}

/** Xoay vòng khoá cron trong DB: hệ thống nhận CẢ khoá env lẫn khoá DB nên nơi
 *  gọi cron cũ không bị gãy; khoá mới chỉ hiện MỘT LẦN qua cookie ngắn hạn. */
export async function rotateCronSecretAction() {
  const admin = await requireAdmin();
  await assertStepUp(admin.id, PAGE);
  const fresh = randomBytes(32).toString("hex");
  await setSetting("cron_secret", fresh);
  cookies().set("smmv2_cron_once", fresh, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 300,
    secure: process.env.NODE_ENV === "production",
  });
  await writeAudit({
    actorId: admin.id, actorName: admin.username, role: admin.role, scope: "mother", panelId: null,
    action: "secret.rotate_cron", targetType: "setting", targetId: "cron_secret",
    detail: "Xoay vòng khoá cron trong cơ sở dữ liệu (giá trị không ghi vào nhật ký)", ip: currentIp(),
  });
  back("msg", "Đã tạo khoá cron mới — sao chép ngay bên dưới, khoá chỉ hiện một lần");
}

/** Ẩn khoá cron vừa hiện một lần (xoá cookie chứa khoá) */
export async function clearCronSecretOnceAction() {
  await requireAdmin();
  cookies().delete("smmv2_cron_once");
  back("msg", "Đã ẩn khoá cron");
}
