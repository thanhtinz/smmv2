import Link from "next/link";
import { SiteFooter, PublicHeader } from "@/components/site";
import { getServerI18n } from "@/lib/lang-server";

/**
 * Khung trang Đăng nhập / Đăng ký theo "Kiểu trang Đăng nhập / Đăng ký" ở
 * Cài đặt → Landing Page (web mẹ). 5 kiểu:
 * classic (thẻ giữa, nền tối), glass (kính mờ trên nền gradient), minimal
 * (nền sáng, không khung), app (thẻ bo tròn lớn), split (chia đôi: cột
 * thương hiệu trái — form phải, kiểu panel quốc tế).
 */
export async function AuthShell(props: {
  style?: string | null;
  brandName: string;
  tagline?: string | null;
  accent?: string | null;
  announcement?: string | null;
  children: React.ReactNode;
}) {
  const { L } = await getServerI18n();
  const style = props.style || "classic";

  if (style === "split") {
    return (
      <div data-accent={props.accent || undefined} className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-900 to-slate-950 p-10 text-white lg:flex">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl" />
          <Link href="/" className="relative flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg font-black">{props.brandName.charAt(0).toUpperCase()}</span>
            <span className="text-lg font-extrabold tracking-tight">{props.brandName}</span>
          </Link>
          <div className="relative">
            <h2 className="max-w-md text-3xl font-extrabold leading-tight">{props.tagline ? L(props.tagline) : L("Tăng trưởng mạng xã hội, nhanh và gọn hơn.")}</h2>
            <ul className="mt-8 space-y-3.5 text-[15px] text-white/85">
              {[L("Đặt đơn tự động 24/7, theo dõi tiến độ theo thời gian thực"), L("Nạp tiền tự động qua QR ngân hàng và ví điện tử"), L("API đầy đủ cho đại lý, hỗ trợ qua ticket")].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 12.5 5 5 10-11" /></svg>
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative text-sm text-white/60">© {props.brandName}</div>
        </div>
        <div className="flex flex-col bg-slate-50">
          <div className="flex items-center justify-between px-5 py-4 lg:hidden">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-black text-white">{props.brandName.charAt(0).toUpperCase()}</span>
              <span className="font-extrabold text-slate-900">{props.brandName}</span>
            </span>
            <Link href="/" className="text-sm font-semibold text-brand-600">{L("Trang chủ")}</Link>
          </div>
          <main className="flex flex-1 items-center justify-center px-4 py-10">
            <div className="w-full max-w-md"><div className="auth-scope contents">{props.children}</div></div>
          </main>
          <div className="hidden px-5 pb-5 text-right lg:block">
            <Link href="/" className="text-sm font-semibold text-brand-600">{L("← Về trang chủ")}</Link>
          </div>
        </div>
      </div>
    );
  }

  if (style === "glass") {
    return (
      <div data-accent={props.accent || undefined} className="dark pub-dark relative min-h-screen flex flex-col overflow-hidden bg-[#0a0f1e] text-slate-300">
        <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 bottom-0 h-[28rem] w-[28rem] rounded-full bg-fuchsia-600/20 blur-3xl" />
        <PublicHeader announcement={props.announcement} />
        <main className="relative flex-1 flex items-center justify-center px-4 py-14"><div className="auth-scope contents">{props.children}</div></main>
        <SiteFooter />
      </div>
    );
  }

  if (style === "minimal") {
    return (
      <div data-accent={props.accent || undefined} className="min-h-screen flex flex-col bg-slate-50 text-slate-600">
        <PublicHeader announcement={props.announcement} />
        <main className="flex-1 flex items-center justify-center px-4 py-14"><div className="auth-scope contents">{props.children}</div></main>
        <SiteFooter />
      </div>
    );
  }

  // classic + app: nền tối, thẻ giữa màn hình (khác nhau ở lớp thẻ).
  // Thẻ classic (.card) bám nền tối của khung -> cần .auth-on-dark để chữ sáng;
  // thẻ app là thẻ trắng nên giữ tông chữ tối như các kiểu thẻ sáng.
  const scopeCls = style === "app" ? "auth-scope contents" : "auth-scope auth-on-dark contents";
  return (
    <div data-accent={props.accent || undefined} className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader announcement={props.announcement} />
      <main className="flex-1 flex items-center justify-center px-4 py-14"><div className={scopeCls}>{props.children}</div></main>
      <SiteFooter />
    </div>
  );
}
