import { prisma } from "./db";
import { getSettings } from "./settings";
import { applyBalance } from "./wallet";
import { notifyUser } from "./notify";

/** Phí tháng của 1 panel: tạo từ panel cha thì theo panelFee của panel cha
 *  (tiền thuộc về chủ panel cha), tạo từ web mẹ thì theo panel_fee trong Cấu hình. */
export async function monthlyFeeForPanel(panel: { parentPanelId: number | null }) {
  if (panel.parentPanelId) {
    const parent = await prisma.childPanel.findUnique({
      where: { id: panel.parentPanelId },
      select: { id: true, ownerId: true, panelFee: true },
    });
    if (parent) return { fee: Math.max(0, parent.panelFee || 0), parent };
  }
  const settings = await getSettings();
  return { fee: Math.max(0, parseInt(settings.panel_fee || "0") || 0), parent: null as null | { id: number; ownerId: number; panelFee: number } };
}

/** Gia hạn tự động cho các website con tới hạn (chạy trong cron đồng bộ):
 *  panel ACTIVE/EXPIRED có expiresAt trong vòng 36 giờ tới (hoặc đã qua) và bật
 *  autoRenew -> trừ phí tháng vào số dư chủ panel (panel lồng nhau: chủ panel cha
 *  nhận phí), cộng 30 ngày từ mốc hạn cũ (hoặc từ hiện tại nếu đã qua hạn).
 *  Không đủ số dư mà đã qua hạn -> status EXPIRED (website ngừng hoạt động,
 *  /api/panels/resolve chỉ trả panel ACTIVE) + báo cho chủ panel. */
export async function processPanelRenewals(limit = 50) {
  const now = new Date();
  const settings = await getSettings();
  const horizonHours = Math.max(1, parseInt(settings.panel_renew_horizon_hours || "") || 36);
  const periodDays = Math.max(1, parseInt(settings.panel_period_days || "") || 30);
  const horizon = new Date(now.getTime() + horizonHours * 3600000);
  const due = await prisma.childPanel.findMany({
    where: { expiresAt: { not: null, lte: horizon }, status: { in: ["ACTIVE", "EXPIRED"] }, autoRenew: true },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  const result = { checked: due.length, renewed: 0, expired: 0, waiting: 0, errors: 0 };
  for (const panel of due) {
   try {
    const label = panel.domain || panel.name;
    const { fee, parent } = await monthlyFeeForPanel(panel);
    if (fee <= 0) {
      // Đã chuyển sang miễn phí -> bỏ hạn dùng
      await prisma.childPanel.update({ where: { id: panel.id }, data: { expiresAt: null, ...(panel.status === "EXPIRED" ? { status: "ACTIVE" } : {}) } });
      result.renewed++;
      continue;
    }
    const owner = await prisma.user.findUnique({ where: { id: panel.ownerId }, select: { balance: true } });
    if (owner && owner.balance >= fee) {
      const base = panel.expiresAt && panel.expiresAt > now ? panel.expiresAt : now;
      const expiresAt = new Date(base.getTime() + periodDays * 86400000);
      await prisma.$transaction(async (tx) => {
        await applyBalance(tx, panel.ownerId, -fee, "PANEL_FEE", `PANEL-${panel.id}`, `Gia hạn website con ${label} (${periodDays} ngày)`);
        if (parent) {
          await applyBalance(tx, parent.ownerId, fee, "PANEL_FEE", `PANEL-${panel.id}`, `Thu phí gia hạn website con ${label}`);
        }
        await tx.childPanel.update({
          where: { id: panel.id },
          data: { expiresAt, ...(panel.status === "EXPIRED" ? { status: "ACTIVE" } : {}) },
        });
      });
      await notifyUser(panel.ownerId, "Gia hạn website con thành công", `${label} đã được gia hạn đến ${expiresAt.toLocaleDateString("vi-VN")} — đã trừ ${fee.toLocaleString("vi-VN")}₫ từ số dư.`, "/dashboard/panel-cua-toi");
      result.renewed++;
    } else if (panel.expiresAt && panel.expiresAt <= now) {
      if (panel.status !== "EXPIRED") {
        await prisma.childPanel.update({ where: { id: panel.id }, data: { status: "EXPIRED" } });
        await notifyUser(panel.ownerId, "Website con đã tạm ngưng", `${label} hết hạn và số dư không đủ để gia hạn (${fee.toLocaleString("vi-VN")}₫/tháng). Nạp thêm rồi bấm Gia hạn ngay để mở lại.`, "/dashboard/panel-cua-toi");
      }
      result.expired++;
    } else {
      result.waiting++;
    }
   } catch (e: any) {
    // Một panel lỗi (số dư âm do race cũ, dữ liệu hỏng...) không được làm đứt
    // cả vòng — ghi log rồi xử lý tiếp các panel còn lại.
    result.errors++;
    await prisma.apiLog.create({ data: { kind: "panel_renewal", ref: `PANEL-${panel.id}`, ok: false, detail: String(e?.message || e) } }).catch(() => {});
   }
  }
  return result;
}
