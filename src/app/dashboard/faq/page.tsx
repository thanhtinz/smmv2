import { redirect } from "next/navigation";

/** FAQ đã GỘP vào trang Hỗ trợ / Ticket (lệnh Tín 2026-11-09 19:12 "gộp cái câu
 *  hỏi đó vào cái ticket luôn cho gọn") — route cũ giữ dạng redirect về đúng
 *  mục câu hỏi (#faq) của trang gộp để mọi link cũ (footer, bookmark) không 404.
 *  Nội dung FAQ vẫn sửa ở Admin → Bài viết, danh mục slug "faq". */
export default function FaqPage() {
  redirect("/dashboard/ticket#faq");
}
