import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter } from "@/components/site";
import { Flash } from "@/components/ui";
import { ServicesExplorer, type ServiceDTO } from "@/components/client";
import { vnd, num } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Gian hàng panel con — dựng bằng đúng khung của web mẹ (header/footer, hero,
 * ServicesExplorer, quy trình, FAQ, CTA) với thương hiệu + giá riêng của panel.
 */
export default async function PanelStorefront({ params, searchParams }: { params: { slug: string }; searchParams: { msg?: string; err?: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const [services, memberCount] = await Promise.all([
    prisma.smmService.findMany({ where: { active: true }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }, { id: "asc" }] }),
    prisma.user.count({ where: { panelId: panel.id } }),
  ]);
  const dto: ServiceDTO[] = services.map((s) => ({
    id: s.id, name: s.name, description: s.description,
    rate: Math.round(s.rate * (1 + panel.markup / 100)),
    min: s.min, max: s.max, avgTime: s.avgTime, refill: s.refill, dripfeed: s.dripfeed,
    categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  const tiers = [
    { name: "Thành viên", disc: panel.discountMember, note: "Mặc định khi đăng ký" },
    { name: "Đại lý", disc: panel.discountReseller, note: "Cho khách chạy thường xuyên" },
    { name: "Tổng đại lý", disc: panel.discountAgency, note: "Cho khách số lượng lớn" },
    { name: "VIP", disc: panel.discountVip, note: "Giá tốt nhất của panel" },
  ];
  const steps = [
    { n: "01", t: "Đăng ký tài khoản", d: "Tạo tài khoản ngay tại gian hàng này — miễn phí, chỉ mất một phút." },
    { n: "02", t: "Nạp tiền vào ví", d: "Chuyển khoản ngân hàng hoặc MoMo, tiền vào ví tự động trong vài phút." },
    { n: "03", t: "Đặt đơn bằng link", d: "Chọn dịch vụ, dán link công khai và số lượng. Không bao giờ cần mật khẩu." },
    { n: "04", t: "Theo dõi & bảo hành", d: "Đơn chạy tự động 24/7; dịch vụ có bảo hành được bù khi số tụt trong hạn." },
  ];
  const faqs = [
    { q: "Tôi có phải đưa mật khẩu mạng xã hội không?", a: "Không bao giờ. Mọi dịch vụ chỉ chạy bằng link công khai của trang/bài viết/video." },
    { q: "Nạp tiền như thế nào?", a: "Sau khi đăng ký, vào mục Nạp tiền trong khu khách hàng để lấy thông tin chuyển khoản — chuyển đúng nội dung là tiền vào ví tự động." },
    { q: "Giá theo cấp bậc hoạt động ra sao?", a: `${panel.name} có 4 cấp bậc khách: Thành viên, Đại lý, Tổng đại lý và VIP. Chủ panel sẽ nâng bậc cho khách quen — bậc càng cao giá càng rẻ theo bảng giá cấp bậc bên dưới.` },
    { q: "Đơn chạy trong bao lâu?", a: "Tuỳ dịch vụ, thời gian dự kiến ghi ngay ở từng dòng trong bảng giá. Đa số đơn bắt đầu trong vài phút sau khi đặt." },
    { q: "Số bị tụt có được bù không?", a: "Dịch vụ gắn nhãn bảo hành sẽ được bù (refill) khi số tụt trong thời hạn bảo hành của gói." },
  ];
  return (
    <div data-accent={panel.accent} className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* HERO — cùng ngôn ngữ với trang chủ web mẹ */}
        <section className="hero-bg border-b border-slate-200/70">
          <div className="max-w-7xl mx-auto px-4 py-14 lg:py-20 text-center">
            <Flash msg={searchParams.msg} err={searchParams.err} />
            <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-600 text-white font-black text-2xl flex items-center justify-center">{panel.name.charAt(0).toUpperCase()}</div>
            <h1 className="mt-5 text-3xl sm:text-5xl font-black text-slate-900 leading-tight">{panel.name}</h1>
            <p className="mt-4 text-slate-500 max-w-2xl mx-auto text-base sm:text-lg">{panel.tagline || "Dịch vụ tăng tương tác mạng xã hội nhanh, an toàn, bảo hành rõ ràng — đặt đơn tự động 24/7."}</p>
            <div className="mt-5 flex items-center justify-center gap-6 text-sm text-slate-500">
              <span><b className="text-slate-800">{num(services.length)}</b> dịch vụ</span>
              <span><b className="text-slate-800">{num(memberCount)}</b> khách hàng</span>
              <span><b className="text-slate-800">24/7</b> tự động</span>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={`/cua-hang/${panel.slug}/dang-ky`} className="btn-primary !px-7 !py-3.5 !text-base">Đăng ký miễn phí</Link>
              <a href="#bang-gia" className="btn-ghost !px-7 !py-3.5 !text-base bg-white">Xem bảng giá</a>
            </div>
            <p className="mt-4 text-xs text-slate-400">Tài khoản đăng ký tại đây thuộc về {panel.name} và mua theo bảng giá của panel này.{panel.support ? <> Hỗ trợ của panel: <b className="text-slate-500">{panel.support}</b></> : null}</p>
          </div>
        </section>

        {/* BẢNG GIÁ — đúng component của trang /dich-vu web mẹ */}
        <section id="bang-gia" className="max-w-7xl mx-auto px-4 py-12 lg:py-16 w-full scroll-mt-20">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900">Bảng giá dịch vụ SMM</h2>
          <p className="text-slate-500 mt-2 mb-8">Giá tính trên 1.000 lượt, đã gồm phụ phí của {panel.name}. Đăng ký miễn phí để đặt đơn; khách được nâng bậc sẽ có giá rẻ hơn nữa.</p>
          <ServicesExplorer services={dto} registerHref={`/cua-hang/${panel.slug}/dang-ky`} />
        </section>

        {/* GIÁ THEO CẤP BẬC */}
        <section className="bg-white border-y border-slate-200">
          <div className="max-w-7xl mx-auto px-4 py-14 lg:py-16">
            <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900">Giá riêng theo cấp bậc</h2>
            <p className="text-slate-500 mt-2 mb-8">Bốn cấp bậc khách của {panel.name} — giảm thêm trên giá panel, chủ panel nâng bậc cho khách ngay trong trang quản lý.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {tiers.map((t) => (
                <div key={t.name} className="card p-6">
                  <div className="text-sm font-bold text-slate-400 uppercase tracking-wide">{t.name}</div>
                  <div className="mt-2 text-3xl font-black text-brand-700">{t.disc > 0 ? `−${t.disc}%` : "Giá panel"}</div>
                  <p className="text-sm text-slate-500 mt-2">{t.note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* QUY TRÌNH — cùng bố cục mục 02 của web mẹ */}
        <section className="max-w-7xl mx-auto px-4 py-14 lg:py-16">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900">Bốn bước từ đăng ký tới đơn đầu tiên</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-8">
            {steps.map((s) => (
              <div key={s.n} className="card p-6">
                <div className="text-brand-600 font-black text-lg">{s.n}</div>
                <div className="mt-2 font-bold text-slate-900">{s.t}</div>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-white border-y border-slate-200">
          <div className="max-w-4xl mx-auto px-4 py-14 lg:py-16">
            <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 text-center">Câu hỏi thường gặp</h2>
            <div className="mt-8 space-y-3">
              {faqs.map((f) => (
                <details key={f.q} className="card px-6 py-4 group">
                  <summary className="font-semibold text-slate-800 cursor-pointer list-none flex items-center justify-between">{f.q}<span className="text-brand-600 font-black group-open:rotate-45 transition">+</span></summary>
                  <p className="text-sm text-slate-500 mt-2.5 leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-7xl mx-auto px-4 py-14">
          <div className="rounded-[28px] bg-brand-600 text-white px-6 py-12 sm:px-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-black">Bắt đầu với {panel.name} hôm nay</h2>
            <p className="mt-3 text-white/85 max-w-xl mx-auto">Đăng ký miễn phí, nạp tiền tự động và đặt đơn đầu tiên trong vài phút.</p>
            <Link href={`/cua-hang/${panel.slug}/dang-ky`} className="inline-block mt-7 rounded-full bg-white text-brand-700 font-bold px-8 py-3.5 hover:bg-brand-50 transition">Tạo tài khoản</Link>
            <div className="mt-4 text-sm text-white/70">Đã có tài khoản? <Link href="/login" className="underline font-semibold text-white">Đăng nhập</Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
