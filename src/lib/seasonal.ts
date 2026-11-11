/** Hằng số trang trí mùa lễ hội DÙNG CHUNG server + client (module thường,
 *  KHÔNG "use client" — để frame phía server đọc được danh sách theme và
 *  màu nhấn mà không dính proxy client-reference). */
export type SeasonalTheme = "tet" | "noel" | "halloween" | "trungthu";
export const SEASONAL_THEMES: SeasonalTheme[] = ["tet", "noel", "halloween", "trungthu"];

export const SEASONAL_ACCENT: Record<SeasonalTheme, { wash: string; strip: string }> = {
  tet: {
    wash: "rgba(214,40,40,0.10)",
    strip: "linear-gradient(90deg,#991b1b,#dc2626 45%,#b45309)",
  },
  noel: {
    wash: "rgba(22,101,52,0.10)",
    strip: "linear-gradient(90deg,#14532d,#166534 45%,#991b1b)",
  },
  halloween: {
    wash: "rgba(234,88,12,0.10)",
    strip: "linear-gradient(90deg,#431407,#9a3412 45%,#3b0764)",
  },
  trungthu: {
    wash: "rgba(217,119,6,0.12)",
    strip: "linear-gradient(90deg,#7c2d12,#b45309 45%,#9d174d)",
  },
};

export function parseSeasonalTheme(v: string | undefined | null): SeasonalTheme | null {
  return v && (SEASONAL_THEMES as string[]).includes(v) ? (v as SeasonalTheme) : null;
}
