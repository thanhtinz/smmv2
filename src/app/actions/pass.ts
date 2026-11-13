"use server";
import { requireUser } from "@/lib/auth";
import { buyPass, claimPassGift } from "@/lib/pass";
import { notifyUser } from "@/lib/notify";
import { vnd } from "@/lib/format";
import { redirect } from "next/navigation";

function back(key: "msg" | "err", text: string): never {
  redirect(`/pass?${key}=${encodeURIComponent(text)}`);
}

// LƯU Ý: redirect() của Next NÉM ngoại lệ NEXT_REDIRECT để điều hướng —
// vì vậy back() PHẢI đứng NGOÀI khối try/catch, nếu không catch sẽ nuốt
// ngoại lệ điều hướng và biến nó thành ?err=NEXT_REDIRECT (lỗi đã gặp
// 2026-11-13: mua thành công nhưng trang báo lỗi "NEXT_REDIRECT").

/** Mua / gia hạn Pass bằng số dư ví — lõi tiền ở lib/pass.ts (buyPass):
 *  trừ ví + dời hạn trong 1 transaction, gia hạn cộng tiếp từ hạn cũ. */
export async function buyPassAction(formData: FormData) {
  const user = await requireUser();
  const months = parseInt(String(formData.get("months") || ""));
  let text: string;
  let isErr = false;
  try {
    const r = await buyPass(user.id, months);
    await notifyUser(user.id, `Đã kích hoạt ${r.name}`, `${r.name} ${months} tháng đã được cộng vào tài khoản — hạn dùng tới ${r.expiry.toLocaleDateString("vi-VN")}. Số tiền đã trừ: ${vnd(r.price)}.`, "/pass");
    text = `Đã mua ${r.name} ${months} tháng — hạn dùng tới ${r.expiry.toLocaleDateString("vi-VN")}`;
  } catch (e: any) {
    isErr = true;
    text = String(e?.message || "Mua gói thất bại, vui lòng thử lại");
  }
  back(isErr ? "err" : "msg", text);
}

/** Nhận quà tháng của Pass — lõi ở lib/pass.ts (claimPassGift): giữ chỗ
 *  nguyên tử theo (khách × tháng), đơn quà 0đ qua createPremiumOrder. */
export async function claimPassGiftAction() {
  const user = await requireUser();
  let text: string;
  let isErr = false;
  try {
    const r = await claimPassGift(user.id);
    text = `Đã nhận quà tháng — đơn ${r.orderCode} (${r.productName} — ${r.variantName})`;
  } catch (e: any) {
    isErr = true;
    text = String(e?.message || "Nhận quà thất bại, vui lòng thử lại");
  }
  back(isErr ? "err" : "msg", text);
}
