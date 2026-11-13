"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { applyBalance } from "@/lib/wallet";
import { applyAffiliateBalance, affiliateWithdrawMin } from "@/lib/affiliate";
import { notifyUser } from "@/lib/notify";
import { redirect } from "next/navigation";

function back(key: "msg" | "err", text: string): never {
  redirect(`/dashboard/kiem-tien?${key}=${encodeURIComponent(text)}`);
}

/** Đăng ký tham gia chương trình giới thiệu — ghi mốc affiliateEnrolledAt
 *  (một lần, không ghi đè). Trước khi tham gia, route /dashboard/kiem-tien
 *  hiện trang GIỚI THIỆU chương trình; sau khi tham gia mới hiện dashboard
 *  hoa hồng. Việc ghi nhận hoa hồng của engine vẫn chạy theo quan hệ giới
 *  thiệu sẵn có — cổng này chỉ khoá PHẦN HIỂN THỊ/link/thống kê. */
export async function enrollAffiliateAction() {
  const user = await requireUser();
  const settings = await getSettings();
  if (settings.module_affiliate === "0") back("err", "Chương trình giới thiệu đang tắt");
  await prisma.user.updateMany({
    where: { id: user.id, affiliateEnrolledAt: null },
    data: { affiliateEnrolledAt: new Date() },
  });
  back("msg", "Bạn đã tham gia chương trình giới thiệu bạn bè");
}

/** Rút TOÀN BỘ số dư hoa hồng về ví chính — chỉ khi đạt mức tối thiểu admin
 *  cấu hình (affiliate_withdraw_min). Hai chân tiền chạy trong MỘT transaction:
 *  trừ số dư hoa hồng (sổ AffiliateTxn WITHDRAW) + cộng ví chính (sổ
 *  Transaction AFFILIATE_WITHDRAW) — lệch một chân là cả giao dịch huỷ. */
export async function withdrawAffiliateAction() {
  const user = await requireUser();
  const settings = await getSettings();
  if (settings.module_affiliate === "0") back("err", "Chương trình giới thiệu đang tắt");
  const min = affiliateWithdrawMin(settings);
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { affiliateBalance: true } });
  const amount = me?.affiliateBalance || 0;
  if (amount <= 0) back("err", "Số dư hoa hồng đang trống");
  if (amount < min) back("err", `Chưa đạt mức rút tối thiểu ${min.toLocaleString("vi-VN")}đ`);
  try {
    await prisma.$transaction(async (tx) => {
      await applyAffiliateBalance(tx, user.id, -amount, "WITHDRAW", { note: "Rút hoa hồng về ví chính" });
      await applyBalance(tx, user.id, amount, "AFFILIATE_WITHDRAW", undefined, "Rút hoa hồng giới thiệu về ví");
    });
  } catch (e: any) {
    back("err", String(e?.message || "Rút tiền thất bại, vui lòng thử lại"));
  }
  await notifyUser(user.id, "Rút hoa hồng thành công", `${amount.toLocaleString("vi-VN")}đ đã chuyển từ số dư hoa hồng về ví chính của bạn`, "/dashboard/kiem-tien");
  back("msg", `Đã rút ${amount.toLocaleString("vi-VN")}đ về ví chính`);
}
