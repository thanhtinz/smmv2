import { TELEGRAM_GROUPS } from "./tg";

/** Phân khu đơn Premium (lệnh chủ site: "Đã nói tách riêng ra"): các nhóm
 *  sản phẩm số thuộc KHU RIÊNG — Telegram, Steam, Game Key, Gift Card và
 *  Top-Up (2026-11-08, lệnh "không có cái nào chung cái nào hết để dễ quản
 *  lý") — có trang đơn và khu quản trị riêng, nên KHÔNG được lẫn vào khu
 *  Premium thường (trang Đơn Premium của khách + hàng đợi Đơn Premium của
 *  admin + các đếm gắn với chúng). Mọi truy vấn "đơn Premium thường" đều
 *  dùng helper dưới đây để danh sách / thống kê / đếm không bao giờ lệch nhau. */
export const STEAM_GROUPS = ["steam_topup", "steam_gift"];
export const GAMEKEY_GROUPS = ["gamekeys"];
export const GIFTCARD_GROUPS = ["giftcards"];
export const TOPUP_GROUPS = ["topups"];
export const MANUAL_GROUPS = ["manual"];
export const DEDICATED_GROUPS = [...TELEGRAM_GROUPS, ...STEAM_GROUPS, ...GAMEKEY_GROUPS, ...GIFTCARD_GROUPS, ...TOPUP_GROUPS, ...MANUAL_GROUPS];

/** Điều kiện "đơn Premium THƯỜNG": variant KHÔNG thuộc nhóm của khu riêng.
 *  Viết dạng AND/OR tường minh vì hai cái bẫy đã gặp:
 *  - `NOT: { variant: { providerGroup: { in } } }` loại oan đơn mà variant
 *    có providerGroup = NULL (phép IN với NULL cho kết quả NULL trong SQL);
 *  - key OR ở cấp đơn sẽ bị ghi đè bởi OR của ô tìm kiếm khi spread chung.
 *  Đơn thuộc nhóm khác (giftcards/topups/manual của cửa hàng), variant
 *  không gắn nhóm, hoặc variant không còn tồn tại đều vẫn là Premium thường. */
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

/** Điều kiện "sản phẩm Premium THƯỜNG" cho các BỀ MẶT cửa hàng chung
 *  (trang chủ + /premium + sản phẩm liên quan + sitemap): TẤT CẢ 8 nhóm của
 *  các khu riêng (Telegram Stars/Premium, Steam Top-Up/Gift, Game Key,
 *  Gift Card, Top-Up, Manual) đều có catalog riêng của khu mình — sản phẩm
 *  của chúng KHÔNG được lẫn vào cửa hàng chung (lệnh chủ site 2026-11-08
 *  20:30: chủ site chưa thiết kế cách hiển thị chúng như sản phẩm cửa hàng
 *  nên không được hiện ở danh mục Premium / Sản phẩm nổi bật; trước đó
 *  Steam/Top-Up/Manual đã tách ở fix9/13/14, đợt này tách nốt gamekeys +
 *  giftcards + telegram + steam_topup). Sản phẩm giữ chỗ Steam Top-Up vẫn
 *  hiện ở các trang Steam như cũ — chỉ bề mặt chung là lọc. `none` ở đây an
 *  toàn (không có bẫy NULL như ở tầng đơn): sản phẩm không còn variant
 *  thuộc các nhóm trên đang tồn tại thì là sản phẩm thường. */
export function regularCatalogWhere() {
  return { variants: { none: { providerGroup: { in: DEDICATED_GROUPS } } } };
}
