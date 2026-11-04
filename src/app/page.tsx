import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter } from "@/components/site";
import { getSettings } from "@/lib/settings";
import { vnd, num, PLATFORMS } from "@/lib/format";
import { I, PLATFORM_COLORS } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const s = await getSettings();
  const [serviceCount, premiumCount, smmOrderCount, premiumOrderCount, userCount, featured, premiums, allServices] = await Promise.all([
    prisma.smmService.count({ where: { active: true } }),
    prisma.premiumProduct.count({ where: { active: true } }),
    prisma.smmOrder.count(),
    prisma.premiumOrder.count(),
    prisma.user.count(),
    prisma.smmService.findMany({ where: { active: true }, take: 6, orderBy: { id: "asc" }, include: { category: true } }),
    prisma.premiumProduct.findMany({ where: { active: true }, take: 4, orderBy: { sort: "asc" }, include: { variants: { where: { active: true }, orderBy: { price: "asc" }, take: 1 } } }),
    prisma.smmService.findMany({ where: { active: true }, select: { rate: true, category: { select: { platform: true } } } }),
  ]);
  const platformStats = Object.values(
    allServices.reduce<Record<string, { platform: string; count: number; from: number }>>((acc, sv) => {
      const p = sv.category.platform;
      if (!acc[p]) acc[p] = { platform: p, count: 0, from: sv.rate };
      acc[p].count += 1;
      acc[p].from = Math.min(acc[p].from, sv.rate);
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* HERO — nền sáng thoáng kiểu thatim, màu nhấn theo tông giao diện đang chọn */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 hero-bg" />
          <div className="max-w-7xl mx-auto px-4 py-16 lg:py-24 relative grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-100 text-brand-700 px-3 py-1.5 text-xs font-semibold">SMM Panel Việt Nam · Xử lý tự động 24/7</span>
              <h1 className="text-4xl lg:text-5xl font-black leading-tight mt-5 text-slate-900">Tăng like, follow, view <span className="text-brand-600">giá sỉ</span> + tài khoản Premium giao ngay</h1>
              <p className="text-slate-500 mt-5 leading-relaxed max-w-lg">Một số dư cho cả hai: đặt dịch vụ mạng xã hội cho Facebook, TikTok, Instagram, YouTube... và mua YouTube Premium, Spotify, Netflix, ChatGPT... Hệ thống đấu API trực tiếp nhà cung cấp, phần còn lại có đội xử lý tay — theo dõi mọi đơn theo thời gian thực.</p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link href="/register" className="btn-primary !px-6 !py-3.5 !text-base">Tạo tài khoản miễn phí</Link>
                <Link href="/dich-vu" className="btn-ghost !px-6 !py-3.5 !text-base">Xem bảng giá</Link>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-10 max-w-md text-center">
                <HeroStat v={num(serviceCount) + "+"} l="Dịch vụ SMM" />
                <HeroStat v={num(premiumCount) + "+"} l="Sản phẩm Premium" />
                <HeroStat v={num(smmOrderCount + premiumOrderCount) + "+"} l="Đơn đã xử lý" />
              </div>
            </div>
            <div className="card !rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="font-bold text-slate-900">Dịch vụ nổi bật</div>
                <Link href="/dich-vu" className="text-sm text-brand-600 hover:text-brand-700 font-medium">Xem tất cả</Link>
              </div>
              <div className="space-y-3">
                {featured.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate text-slate-800">{f.name}</div>
                      <div className="text-xs text-slate-400">{f.category.name} · {f.avgTime || "Xử lý nhanh"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-brand-700">{vnd(f.rate)}</div>
                      <div className="text-[11px] text-slate-400">/ 1000</div>
                    </div>
                  </div>
                ))}
                {featured.length === 0 && <p className="text-sm text-slate-400">Đang cập nhật dịch vụ...</p>}
              </div>
            </div>
          </div>
        </section>

        {/* NỀN TẢNG */}
        {platformStats.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 pb-4 pt-2">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {platformStats.map((p) => (
                <Link key={p.platform} href="/dich-vu" className="card p-5 flex items-center gap-4 hover:shadow-lg transition group">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-lg shrink-0" style={{ background: PLATFORM_COLORS[p.platform] || "#64748b" }}>{(PLATFORMS[p.platform] || p.platform).charAt(0)}</span>
                  <span className="min-w-0">
                    <span className="block font-bold text-slate-900 group-hover:text-brand-700">{PLATFORMS[p.platform] || p.platform}</span>
                    <span className="block text-xs text-slate-400 mt-0.5">{p.count} dịch vụ · từ {vnd(p.from)}/1000</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 4 BƯỚC */}
        <section className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 text-center">Bắt đầu trong 4 bước</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
            {[
              { t: "Đăng ký tài khoản", d: "Miễn phí, chỉ cần email. Nhận ngay API key để tích hợp nếu bạn là đại lý.", i: I.users },
              { t: "Nạp tiền", d: "Chuyển khoản ngân hàng quét VietQR — cộng tự động khi đúng nội dung. Có thưởng theo mốc nạp.", i: I.wallet },
              { t: "Chọn dịch vụ", d: "Dán link công khai, nhập số lượng, thấy đúng số tiền trước khi xác nhận. Không bao giờ hỏi mật khẩu.", i: I.cart },
              { t: "Theo dõi đơn", d: "Trạng thái cập nhật trực tiếp: chờ xử lý, đang chạy, hoàn thành, hoàn một phần (được hoàn tiền phần chưa chạy).", i: I.chart },
            ].map((x, idx) => (
              <div key={x.t} className="card p-6">
                <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">{x.i}</div>
                <div className="mt-4 font-bold text-slate-900">{idx + 1}. {x.t}</div>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{x.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PREMIUM */}
        <section className="bg-white border-y border-slate-200">
          <div className="max-w-7xl mx-auto px-4 py-16">
            <div className="flex items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900">Tài khoản Premium</h2>
                <p className="text-slate-500 mt-2">Kho tự động giao ngay sau khi mua · gói nâng cấp chính chủ được xử lý tay và bảo hành đầy đủ.</p>
              </div>
              <Link href="/premium" className="btn-ghost shrink-0">Xem tất cả</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {premiums.map((p) => (
                <Link key={p.id} href={`/premium/${p.slug}`} className="card p-6 hover:shadow-lg transition group">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl" style={{ background: p.color }}>{p.name.charAt(0)}</div>
                  <div className="font-bold text-slate-900 mt-4 group-hover:text-brand-700">{p.name}</div>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{p.tagline}</p>
                  {p.variants[0] && <div className="mt-4 text-sm">Chỉ từ <span className="font-extrabold text-brand-700 text-base">{vnd(p.variants[0].price)}</span></div>}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* API + CAM KẾT */}
        <section className="max-w-7xl mx-auto px-4 py-16 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-950 text-white rounded-3xl p-8">
            <div className="flex items-center gap-3 mb-4"><span className="text-brand-400">{I.key}</span><h3 className="text-xl font-bold">API cho đại lý — chuẩn SMM v2</h3></div>
            <p className="text-slate-300 text-sm leading-relaxed">Một endpoint duy nhất, tương thích Perfect Panel và hầu hết panel phổ biến: lấy dịch vụ, xem số dư, đặt đơn, kiểm tra trạng thái, huỷ và refill. Cấp Đại lý / Tổng đại lý / VIP được chiết khấu tự động trên mọi đơn.</p>
            <pre className="bg-white/5 border border-white/10 rounded-2xl p-4 text-xs overflow-x-auto mt-5 text-slate-200">{`POST /api/v2
key=YOUR_API_KEY&action=add
&service=12&link=https://...&quantity=1000

→ { "order": 48213 }`}</pre>
            <Link href="/api-docs" className="btn-primary mt-6">Đọc tài liệu API</Link>
          </div>
          <div className="card p-8">
            <div className="flex items-center gap-3 mb-4"><span className="text-brand-600">{I.shield}</span><h3 className="text-xl font-bold text-slate-900">Cam kết rõ ràng</h3></div>
            <ul className="space-y-3.5 text-sm text-slate-600">
              {[
                "Không bao giờ yêu cầu mật khẩu tài khoản mạng xã hội của bạn — chỉ cần link công khai.",
                "Đơn hoàn một phần được hoàn tiền tự động đúng phần chưa chạy.",
                "Dịch vụ có bảo hành (refill) được bù lại khi tụt trong thời hạn ghi rõ.",
                "Tài khoản premium bảo hành đổi mới theo đúng số ngày của từng gói.",
                "Sổ giao dịch minh bạch: mọi cộng/trừ số dư đều xem lại được.",
              ].map((x) => (
                <li key={x} className="flex gap-2.5"><span className="text-emerald-600 mt-0.5 shrink-0">{I.check}</span>{x}</li>
              ))}
            </ul>
            <div className="text-sm text-slate-400 mt-6">Đã có {num(userCount)} tài khoản đang sử dụng {s.site_name}.</div>
          </div>
        </section>
        {/* FAQ */}
        <section className="max-w-4xl mx-auto px-4 pb-16">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 text-center">Câu hỏi thường gặp</h2>
          <div className="mt-8 space-y-3">
            {[
              { q: "Đặt dịch vụ có cần mật khẩu tài khoản mạng xã hội không?", a: "Không. Bạn chỉ cần dán link công khai của trang/bài viết/video. Hệ thống tuyệt đối không hỏi mật khẩu — ai hỏi mật khẩu đều không phải chúng tôi." },
              { q: "Nạp tiền bao lâu thì vào tài khoản?", a: "Chuyển khoản đúng nội dung SMM + mã nạp của bạn: tiền được cộng tự động trong vài phút qua webhook ngân hàng, 24/7. Sai nội dung vẫn được duyệt tay trong giờ hành chính." },
              { q: "Đơn chạy thiếu hoặc bị huỷ thì sao?", a: "Đơn hoàn một phần (Partial) được hoàn tiền tự động đúng phần chưa chạy vào số dư. Đơn bị huỷ vì link sai khoá cũng được hoàn toàn bộ — xem lại trong Sổ giao dịch." },
              { q: "Tài khoản Premium được giao thế nào?", a: "Gói có kho: nhận tài khoản ngay trên trang đơn sau khi thanh toán. Gói nâng cấp chính chủ: gửi email của bạn, đội ngũ nâng cấp trực tiếp lên tài khoản đó và bảo hành theo số ngày của gói." },
              { q: "Làm đại lý có được giá tốt hơn không?", a: "Có. Cấp Đại lý chiết khấu 5%, Tổng đại lý 10%, VIP 15% tự động trên mọi đơn SMM, kèm API key chuẩn SMM v2 để đấu vào panel của bạn. Liên hệ hỗ trợ để được nâng cấp." },
              { q: "Tụt follow/like sau khi chạy có được bù không?", a: "Dịch vụ ghi 'Có bảo hành bù' sẽ được refill miễn phí khi tụt trong thời hạn bảo hành. Bấm nút yêu cầu bù ở chi tiết đơn hoặc gửi ticket kèm mã đơn." },
            ].map((f) => (
              <details key={f.q} className="card px-5 py-4 group">
                <summary className="font-semibold text-slate-800 cursor-pointer list-none flex items-center justify-between gap-3">
                  {f.q}
                  <span className="text-brand-600 transition-transform group-open:rotate-45 text-xl leading-none shrink-0">+</span>
                </summary>
                <p className="text-sm text-slate-500 leading-relaxed mt-2.5">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-7xl mx-auto px-4 pb-4">
          <div className="rounded-3xl bg-brand-600 text-white px-6 py-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-25" style={{ background: "radial-gradient(500px 220px at 15% 0%, #ffffff55, transparent), radial-gradient(600px 260px at 90% 100%, #00000033, transparent)" }} />
            <div className="relative">
              <h2 className="text-2xl lg:text-3xl font-black">Sẵn sàng tăng trưởng kênh của bạn?</h2>
              <p className="text-white/85 mt-3 max-w-xl mx-auto text-sm lg:text-base">Tạo tài khoản miễn phí trong 1 phút, nạp thử từ 10.000đ và đặt đơn đầu tiên — mọi thứ đều tự động.</p>
              <div className="flex flex-wrap justify-center gap-3 mt-7">
                <Link href="/register" className="btn bg-white text-brand-700 hover:bg-brand-50 !px-6 !py-3.5 !text-base font-bold">Đăng ký miễn phí</Link>
                <Link href="/premium" className="btn bg-white/15 text-white hover:bg-white/25 !px-6 !py-3.5 !text-base">Xem shop Premium</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function HeroStat({ v, l }: { v: string; l: string }) {
  return (
    <div className="bg-white border border-slate-200/70 shadow-soft rounded-2xl py-3">
      <div className="font-extrabold text-lg text-slate-900">{v}</div>
      <div className="text-[11px] text-slate-400">{l}</div>
    </div>
  );
}
