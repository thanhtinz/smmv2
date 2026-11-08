"use client";
import Link from "next/link";
import { useLang } from "@/components/lang";

/** Nút hành động nhanh trong chi tiết đơn: mở trang tạo ticket đã điền sẵn
 *  tiêu đề/nội dung kèm mã đơn — dùng chung hệ ticket, không xây hệ riêng.
 *  Chỉ NHÃN nút được dịch lúc render; tiêu đề/nội dung điền sẵn là dữ liệu
 *  của ticket (sẽ lưu vào hệ thống) nên giữ nguyên văn như hành vi cũ. */
export function OrderSupportActions({ code, category }: { code: string; category: "smm" | "premium" }) {
  const { t } = useLang();
  const mk = (kind: string, subject: string, body: string) =>
    `/dashboard/ticket?subject=${encodeURIComponent(subject)}&category=${category}&body=${encodeURIComponent(body)}#tao-ticket`;
  return (
    <div className="mt-5 flex flex-wrap gap-2 border-t border-dashed pt-5">
      <Link href={mk("err", `Báo lỗi đơn ${code}`, `Đơn ${code} gặp lỗi: `)} className="btn-ghost btn-sm">{t("Báo lỗi đơn")}</Link>
      <Link href={mk("refund", `Yêu cầu hoàn tiền đơn ${code}`, `Tôi muốn yêu cầu hoàn tiền cho đơn ${code} vì: `)} className="btn-ghost btn-sm">{t("Yêu cầu hoàn tiền")}</Link>
      <Link href={mk("complaint", `Khiếu nại đơn ${code}`, `Tôi muốn khiếu nại về đơn ${code}: `)} className="btn-ghost btn-sm">{t("Khiếu nại")}</Link>
    </div>
  );
}
