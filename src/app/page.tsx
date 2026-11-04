import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter } from "@/components/site";
import { getSettings } from "@/lib/settings";
import { vnd, num } from "@/lib/format";
import { I } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const s = await getSettings();
  const [serviceCount, premiumCount, smmOrderCount, premiumOrderCount, userCount, featured, premiums] = await Promise.all([
    prisma.smmService.count({ where: { active: true } }),
    prisma.premiumProduct.count({ where: { active: true } }),
    prisma.smmOrder.count(),
    prisma.premiumOrder.count(),
    prisma.user.count(),
    prisma.smmService.findMany({ where: { active: true }, take: 6, orderBy: { id: "asc" }, include: { category: true } }),
    prisma.premiumProduct.findMany({ where: { active: true }, take: 4, orderBy: { sort: "asc" }, include: { variants: { where: { active: true }, orderBy: { price: "asc" }, take: 1 } } }),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* HERO */}
        <section className="bg-slate-950 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(600px 300px at 15% 0%, #3178fc55, transparent), radial-gradient(700px 350px at 90% 20%, #7c3aed44, transparent)" }} />
          <div className="max-w-7xl mx-auto px-4 py-16 lg:py-24 relative grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-xs font-semibold">SMM Panel Việt Nam · Xử lý tự động 24/7</span>
              <h1 className="text-4xl lg:text-5xl font-black leading-tight mt-5">Tăng like, follow, view <span className="text-brand-400">giá sỉ</span> + tài khoản Premium giao ngay</h1>
              <p className="text-slate-300 mt-5 leading-relaxed max-w-lg">Một số dư cho cả hai: đặt dịch vụ mạng xã hội cho Facebook, TikTok, Instagram, YouTube... và mua YouTube Premium, Spotify, Netflix, ChatGPT... Hệ thống đấu API trực tiếp nhà cung cấp, phần còn lại có đội xử lý tay — theo dõi mọi đơn theo thời gian thực.</p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link href="/register" className="btn-primary !px-6 !py-3.5 !text-base">Tạo tài khoản miễn phí</Link>
                <Link href="/dich-vu" className="btn bg-white/10 text-white hover:bg-white/20 !px-6 !py-3.5 !text-base">Xem bảng giá</Link>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-10 max-w-md text-center">
                <HeroStat v={num(serviceCount) + "+"} l="Dịch vụ SMM" />
                <HeroStat v={num(premiumCount) + "+"} l="Sản phẩm Premium" />
                <HeroStat v={num(smmOrderCount + premiumOrderCount) + "+"} l="Đơn đã xử lý" />
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur">
              <div className="flex items-center justify-between mb-4">
                <div className="font-bold">Dịch vụ nổi bật</div>
                <Link href="/dich-vu" className="text-sm text-brand-300 hover:text-brand-200">Xem tất cả</Link>
              </div>
              <div className="space-y-3">
                {featured.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 bg-white/5 rounded-2xl px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{f.name}</div>
                      <div className="text-xs text-slate-400">{f.category.name} · {f.avgTime || "Xử lý nhanh"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-brand-300">{vnd(f.rate)}</div>
                      <div className="text-[11px] text-slate-400">/ 1000</div>
                    </div>
                  </div>
                ))}
                {featured.length === 0 && <p className="text-sm text-slate-400">Đang cập nhật dịch vụ...</p>}
              </div>
            </div>
          </div>
        </section>

        {/* 4 BƯỚC */}
        <section className="max-w-7xl mx-auto px-4 py-16">
          <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 text-center">Bắt đầu trong 4 bước</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
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
        <section className="max-w-7xl mx-auto px-4 py-16 grid lg:grid-cols-2 gap-6">
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
      </main>
      <SiteFooter />
    </div>
  );
}

function HeroStat({ v, l }: { v: string; l: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl py-3">
      <div className="font-extrabold text-lg">{v}</div>
      <div className="text-[11px] text-slate-400">{l}</div>
    </div>
  );
}
