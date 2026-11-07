import { redirect } from "next/navigation";

/** API key đã chuyển hẳn vào Hồ sơ -> tab Kết nối API (theo yêu cầu: menu chỉ còn
 *  link Tài liệu API). Đường dẫn cũ giữ lại để không gãy liên kết đã chia sẻ. */
export default function ApiKeyMovedPage() {
  redirect("/dashboard/ho-so?tab=api");
}
