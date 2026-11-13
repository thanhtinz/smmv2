import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";
import { getServerI18n } from "@/lib/lang-server";
import { BRAND_FAVICON_URL, BRAND_ICON_192_URL } from "@/lib/brand";

/* Manifest webapp: khách lưu ra màn hình chính là mở như một app thật (standalone). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings().catch(() => null);
  const { L } = await getServerI18n().catch(() => ({ L: (t: string) => t }));
  const name = s?.site_name || "BNT Shop";
  return {
    name,
    short_name: name,
    description: L(s?.site_tagline || "Tài khoản Premium & Sản phẩm số"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6f9",
    theme_color: "#4680ff",
    icons: [
      { src: BRAND_ICON_192_URL, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: BRAND_FAVICON_URL, sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
