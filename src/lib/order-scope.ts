import { TELEGRAM_GROUPS } from "./tg";

/** Phân khu đơn Premium (lệnh chủ site: "Đã nói tách riêng ra"): các nhóm
 *  sản phẩm số thuộc KHU RIÊNG — Telegram và Steam — có trang đơn và khu
 *  quản trị riêng, nên KHÔNG được lẫn vào khu Premium thường (trang Đơn
 *  Premium của khách + hàng đợi Đơn Premium của admin + các đếm gắn với
 *  chúng). Mọi truy vấn "đơn Premium thường" đều dùng helper dưới đây để
 *  danh sách / thống kê / đếm không bao giờ lệch nhau. */
export const STEAM_GROUPS = ["steam_topup", "steam_gift"];
export const DEDICATED_GROUPS = [...TELEGRAM_GROUPS, ...STEAM_GROUPS];

/** Điều kiện "đơn Premium THƯỜNG": variant KHÔNG thuộc nhóm của khu riêng.
 *  Viết dạng AND/OR tường minh vì hai cái bẫy đã gặp:
 *  - `NOT: { variant: { providerGroup: { in } } }` loại oan đơn mà variant
 *    có providerGroup = NULL (phép IN với NULL cho kết quả NULL trong SQL);
 *  - key OR ở cấp đơn sẽ bị ghi đè bởi OR của ô tìm kiếm khi spread chung.
 *  Đơn thuộc nhóm khác (gamekeys/giftcards/topups/manual của cửa hàng),
 *  variant không gắn nhóm, hoặc variant không còn tồn tại đều vẫn là
 *  Premium thường. */
export function regularPremiumWhere(userId?: number) {
  return {
    ...(userId ? { userId } : {}),
    AND: [
      {
        OR: [
          { variant: { providerGroup: null } },
          { variant: { providerGroup: { notIn: DEDICATED_GROUPS } } },
        ],
      },
    ],
  };
}

/** Điều kiện "sản phẩm Premium THƯỜNG" cho các BỀ MẶT cửa hàng (trang chủ +
 *  /premium + sản phẩm liên quan): sản phẩm Steam (gift games + sản phẩm
 *  giữ chỗ top-up) thuộc khu Steam riêng — có mục "Steam Gift Games" riêng
 *  trên trang chủ và các trang Steam — nên không lẫn vào catalog Premium.
 *  `none` ở đây an toàn (không có bẫy NULL như ở tầng đơn): sản phẩm không
 *  còn variant Steam nào đang tồn tại thì là sản phẩm thường. */
export function regularCatalogWhere() {
  return { variants: { none: { providerGroup: { in: STEAM_GROUPS } } } };
}
