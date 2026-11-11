/** Hằng số trang trí mùa lễ hội DÙNG CHUNG server + client (module thường,
 *  KHÔNG "use client" — để frame phía server đọc được danh sách theme
 *  mà không dính proxy client-reference).
 *  Từ 2026-11-11 trang trí CHỈ gồm hiệu ứng hạt rơi theo theme (xem
 *  components/seasonal-decor): vòng treo, vật phẩm góc và dải màu nhấn đã bỏ. */
export type SeasonalTheme = "tet" | "noel" | "halloween" | "trungthu";
export const SEASONAL_THEMES: SeasonalTheme[] = ["tet", "noel", "halloween", "trungthu"];

export function parseSeasonalTheme(v: string | undefined | null): SeasonalTheme | null {
  return v && (SEASONAL_THEMES as string[]).includes(v) ? (v as SeasonalTheme) : null;
}
