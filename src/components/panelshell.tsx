import Link from "next/link";
import type { ReactNode } from "react";
import type { ChildPanel, User } from "@prisma/client";
import { logoutAction } from "@/app/actions/auth";
import { SideNav } from "@/components/nav";
import { DisplaySettings } from "@/components/display";
import { LiveChat } from "@/components/livechat";
import { I } from "@/components/ui";
import { vnd, LEVEL_NAME } from "@/lib/format";

/** Khung khu tài khoản của PANEL CON — dựng đúng khung dashboard web mẹ
 *  (header trắng dính + thẻ sidebar + chip số dư), chỉ thay thương hiệu/màu của panel */
export async function PanelShell({ panel, user, children }: { panel: ChildPanel; user: User; children: ReactNode }) {
  const motherSettings = await (await import("@/lib/settings")).getSettings();
  const items = [
    { href: `/cua-hang/${panel.slug}`, label: "Gian hàng", icon: I.home },
    ...(panel.sellSmm ? [{ href: "/dashboard/dat-hang", label: "Đặt đơn SMM", icon: I.cart },] : []),
    { href: `/cua-hang/${panel.slug}/don-hang`, label: "Đơn hàng SMM", icon: I.list },
    ...(panel.sellPremium ? [{ href: `/cua-hang/${panel.slug}/premium`, label: "Mua Premium", icon: I.gem },] : []),
    { href: `/cua-hang/${panel.slug}/don-premium`, label: "Đơn hàng Premium", icon: I.box },
    { href: "/dashboard/nap-tien", label: "Nạp tiền", icon: I.wallet },
    { href: `/cua-hang/${panel.slug}/giao-dich`, label: "Dòng tiền", icon: I.chart },
    ...(panel.moduleAffiliate ? [{ href: `/cua-hang/${panel.slug}/kiem-tien`, label: "Kiếm tiền", icon: I.money }] : []),
    { href: `/cua-hang/${panel.slug}/tai-lieu-api`, label: "Tài liệu API", icon: I.key },
    { href: "/dashboard/ticket", label: "Hỗ trợ / Ticket", icon: I.ticket },
    { href: "/dashboard", label: "Bảng điều khiển", icon: I.server },
  ];
  return (
    <div data-accent={panel.accent} className="min-h-screen bg-slate-50">
      <header className="bg-white/90 backdrop-blur border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 h-16 flex items-center gap-4">
          <Link href={`/cua-hang/${panel.slug}`} className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-brand-600 text-white font-black flex items-center justify-center">{panel.name.charAt(0).toUpperCase()}</span>
            <span className="font-extrabold text-slate-900 hidden sm:inline">{panel.name}</span>
          </Link>
          <div className="ml-auto flex items-center gap-2.5">
            <DisplaySettings />
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hidden sm:inline-block">{LEVEL_NAME[user.level]}</span>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-3.5 py-1.5 text-sm font-bold">{vnd(user.balance)}</span>
            <span className="hidden md:inline text-sm font-medium text-slate-700">{user.username}</span>
            <form action={logoutAction}><button className="btn-ghost btn-sm !py-2">Đăng xuất</button></form>
          </div>
        </div>
      </header>
      <div className="max-w-[1400px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[248px_1fr] gap-6 items-start">
        <aside className="lg:sticky lg:top-24 lg:bg-white lg:rounded-2xl lg:border lg:border-slate-200/60 lg:shadow-soft lg:p-3">
          <SideNav items={items} />
        </aside>
        <main className="min-w-0 pb-20 lg:pb-0">{children}</main>
      </div>
      {motherSettings.livechat_enabled !== "0" && <LiveChat panelSlug={panel.slug} />}
    </div>
  );
}
