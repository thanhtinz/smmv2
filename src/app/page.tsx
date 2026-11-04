import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter } from "@/components/site";
import { getSettings } from "@/lib/settings";
import { vnd, num, PLATFORMS } from "@/lib/format";
import { I, PLATFORM_COLORS } from "@/components/ui";

export const dynamic = "force-dynamic";

/* Landing page theo bố cục slike.vn: các mục đánh số 01–08, hero kèm mockup điện thoại,
   vòng đời đơn hàng, khối API, chương trình đại lý, năng lực, FAQ và CTA chốt.
   Mọi số liệu sản phẩm/dịch vụ lấy thật từ DB; số liệu tăng trưởng ghi rõ là minh hoạ. */

const PLATFORM_DESC: Record<string, string> = {
  facebook: "Like trang, follow và cảm xúc bài viết cho shop, creator và thương hiệu sống trên Facebook.",
  tiktok: "Tín hiệu sớm giúp video mới đi xa: follow, tim, view, share — chạy đều theo tốc độ bạn chọn.",
  instagram: "Độ tin cậy cho hồ sơ và đà tương tác giờ đầu cho bài viết mới. Mọi đơn chạy từ link công khai.",
  youtube: "Bằng chứng xã hội mà người xem kiểm tra trước khi bấm phát: sub, view và giờ xem.",
  telegram: "Số thành viên và view bài đều đặn để kênh mới không trống trải ngay ngày đầu.",
  shopee: "Theo dõi shop và tương tác sản phẩm cho gian hàng cần đà bán đầu tiên.",
  x: "Follow và tương tác cho tài khoản X (Twitter).",
  spotify: "Lượt nghe và follow cho nghệ sĩ, podcast.",
  other: "Dịch vụ cho các nền tảng khác.",
};

export default async function HomePage() {
  const s = await getSettings();
  const [serviceCount, premiumCount, smmOrderCount, premiumOrderCount, userCount, featured, premiums, allServices, categories] = await Promise.all([
    prisma.smmService.count({ where: { active: true } }),
    prisma.premiumProduct.count({ where: { active: true } }),
    prisma.smmOrder.count(),
    prisma.premiumOrder.count(),
    prisma.user.count(),
    prisma.smmService.findMany({ where: { active: true }, take: 5, orderBy: { id: "asc" }, include: { category: true } }),
    prisma.premiumProduct.findMany({ where: { active: true }, take: 4, orderBy: { sort: "asc" }, include: { variants: { where: { active: true }, orderBy: { price: "asc" }, take: 1 } } }),
    prisma.smmService.findMany({ where: { active: true }, select: { rate: true, category: { select: { platform: true } } } }),
    prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
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
  const catsByPlatform = new Map<string, string[]>();
  for (const c of categories) {
    const arr = catsByPlatform.get(c.platform) || [];
    arr.push(c.name.replace(/^(Facebook|TikTok|Instagram|YouTube|Telegram|Shopee)\s*/i, ""));
    catsByPlatform.set(c.platform, arr);
  }
  const totalOrders = smmOrderCount + premiumOrderCount;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* ================= HERO ================= */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 hero-bg" />
          <div className="max-w-7xl mx-auto px-4 pt-16 lg:pt-24 pb-10 relative grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-100 text-brand-700 px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]">SMM PANEL · API ĐẠI LÝ · TÀI KHOẢN PREMIUM</span>
              <h1 className="text-5xl lg:text-7xl font-black leading-[1.04] tracking-tight mt-6 text-slate-900">
                Tăng trưởng kênh,<br />chuẩn <span className="text-brand-600">hệ thống.</span>
              </h1>
              <p className="text-slate-500 mt-6 leading-relaxed max-w-lg text-base lg:text-lg">
                {s.site_name} là SMM Panel Việt Nam cung cấp dịch vụ tăng like, follow, view, comment cho Facebook, TikTok, Instagram, YouTube... cùng shop tài khoản Premium — một số dư, đấu API trực tiếp nhà cung cấp, theo dõi mọi đơn theo thời gian thực.
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link href="/register" className="btn-primary !px-6 !py-3.5 !text-base">Tạo tài khoản miễn phí</Link>
                <Link href="#dich-vu" className="btn-ghost !px-6 !py-3.5 !text-base">Khám phá dịch vụ</Link>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 mt-8 text-sm font-medium text-slate-600">
                {["API v2 chuẩn panel", "Hoàn tiền tự động", "Bảo hành bù (refill)", "Nạp VietQR tự động"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><span className="text-emerald-600">{I.check}</span>{t}</li>
                ))}
              </ul>
              <div className="grid grid-cols-3 gap-4 mt-10 max-w-md text-center">
                <HeroStat v={num(serviceCount) + "+"} l="Dịch vụ SMM" />
                <HeroStat v={num(premiumCount) + "+"} l="Sản phẩm Premium" />
                <HeroStat v={num(totalOrders) + "+"} l="Đơn đã xử lý" />
              </div>
            </div>

            {/* Mockup điện thoại + thẻ nổi (minh hoạ) */}
            <div className="relative mx-auto w-full max-w-[420px]">
              <div className="relative mx-auto w-[290px] rounded-[2.6rem] border-[10px] border-slate-900 bg-white shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-3 text-[11px] font-semibold text-slate-500">
                  <span>9:41</span><span className="w-16 h-4 bg-slate-900 rounded-full -mt-1" /><span>5G</span>
                </div>
                <div className="flex items-center gap-2.5 px-4 pt-3">
                  <span className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center font-black text-sm">{s.site_logo_text || "S"}</span>
                  <div>
                    <div className="text-sm font-bold text-slate-900 leading-none">thuonghieu.vn</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Được tài trợ</div>
                  </div>
                </div>
                <div className="mx-4 mt-3 h-44 rounded-2xl relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgb(var(--b400)), rgb(var(--b700)))" }}>
                  <span className="absolute inset-0 flex items-center justify-center text-white/25 font-black text-6xl">{s.site_logo_text || "S"}</span>
                  <span className="absolute bottom-2.5 left-3 text-white text-xs font-semibold bg-black/25 rounded-full px-2.5 py-1">Bài viết mới · Fashion & lifestyle</span>
                </div>
                <div className="px-4 py-3.5">
                  <div className="flex items-center gap-4 text-slate-700">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-rose-600">
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.7-10-9.3C.4 8.6 2.3 5 5.7 5c2 0 3.4 1.1 4.3 2.4h4C15 6.1 16.4 5 18.4 5c3.4 0 5.3 3.6 3.6 6.7C19.5 16.3 12 21 12 21Z" transform="scale(0.92) translate(1,0)" /></svg>
                      12.480
                    </span>
                    <span className="text-sm text-slate-500">318 bình luận</span>
                    <span className="text-sm text-slate-500">Chia sẻ</span>
                  </div>
                  <div className="mt-2.5 space-y-1.5">
                    <div className="h-2 rounded bg-slate-100 w-11/12" />
                    <div className="h-2 rounded bg-slate-100 w-2/3" />
                  </div>
                  <div className="grid grid-cols-3 text-center mt-4 pt-3 border-t border-slate-100">
                    <div><div className="font-extrabold text-slate-900">318</div><div className="text-[11px] text-slate-400">Bài viết</div></div>
                    <div><div className="font-extrabold text-slate-900">48,2K</div><div className="text-[11px] text-slate-400">Followers</div></div>
                    <div><div className="font-extrabold text-slate-900">212</div><div className="text-[11px] text-slate-400">Đang theo</div></div>
                  </div>
                </div>
              </div>
              <div className="absolute -left-3 sm:-left-8 top-24 card px-4 py-3 animate-floaty hidden sm:block">
                <div className="text-[11px] text-slate-400 font-medium">Followers hôm nay</div>
                <div className="font-extrabold text-emerald-600">+1.204</div>
              </div>
              <div className="absolute -right-2 sm:-right-6 bottom-24 card px-4 py-3 animate-floaty-slow hidden sm:block">
                <div className="text-[11px] text-slate-400 font-medium">Đơn gần nhất</div>
                <div className="text-sm font-bold text-slate-800">Đơn SMM · <span className="text-emerald-600">Hoàn thành</span></div>
              </div>
              <p className="text-center text-[11px] text-slate-400 mt-4">Giao diện minh hoạ</p>
            </div>
          </div>

          {/* Ticker nền tảng */}
          <div className="relative border-y border-slate-200/70 dark:border-slate-800 bg-white/60 dark:bg-slate-950/50 backdrop-blur overflow-hidden py-3.5">
            <div className="flex w-max animate-marquee gap-10 pr-10">
              {[...platformStats, ...platformStats].map((p, i) => (
                <span key={i} className="flex items-center gap-2.5 text-sm font-bold text-slate-500 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: PLATFORM_COLORS[p.platform] || "#64748b" }} />
                  {PLATFORMS[p.platform] || p.platform}
                  <span className="font-medium text-slate-400">· {p.count} dịch vụ</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 01 — DỊCH VỤ ================= */}
        <section id="dich-vu" className="max-w-7xl mx-auto px-4 py-16 lg:py-20 scroll-mt-20">
          <SectionHead no="01" label="Dịch vụ" title="Một panel cho mọi nền tảng bạn đang chạy." desc="Chọn nền tảng để xem dịch vụ thật đang bán ngay lúc này — giá, giới hạn và thời gian đều công khai." />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {platformStats.map((p) => (
              <div key={p.platform} className="card p-6 flex flex-col hover:shadow-lg transition">
                <div className="flex items-center gap-3.5">
                  <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shrink-0" style={{ background: PLATFORM_COLORS[p.platform] || "#64748b" }}>{(PLATFORMS[p.platform] || p.platform).charAt(0)}</span>
                  <div>
                    <div className="font-extrabold text-lg text-slate-900">{PLATFORMS[p.platform] || p.platform}</div>
                    <div className="text-xs text-slate-400">{p.count} dịch vụ · từ {vnd(p.from)}/1000</div>
                  </div>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed mt-4 flex-1">{PLATFORM_DESC[p.platform] || PLATFORM_DESC.other}</p>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {(catsByPlatform.get(p.platform) || []).slice(0, 6).map((c) => (
                    <span key={c} className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2.5 py-1">{c}</span>
                  ))}
                </div>
                <Link href="/dich-vu" className="btn-ghost btn-sm w-full mt-5 !py-2.5">Xem bảng giá {PLATFORMS[p.platform] || p.platform}</Link>
              </div>
            ))}
          </div>
          {featured.length > 0 && (
            <div className="card mt-6 overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr><th className="th">Dịch vụ bán chạy</th><th className="th">Danh mục</th><th className="th">Giá / 1000</th><th className="th">Thời gian</th><th className="th"></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {featured.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50/60">
                      <td className="td font-medium text-slate-800">{f.name}</td>
                      <td className="td text-slate-400 text-xs">{f.category.name}</td>
                      <td className="td font-bold text-brand-700">{vnd(f.rate)}</td>
                      <td className="td text-slate-500">{f.avgTime || "—"}</td>
                      <td className="td text-right"><Link href="/register" className="btn-primary btn-sm">Đặt ngay</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ================= 02 — QUY TRÌNH ================= */}
        <section id="quy-trinh" className="bg-white border-y border-slate-200 scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 py-16 lg:py-20">
            <SectionHead no="02" label="Quy trình" title="Bốn bước từ đăng ký tới đơn đầu tiên." />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { t: "Tạo tài khoản", d: "Đăng ký bằng email trong chưa đầy một phút. Không cần thẻ, không cam kết.", i: I.users },
                { t: "Nạp tiền", d: "Chuyển khoản ngân hàng quét VietQR hoặc MoMo — cộng tự động khi đúng nội dung, có thưởng theo mốc nạp.", i: I.wallet },
                { t: "Đặt đơn", d: "Chọn dịch vụ, dán link công khai, nhập số lượng và thấy đúng số tiền phải trả trước khi xác nhận.", i: I.cart },
                { t: "Theo dõi & bù", d: "Trạng thái đơn cập nhật trực tiếp; dịch vụ có bảo hành được bù (refill) khi tụt trong thời hạn.", i: I.chart },
              ].map((x, idx) => (
                <div key={x.t} className="card p-6">
                  <div className="flex items-center justify-between">
                    <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">{x.i}</span>
                    <span className="text-xs font-black tracking-widest text-slate-300">STEP 0{idx + 1}</span>
                  </div>
                  <div className="mt-4 font-bold text-slate-900">{x.t}</div>
                  <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{x.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 03 — VẬN HÀNH ================= */}
        <section id="van-hanh" className="max-w-7xl mx-auto px-4 py-16 lg:py-20 scroll-mt-20">
          <SectionHead no="03" label="Vận hành" title="Theo dõi đơn, bảo hành bù và hoàn tiền — đọc là hiểu." desc="Không có hộp đen giữa lúc trả tiền và lúc giao. Mỗi đơn đi qua các trạng thái rõ ràng, mọi trạng thái đều xem được trên web và qua API." />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-3">
              {[
                { n: "01", t: "Chờ xử lý", tag: "pending", d: "Đơn được kiểm tra theo luật dịch vụ (link, số lượng min/max) và số dư của bạn, rồi xếp hàng chờ đẩy đi." },
                { n: "02", t: "Đang chạy", tag: "processing", d: "Đơn ở phía nhà cung cấp. Số bắt đầu được ghi lại và số còn lại đếm ngược theo tiến độ giao." },
                { n: "03", t: "Hoàn thành", tag: "completed", d: "Giao đủ 100%. Với dịch vụ có bảo hành, từ đây bạn có thể yêu cầu bù (refill) khi số tụt trong thời hạn." },
                { n: "04", t: "Hoàn tiền phần chưa giao", tag: "partial · canceled → refunded", d: "Phần chưa giao được cộng lại vào số dư tự động — đơn hoàn một phần, bị huỷ hay lỗi đều theo đúng nguyên tắc này." },
                { n: "05", t: "Bảo hành bù", tag: "refill", d: "Yêu cầu bù trên đơn đã hoàn thành (với dịch vụ có refill), theo dõi yêu cầu tới khi hoàn tất hoặc bị từ chối." },
              ].map((x) => (
                <div key={x.n} className="card p-5 flex gap-4">
                  <span className="text-2xl font-black text-brand-200 shrink-0 w-10">{x.n}</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{x.t}</span>
                      <code className="text-[11px] font-mono bg-slate-100 text-slate-500 rounded-md px-2 py-0.5">{x.tag}</code>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed mt-1">{x.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-5">
              <div className="rounded-3xl bg-slate-950 text-slate-200 p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-sm font-bold text-white">POST /api/v2</span>
                  <span className="text-[11px] font-mono text-slate-400">minh hoạ</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="text-slate-400 mb-2 font-sans font-bold text-[11px] uppercase tracking-wide">Request</div>
                    <pre className="whitespace-pre-wrap leading-relaxed">{`key=YOUR_API_KEY
action=status
order=100482`}</pre>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="text-slate-400 mb-2 font-sans font-bold text-[11px] uppercase tracking-wide">Response · 200</div>
                    <pre className="whitespace-pre-wrap leading-relaxed">{`{
  "charge": "28500",
  "start_count": "3120",
  "status": "Completed",
  "remains": "0",
  "currency": "VND"
}`}</pre>
                  </div>
                </div>
                <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-4 font-mono text-xs space-y-1.5">
                  <div className="text-slate-400 font-sans font-bold text-[11px] uppercase tracking-wide mb-2">Nhật ký sự kiện</div>
                  <div><span className="text-slate-500">09:41:02</span> Đơn được tiếp nhận</div>
                  <div><span className="text-slate-500">09:41:03</span> Đã đẩy sang nhà cung cấp</div>
                  <div><span className="text-slate-500">09:41:09</span> Ghi số bắt đầu: 3.120</div>
                  <div><span className="text-slate-500">10:02:47</span> Hoàn thành — còn lại 0</div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { t: "Chính sách bù", d: "Áp dụng cho dịch vụ ghi refill: true. Yêu cầu ngay trong chi tiết đơn." },
                  { t: "Chính sách huỷ", d: "Dịch vụ hỗ trợ huỷ được huỷ qua web/API; tiền hoàn về số dư ngay." },
                  { t: "Chính sách hoàn", d: "Đơn lỗi, huỷ hoặc giao thiếu đều hoàn tự động đúng phần chưa giao." },
                ].map((x) => (
                  <div key={x.t} className="card p-5">
                    <div className="font-bold text-slate-900 text-sm">{x.t}</div>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1.5">{x.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ================= 04 — KẾT QUẢ ================= */}
        <section id="ket-qua" className="bg-white border-y border-slate-200 scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 py-16 lg:py-20">
            <SectionHead no="04" label="Kết quả" title="Bằng chứng xã hội cộng dồn theo thời gian." desc="So sánh một kênh để tự tăng trưởng với một kênh được đẩy đều tay. Số liệu dưới đây là ví dụ minh hoạ." />
            <div className="card p-6 lg:p-8">
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mb-8">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-600"><span className="w-3 h-3 rounded bg-slate-300" /> Tự nhiên</span>
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-600"><span className="w-3 h-3 rounded bg-brand-500" /> Có đẩy đều</span>
                <span className="ml-auto flex gap-6 text-sm">
                  <span>Followers <b className="text-slate-900">48.200</b></span>
                  <span>Reach <b className="text-slate-900">412.000</b></span>
                  <span>Tương tác <b className="text-slate-900">6,4%</b></span>
                </span>
              </div>
              <div className="flex items-end gap-2 sm:gap-4 h-48">
                {[
                  { a: 14, b: 20 }, { a: 17, b: 30 }, { a: 19, b: 42 }, { a: 22, b: 55 }, { a: 24, b: 68 }, { a: 27, b: 82 }, { a: 30, b: 97 },
                ].map((w, i) => (
                  <div key={i} className="flex-1 flex items-end justify-center gap-1 sm:gap-1.5 h-full">
                    <div className="w-3.5 sm:w-6 rounded-t-md bg-slate-300" style={{ height: `${w.a}%` }} title={`Tự nhiên · tuần ${i + 1}`} />
                    <div className="w-3.5 sm:w-6 rounded-t-md bg-brand-500" style={{ height: `${w.b}%` }} title={`Có đẩy đều · tuần ${i + 1}`} />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 sm:gap-4 mt-2">
                {["T1", "T2", "T3", "T4", "T5", "T6", "T7"].map((w) => (
                  <div key={w} className="flex-1 text-center text-[11px] text-slate-400">{w}</div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-5">Biểu đồ tăng trưởng followers theo tuần — số liệu minh hoạ, không phải cam kết kết quả.</p>
            </div>
          </div>
        </section>

        {/* ================= 05 — API ================= */}
        <section id="api" className="max-w-7xl mx-auto px-4 py-16 lg:py-20 scroll-mt-20">
          <SectionHead no="05" label="API cho đại lý" title="Một endpoint, đủ mọi thao tác." desc="Nối panel, script hoặc app của bạn vào cùng một kho dịch vụ: liệt kê dịch vụ, đặt và theo dõi đơn, yêu cầu bù, huỷ đơn và xem số dư — kèm API mua tài khoản Premium." />
          <div className="flex flex-wrap gap-2 mb-6">
            {["services", "add", "status", "orders", "cancel", "refill", "balance", "category", "buy", "history"].map((a) => (
              <code key={a} className="text-xs font-mono font-semibold bg-brand-50 text-brand-700 border border-brand-100 rounded-full px-3 py-1.5">action={a}</code>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            <div className="rounded-3xl bg-slate-950 text-slate-200 p-6 lg:col-span-3 overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs text-slate-400">order.sh — cURL, không cần cài thêm gì</span>
                <span className="text-[11px] font-mono text-emerald-400">200 · {"{ \"order\": 100482 }"}</span>
              </div>
              <pre className="font-mono text-xs sm:text-[13px] leading-relaxed overflow-x-auto">{`curl -X POST "https://yourpanel.vn/api/v2" \\
  -d "key=YOUR_API_KEY" \\
  -d "action=add" \\
  -d "service=1" \\
  -d "link=https://instagram.com/thuonghieu.vn" \\
  -d "quantity=1000"`}</pre>
              <p className="text-xs text-slate-400 mt-4 font-sans">Cũng gọi được y hệt bằng Node.js, Python, PHP, Go — chỉ là HTTP thuần, không phụ thuộc SDK riêng.</p>
            </div>
            <div className="card p-6 lg:col-span-2">
              <div className="font-bold text-slate-900 mb-4">Tham chiếu nhanh</div>
              <dl className="space-y-3 text-sm">
                {[
                  ["Endpoint", "POST /api/v2"],
                  ["Định dạng body", "form-encoded"],
                  ["Tra cứu hàng loạt", "status tối đa 100 đơn/lần"],
                  ["Lỗi trả về", "{ \"error\": \"...\" }"],
                  ["Tiền tệ", "VND, giá đã gồm chiết khấu cấp bậc"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-dashed border-slate-200 pb-2.5 last:border-0 last:pb-0">
                    <dt className="text-slate-500">{k}</dt><dd className="font-mono text-xs font-semibold text-slate-800 text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/api-docs" className="btn-primary w-full mt-5">Đọc tài liệu API đầy đủ</Link>
            </div>
          </div>
        </section>

        {/* ================= 06 — ĐẠI LÝ ================= */}
        <section id="dai-ly" className="bg-white border-y border-slate-200 scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 py-16 lg:py-20">
            <SectionHead no="06" label="Chương trình đại lý" title="Giá vốn rõ ràng, chiết khấu tự động theo cấp." desc="Không chỉ là một API key: cấp bậc càng cao giá càng tốt trên mọi đơn, và mọi biến động đều nằm trong sổ giao dịch của bạn." />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { t: "Chiết khấu theo cấp", d: "Đại lý −5%, Tổng đại lý −10%, VIP −15% — trừ tự động vào giá mọi đơn SMM, không cần mã giảm giá.", i: I.gem },
                { t: "API key riêng", d: "Mỗi tài khoản một key, tương thích Perfect Panel và hầu hết panel phổ biến. Đổi key bất cứ lúc nào.", i: I.key },
                { t: "Hai mảng, một số dư", d: "Cùng một ví cho cả SMM và Premium — bán chéo cho khách của bạn mà không phải nạp hai nơi.", i: I.wallet },
                { t: "Sổ sách minh bạch", d: "Mọi cộng/trừ — nạp, đặt đơn, hoàn tiền, điều chỉnh — đều có dòng ghi riêng để đối soát.", i: I.list },
              ].map((x) => (
                <div key={x.t} className="card p-6">
                  <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">{x.i}</span>
                  <div className="mt-4 font-bold text-slate-900">{x.t}</div>
                  <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{x.d}</p>
                </div>
              ))}
            </div>
            <div className="card mt-6 p-6 flex flex-col md:flex-row items-start md:items-center gap-5">
              <div className="flex-1">
                <div className="font-bold text-slate-900">Đã có {num(userCount)} tài khoản đang dùng {s.site_name}</div>
                <p className="text-sm text-slate-500 mt-1">Nâng cấp cấp bậc: nạp đều và liên hệ hỗ trợ qua ticket — xét duyệt trong ngày, áp dụng ngay cho đơn tiếp theo.</p>
              </div>
              <Link href="/register" className="btn-primary shrink-0">Đăng ký làm đại lý</Link>
            </div>
          </div>
        </section>

        {/* ================= 07 — NĂNG LỰC ================= */}
        <section className="max-w-7xl mx-auto px-4 py-16 lg:py-20">
          <SectionHead no="07" label="Năng lực" title="Làm cho người đăng bài mỗi ngày." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { t: "Đơn chạy trong vài giây", d: "Xử lý tự động 24/7 — đơn đã trả tiền không bao giờ phải chờ người duyệt.", i: I.clock },
              { t: "Bảo hành bù tự động", d: "Số tụt trong thời hạn bảo hành được bù lại; yêu cầu ngay trong chi tiết đơn.", i: I.shield },
              { t: "Không mật khẩu, bao giờ cũng vậy", d: "Mọi đơn chỉ dùng link công khai. Chúng tôi không bao giờ hỏi mật khẩu của bạn.", i: I.key },
              { t: "Giá sỉ trực tiếp", d: "Đấu thẳng nhà cung cấp, giá vốn công khai theo từng dịch vụ — không qua trung gian.", i: I.db },
              { t: "Hỗ trợ người thật", d: "Mở ticket bất cứ lúc nào và nói chuyện với người thật, không phải kịch bản.", i: I.ticket },
              { t: "Nạp tự động 24/7", d: "VietQR + webhook ngân hàng: chuyển đúng nội dung là tiền vào trong vài phút.", i: I.wallet },
            ].map((x) => (
              <div key={x.t} className="card p-6 hover:shadow-lg transition">
                <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">{x.i}</span>
                <div className="mt-4 font-bold text-slate-900">{x.t}</div>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{x.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ================= PREMIUM ================= */}
        <section className="bg-white border-y border-slate-200">
          <div className="max-w-7xl mx-auto px-4 py-16">
            <div className="flex items-end justify-between gap-4 mb-8">
              <div>
                <div className="text-xs font-black tracking-[0.18em] text-brand-600 mb-2">SHOP PREMIUM</div>
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

        {/* ================= 08 — FAQ ================= */}
        <section id="faq" className="max-w-4xl mx-auto px-4 py-16 lg:py-20 scroll-mt-20">
          <SectionHead no="08" label="FAQ" title="Câu hỏi về SMM panel, trả lời thẳng." center />
          <div className="space-y-3">
            {[
              { q: "SMM panel là gì?", a: "Là nền tảng để bạn đặt các dịch vụ tăng tương tác — follow, like, view, comment — cho tài khoản mạng xã hội, theo số lượng và trả theo lượt. Bạn chỉ cần link công khai; hệ thống lo phần còn lại." },
              { q: "Đơn bắt đầu chạy nhanh cỡ nào?", a: "Đơn dịch vụ API bắt đầu trong vài giây sau khi đặt. Tổng thời gian giao phụ thuộc dịch vụ và số lượng, và bạn theo dõi được tiến độ (số bắt đầu, số còn lại) theo thời gian thực." },
              { q: "Có cần mật khẩu tài khoản của tôi không?", a: "Không bao giờ. Mọi dịch vụ chạy từ link công khai như link trang cá nhân hay bài viết. Đừng chia sẻ mật khẩu của bạn cho bất kỳ ai." },
              { q: "Nạp tiền bằng cách nào?", a: "Chuyển khoản ngân hàng (quét VietQR) và MoMo. Chuyển đúng nội dung SMM + mã nạp của bạn, tiền được cộng tự động trong vài phút, 24/7; có thưởng theo mốc nạp nếu đang áp dụng." },
              { q: "Có API cho đại lý không?", a: "Có. API v2 cho phép liệt kê dịch vụ, đặt đơn, tra trạng thái (tối đa 100 đơn/lần), huỷ, yêu cầu bù và xem số dư — cộng thêm API mua tài khoản Premium theo chu kỳ." },
              { q: "Bù (refill) và huỷ hoạt động thế nào?", a: "Dịch vụ hỗ trợ được ghi rõ refill/cancel trong bảng giá. Yêu cầu bù ngay trong chi tiết đơn đã hoàn thành; huỷ đơn được hoàn tiền về số dư." },
              { q: "Đơn không hoàn thành thì sao?", a: "Phần chưa giao được hoàn tự động vào số dư — đơn giao thiếu, bị huỷ hay lỗi đều vậy. Hỗ trợ cũng có thể can thiệp qua ticket kèm mã đơn." },
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

        {/* ================= CTA ================= */}
        <section className="max-w-7xl mx-auto px-4 pb-6">
          <div className="rounded-3xl bg-brand-600 text-white px-6 py-14 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-25" style={{ background: "radial-gradient(500px 220px at 15% 0%, #ffffff55, transparent), radial-gradient(600px 260px at 90% 100%, #00000033, transparent)" }} />
            <div className="relative">
              <div className="text-xs font-black tracking-[0.18em] text-white/70 mb-3">BẮT ĐẦU</div>
              <h2 className="text-3xl lg:text-4xl font-black">Đưa {s.site_name} vào việc.</h2>
              <p className="text-white/85 mt-3 max-w-xl mx-auto text-sm lg:text-base">Tạo tài khoản miễn phí, nạp thử từ 10.000đ và đặt đơn đầu tiên trong vài phút. API key của bạn đang chờ sẵn trong bảng điều khiển.</p>
              <div className="flex flex-wrap justify-center gap-3 mt-7">
                <Link href="/register" className="btn bg-white text-brand-700 hover:bg-brand-50 !px-6 !py-3.5 !text-base font-bold">Tạo tài khoản miễn phí</Link>
                <Link href="/login" className="btn bg-white/15 text-white hover:bg-white/25 !px-6 !py-3.5 !text-base">Đăng nhập</Link>
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

function SectionHead({ no, label, title, desc, center }: { no: string; label: string; title: string; desc?: string; center?: boolean }) {
  return (
    <div className={`mb-10 ${center ? "text-center" : ""}`}>
      <div className="text-xs font-black tracking-[0.18em] text-brand-600">{no} — {label.toUpperCase()}</div>
      <h2 className="text-2xl lg:text-4xl font-extrabold text-slate-900 mt-2.5 leading-tight">{title}</h2>
      {desc && <p className={`text-slate-500 mt-3 leading-relaxed ${center ? "mx-auto" : ""} max-w-2xl`}>{desc}</p>}
    </div>
  );
}
