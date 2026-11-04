import type { MetadataRoute } from "next";
import { getSettings } from "@/lib/settings";

/* Manifest webapp: khách lưu ra màn hình chính là mở như một app thật (standalone). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings().catch(() => null);
  const name = s?.site_name || "SMMv2";
  return {
    name,
    short_name: name,
    description: s?.site_tagline || "SMM Panel & tài khoản Premium",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6f9",
    theme_color: "#4680ff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
