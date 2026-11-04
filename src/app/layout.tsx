import type { Metadata } from "next";
import "./globals.css";
import { getSettings } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings().catch(() => null);
  return {
    title: `${s?.site_name || "SMMv2"} — SMM Panel & Tài khoản Premium`,
    description: s?.site_tagline || "Tăng like, follow, view tự động + tài khoản premium giá tốt",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
