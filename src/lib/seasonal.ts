/** Hằng số trang trí mùa lễ hội DÙNG CHUNG server + client (module thường,
 *  KHÔNG "use client" — để frame phía server đọc được danh sách theme
 *  mà không dính proxy client-reference).
 *  Từ 2026-11-11 trang trí CHỈ gồm hiệu ứng hạt rơi theo theme (xem
 *  components/seasonal-decor): vòng treo, vật phẩm góc và dải màu nhấn đã bỏ.
 *  2026-11-11 bổ sung 5 theme theo lệnh Tín (mới có 4 theme là ít): Phục sinh,
 *  Black Friday, Lễ Tình nhân, Năm mới, Quốc khánh — tổng 9 theme. */
export type SeasonalTheme =
  | "tet" | "noel" | "halloween" | "trungthu"
  | "phucsinh" | "blackfriday" | "valentine" | "nammoi" | "quockhanh";
export const SEASONAL_THEMES: SeasonalTheme[] = [
  "tet", "noel", "halloween", "trungthu",
  "phucsinh", "blackfriday", "valentine", "nammoi", "quockhanh",
];

export function parseSeasonalTheme(v: string | undefined | null): SeasonalTheme | null {
  return v && (SEASONAL_THEMES as string[]).includes(v) ? (v as SeasonalTheme) : null;
}
