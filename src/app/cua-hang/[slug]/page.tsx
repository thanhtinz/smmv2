import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter } from "@/components/site";
import { Flash } from "@/components/ui";
import { vnd, num, PLATFORMS } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Gian hàng của panel con: giá đã cộng markup của chủ panel; đăng ký tại đây = khách của panel */
export default async function PanelStorefront({ params, searchParams }: { params: { slug: string }; searchParams: { msg?: string; err?: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug }, include: { owner: { select: { username: true } } } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const [services, memberCount] = await Promise.all([
    prisma.smmService.findMany({ where: { active: true }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }] }),
    prisma.user.count({ where: { panelId: panel.id } }),
  ]);
  const price = (rate: number) => Math.round(rate * (1 + panel.markup / 100));
  const platforms = Array.from(new Set(services.map((s) => s.category.platform)));
  return (
    <div data-accent={panel.accent}>
      <SiteHeader />
      <main className="max-w-7xl mx-auto px-4 py-10">
        <Flash msg={searchParams.msg} err={searchParams.err} />
        <section className="hero-bg rounded-[28px] px-6 py-12 sm:px-12 text-center border border-slate-200/70">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-600 text-white font-black text-2xl flex items-center justify-center">{panel.name.charAt(0).toUpperCase()}</div>
          <h1 className="mt-5 text-3xl sm:text-4xl font-black text-slate-900">{panel.name}</h1>
          <p className="mt-3 text-slate-500 max-w-xl mx-auto">{panel.tagline || "Dịch vụ tăng tương tác mạng xã hội nhanh, an toàn, bảo hành rõ ràng — đặt đơn tự động 24/7."}</p>
          <div className="mt-4 flex items-center justify-center gap-5 text-sm text-slate-500">
            <span><b className="text-slate-800">{num(services.length)}</b> dịch vụ</span>
            <span><b className="text-slate-800">{num(memberCount)}</b> khách hàng</span>
            <span><b className="text-slate-800">{platforms.length}</b> nền tảng</span>
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href={`/cua-hang/${panel.slug}/dang-ky`} className="btn-primary !px-6 !py-3">Đăng ký tài khoản</Link>
            <Link href="/login" className="btn-ghost !px-6 !py-3">Đã có tài khoản? Đăng nhập</Link>
          </div>
          <p className="mt-4 text-xs text-slate-400">Tài khoản đăng ký tại đây thuộc về {panel.name} và mua theo bảng giá của panel này.</p>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-extrabold text-slate-900 mb-1">Bảng giá dịch vụ</h2>
          <p className="text-sm text-slate-500 mb-6">Giá / 1.000 lượt — đặt đơn sau khi đăng ký và nạp tiền vào ví.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((s) => (
              <div key={s.id} className="card p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{PLATFORMS[s.category.platform] || s.category.name}</span>
                  {s.refill && <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Bảo hành</span>}
                  {s.dripfeed && <span className="text-[11px] font-bold text-brand-600 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5">Drip-feed</span>}
                </div>
                <div className="mt-2 font-semibold text-slate-800 leading-snug min-h-[44px]">{s.name}</div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <div className="text-xl font-extrabold text-brand-700">{vnd(price(s.rate))}</div>
                    <div className="text-xs text-slate-400">tối thiểu {num(s.min)} · {s.avgTime || "xử lý nhanh"}</div>
                  </div>
                  <Link href={`/cua-hang/${panel.slug}/dang-ky`} className="btn-primary btn-sm !px-4 !py-2">Đặt ngay</Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 card p-6 sm:p-8">
          <h3 className="font-bold text-slate-900">Cách mua tại {panel.name}</h3>
          <ol className="mt-3 grid sm:grid-cols-3 gap-4 text-sm text-slate-600">
            <li><b className="text-slate-800">1. Đăng ký</b> — tạo tài khoản ngay trên trang này (miễn phí).</li>
            <li><b className="text-slate-800">2. Nạp tiền</b> — chuyển khoản ngân hàng/MoMo, tiền vào ví tự động.</li>
            <li><b className="text-slate-800">3. Đặt đơn</b> — chọn dịch vụ, dán link, hệ thống chạy tự động và bảo hành theo gói.</li>
          </ol>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
