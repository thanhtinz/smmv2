import Link from "next/link";
import { ReactNode } from "react";

export function Badge({ children, cls }: { children: ReactNode; cls: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}
export function PageHead({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 hidden h-10 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-brand-500 via-violet-500 to-fuchsia-500 sm:block" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          {desc && <p className="text-sm text-slate-500 mt-1">{desc}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
const STAT_TONES: Record<string, { tile: string; bar: string }> = {
  brand: { tile: "bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand-500/30", bar: "from-brand-500 to-brand-300" },
  blue: { tile: "bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/30", bar: "from-blue-500 to-sky-300" },
  emerald: { tile: "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30", bar: "from-emerald-500 to-teal-300" },
  rose: { tile: "bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/30", bar: "from-rose-500 to-pink-300" },
  orange: { tile: "bg-gradient-to-br from-orange-500 to-amber-600 shadow-orange-500/30", bar: "from-orange-500 to-amber-300" },
  violet: { tile: "bg-gradient-to-br from-violet-500 to-purple-700 shadow-violet-500/30", bar: "from-violet-500 to-purple-300" },
  cyan: { tile: "bg-gradient-to-br from-cyan-500 to-sky-600 shadow-cyan-500/30", bar: "from-cyan-500 to-sky-300" },
  amber: { tile: "bg-gradient-to-br from-amber-500 to-yellow-600 shadow-amber-500/30", bar: "from-amber-500 to-yellow-300" },
};
export function Stat({ label, value, sub, icon, tone = "brand" }: { label: string; value: string; sub?: ReactNode; icon: ReactNode; tone?: string }) {
  const t = STAT_TONES[tone] || STAT_TONES.brand;
  return (
    <div className="card relative overflow-hidden p-5">
      <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.bar}`} />
      <div className="flex items-start gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-lg ${t.tile}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="whitespace-nowrap text-[clamp(15px,4.2vw,20px)] font-extrabold leading-snug text-slate-900">{value}</div>
          {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

/** Huy hiệu hạng 1/2/3 cho các bảng xếp hạng (vàng / bạc / đồng). */
export function RankBadge({ rank }: { rank: number }) {
  const cls = rank === 1
    ? "bg-gradient-to-br from-amber-400 to-yellow-600 text-white shadow-amber-500/40"
    : rank === 2
      ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-slate-400/40"
      : rank === 3
        ? "bg-gradient-to-br from-orange-400 to-amber-700 text-white shadow-orange-500/40"
        : "bg-slate-100 text-slate-500 shadow-none";
  return <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold shadow-md ${cls}`}>{rank}</span>;
}
export function Empty({ text }: { text: string }) {
  return <div className="card p-10 text-center text-sm text-slate-400">{text}</div>;
}
export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div className={`mb-5 rounded-xl px-4 py-3 text-sm font-medium ${err ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
      {err || msg}
    </div>
  );
}
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 mb-4">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      {children}
    </Link>
  );
}

/* ------- Đầu mục đánh số kiểu landing (dùng chung web mẹ + landing panel con) ------- */
export function SectionHead({ no, label, title, desc, center }: { no: string; label: string; title: string; desc?: string; center?: boolean }) {
  return (
    <div className={`mb-10 ${center ? "text-center" : ""}`}>
      <div className="text-xs font-black tracking-[0.18em] text-brand-600">{no} — {label.toUpperCase()}</div>
      <h2 className="text-2xl lg:text-4xl font-extrabold text-slate-900 mt-2.5 leading-tight">{title}</h2>
      {desc && <p className={`text-slate-500 mt-3 leading-relaxed ${center ? "mx-auto" : ""} max-w-2xl`}>{desc}</p>}
    </div>
  );
}

export function HeroStat({ v, l }: { v: string; l: string }) {
  return (
    <div className="bg-white border border-slate-200/70 shadow-soft rounded-2xl py-3">
      <div className="font-extrabold text-lg text-slate-900">{v}</div>
      <div className="text-[11px] text-slate-400">{l}</div>
    </div>
  );
}

/* ------- SVG icons (không dùng emoji theo chuẩn UI) ------- */
const P = ({ d, size = 20 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
export const I = {
  home: <P d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  cart: <P d="M2 3h3l2.6 12.5a1 1 0 0 0 1 .5h8.9a1 1 0 0 0 1-.8L20.5 7H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />,
  box: <P d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" />,
  gem: <P d="M6 3h12l4 6-10 12L2 9l4-6ZM2 9h20M12 21 8 9l2.5-6M12 21l4-12-2.5-6" />,
  wallet: <P d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M21 12h-5a2 2 0 0 0 0 4h5v-4Z" />,
  list: <P d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  chart: <P d="M3 3v18h18M8 17v-6M13 17V7M18 17v-9" />,
  users: <P d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
  server: <P d="M2 3h20v7H2zM2 14h20v7H2zM6 6.5h.01M6 17.5h.01" />,
  key: <P d="m21 2-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78Zm0 0L19 3.5m-3.5 3.5L18 9.5" />,
  ticket: <P d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />,
  gear: <P d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.5 7.5 0 0 0-.14-1.28l2-1.55-2-3.46-2.36.95a7.6 7.6 0 0 0-2.22-1.28L14.34 2h-4.68l-.34 2.58a7.6 7.6 0 0 0-2.22 1.28l-2.36-.95-2 3.46 2 1.55a7.5 7.5 0 0 0 0 2.56l-2 1.55 2 3.46 2.36-.95a7.6 7.6 0 0 0 2.22 1.28l.34 2.58h4.68l.34-2.58a7.6 7.6 0 0 0 2.22-1.28l2.36.95 2-3.46-2-1.55c.1-.42.14-.85.14-1.28Z" />,
  out: <P d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  plus: <P d="M12 5v14M5 12h14" />,
  refresh: <P d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />,
  shield: <P d="M12 22s8-3.6 8-10V5l-8-3-8 3v7c0 6.4 8 10 8 10Z" />,
  clock: <P d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14v6l4 2" />,
  check: <P d="M20 6 9 17l-5-5" />,
  db: <P d="M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3Zm9 2c0 1.66-4.03 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />,
  megaphone: <P d="m3 11 18-5v12L3 14v-3Zm0 0v3M11.6 16.8a3 3 0 1 1-5.8-1.6" />,
  bell: <P d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />,
  layers: <P d="m12 2 10 5-10 5L2 7l10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" />,
  money: <P d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-17.5V19M15.3 7.4c-.6-.9-1.9-1.4-3.3-1.4-1.9 0-3.4 1-3.4 2.4 0 3.4 6.8 2.7 6.8 4.9 0 1.4-1.5 2.4-3.4 2.4-1.4 0-2.7-.5-3.3-1.4" />,
  gift: <P d="M4 11h16v10H4zM4 7h16v4H4zM12 7v14M12 7C8 7 7.5 3 9.5 2.5C11 2 12 4 12 7Zm0 0c4 0 4.5-4 2.5-4.5C13 2 12 4 12 7Z" />,
  file: <P d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9zM13 3v6h6M9 13h6M9 17h6" />,
  mail: <P d="M22 7l-10 6L2 7M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />,
  landmark: <P d="M3 21h18M6 18v-8M10 18v-8M14 18v-8M18 18v-8M2 10l10-5 10 5zM4 21v-3h16v3" />,
  cpu: <P d="M5 5h14v14H5zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3M10 10h4v4h-4z" />,
  percent: <P d="M19 5L5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm11 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
  panels: <P d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
};

export const PLATFORM_COLORS: Record<string, string> = {
  facebook: "#1877F2",
  tiktok: "#111111",
  instagram: "#E1306C",
  youtube: "#FF0000",
  telegram: "#229ED9",
  shopee: "#EE4D2D",
  x: "#000000",
  spotify: "#1DB954",
  other: "#64748b",
};
