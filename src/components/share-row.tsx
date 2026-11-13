"use client";
import { useLang } from "@/components/lang";

/** Hàng nút chia sẻ nhanh link giới thiệu qua các mạng xã hội — ô vuông bo
 *  góc màu thương hiệu + glyph trắng (đúng mẫu shopkey Tín gửi). URL là các
 *  share-intent chính thức của từng mạng; Zalo dùng endpoint chia sẻ web
 *  của Zalo, Messenger dùng hộp thoại gửi của Facebook. */
const GLYPHS: Record<string, React.ReactNode> = {
  facebook: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.3 0-1.1-.1-2.1-.1-2.1 0-3.6 1.3-3.6 3.7V11H8.2v3h2.5v7h2.8Z" /></svg>
  ),
  x: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.4L6.5 22H3.34l7.24-8.28L2.4 2h6.4l4.42 5.85L18.9 2Zm-1.1 18.13h1.73L7.86 3.77H6.01L17.8 20.13Z" /></svg>
  ),
  telegram: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.88 4.72 18.9 18.78c-.22 1-.82 1.24-1.66.78l-4.6-3.39-2.22 2.13c-.25.25-.45.45-.93.45l.33-4.72 8.6-7.77c.37-.33-.08-.52-.58-.19l-10.63 6.7-4.58-1.43c-1-.31-1.02-1 .21-1.47l17.9-6.9c.83-.31 1.56.2 1.28 1.52Z" /></svg>
  ),
  whatsapp: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></svg>
  ),
  messenger: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.373 0 0 4.973 0 11.111c0 3.493 1.745 6.616 4.472 8.652V24l4.086-2.242c1.09.301 2.246.465 3.442.465 6.627 0 12-4.974 12-11.112C24 4.973 18.627 0 12 0zm1.191 14.963-2.582-2.754-5.035 2.754 5.545-5.885 2.582 2.754 5.035-2.754-5.545 5.885z" /></svg>
  ),
  zalo: <span className="text-[17px] font-black leading-none">Z</span>,
};

const CHANNELS: { key: string; name: string; bg: string; href: (u: string, t: string) => string }[] = [
  { key: "facebook", name: "Facebook", bg: "bg-[#1877F2]", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { key: "x", name: "X", bg: "bg-black", href: (u, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: "telegram", name: "Telegram", bg: "bg-[#229ED9]", href: (u, t) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: "whatsapp", name: "WhatsApp", bg: "bg-[#25D366]", href: (u, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { key: "messenger", name: "Messenger", bg: "bg-[#0099FF]", href: (u) => `https://www.facebook.com/dialog/send?link=${encodeURIComponent(u)}&redirect_uri=${encodeURIComponent(u)}` },
  { key: "zalo", name: "Zalo", bg: "bg-[#0068FF]", href: (u) => `https://zalo.me/share?url=${encodeURIComponent(u)}` },
];

export function ShareRow({ url, text, channels = ["facebook", "x", "telegram", "whatsapp"], size = 44 }: {
  url: string;
  text: string;
  channels?: string[];
  size?: number;
}) {
  const { t } = useLang();
  const list = CHANNELS.filter((c) => channels.includes(c.key));
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {list.map((c) => (
        <a
          key={c.key}
          href={c.href(url, text)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${t("Chia sẻ qua")} ${c.name}`}
          title={`${t("Chia sẻ qua")} ${c.name}`}
          className={`flex items-center justify-center rounded-xl text-white shadow-sm transition hover:opacity-85 ${c.bg}`}
          style={{ width: size, height: size }}
        >
          {GLYPHS[c.key]}
        </a>
      ))}
    </div>
  );
}
