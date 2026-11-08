import { redirect } from "next/navigation";

/** Trang tổng quan khách ĐÃ BỎ HẲN (lệnh Tín 2026-11-07): trang chủ "/" là
 *  nhà của site và mang bố cục cửa hàng shopkey; mọi khối thống kê của trang
 *  tổng quan cũ (số dư, đếm đơn, biểu đồ) không còn tồn tại ở bất kỳ route nào.
 *  /dashboard chỉ giữ vai trò điểm chuyển hướng để mọi link cũ (sau đăng nhập,
 *  OAuth, email, menu con) đều đáp về trang chủ mà không phải sửa từng nơi. */
export default function DashboardHome() {
  redirect("/");
}
