/**
 * Logo CHÍNH THỨC BNT Shop gói sẵn trong repo (Tín gửi 2026-11-13, đợt 117) —
 * file tĩnh ở public/brand/, phục vụ thẳng, KHÔNG qua đường upload/watermark
 * (logo được miễn đóng dấu theo cơ chế sẵn có).
 *
 * Luật ưu tiên hiển thị ở mọi bề mặt: logo admin tự tải (logo_url /
 * logo_menu_url trong Cấu hình) LUÔN thắng; chỉ khi setting trống mới rơi
 * về logo gói sẵn ở đây.
 */
export const BRAND_ICON_URL = "/brand/logo-icon.jpg"; // bản vuông (icon + túi vương miện)
export const BRAND_FULL_URL = "/brand/logo-full.jpg"; // bản ngang (icon + chữ BNT Shop)
export const BRAND_FAVICON_URL = "/brand/favicon.png"; // sinh từ bản icon 512×512
export const BRAND_APPLE_ICON_URL = "/brand/apple-icon.png"; // sinh từ bản icon 180×180
export const BRAND_ICON_192_URL = "/brand/icon-192.png"; // sinh từ bản icon 192×192 (manifest)

/** Logo nhỏ VUÔNG cho sidebar admin (chỗ hẹp, đi kèm tên chữ): admin → gói sẵn icon.
 *  Header khách KHÔNG còn dùng bản vuông này (đợt 118 — chỉ logo ngang). */
export function headerLogoUrl(logoUrl?: string | null): string {
  return logoUrl && logoUrl.trim() ? logoUrl : BRAND_ICON_URL;
}

/** Logo NGANG duy nhất cho header khách MỌI khổ (đợt 118) + đầu ngăn kéo:
 *  menu → logo nhỏ → gói sẵn bản ngang. */
export function wideLogoUrl(logoMenuUrl?: string | null, logoUrl?: string | null): string {
  if (logoMenuUrl && logoMenuUrl.trim()) return logoMenuUrl;
  if (logoUrl && logoUrl.trim()) return logoUrl;
  return BRAND_FULL_URL;
}

/** Logo cho footer (đủ bề ngang): admin → gói sẵn bản ngang. */
export function footerLogoUrl(logoUrl?: string | null): string {
  return logoUrl && logoUrl.trim() ? logoUrl : BRAND_FULL_URL;
}
