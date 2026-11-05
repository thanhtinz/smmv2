import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SiteHeader, SiteFooter } from "@/components/site";
import { Flash, I, PLATFORM_COLORS, SectionHead, HeroStat } from "@/components/ui";
import { ServicesExplorer, type ServiceDTO } from "@/components/client";
import { vnd, num, PLATFORMS } from "@/lib/format";

export const dynamic = "force-dynamic";

/* Landing của panel con — dùng NGUYÊN khung landing của web mẹ (hero 2 cột + mockup,
   ticker nền tảng, các mục đánh số 01–08 với SectionHead chung, dải trắng xen kẽ,
   nhịp py-16 lg:py-20 đều nhau) — chỉ thay thương hiệu, giá và số liệu của panel. */

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

export default async function PanelStorefront({ params, searchParams }: { params: { slug: string }; searchParams: { msg?: string; err?: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const { getSettings } = await import("@/lib/settings");
  if ((await getSettings()).module_panels === "0") notFound();
  const panelRate = (r: number) => Math.round(r * (1 + panel.markup / 100));
  const [services, categories, memberCount, panelOrderCount, premiums] = await Promise.all([
    prisma.smmService.findMany({ where: { active: true }, include: { category: true }, orderBy: [{ categoryId: "asc" }, { sort: "asc" }, { id: "asc" }] }),
    prisma.smmCategory.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    prisma.user.count({ where: { panelId: panel.id } }),
    prisma.smmOrder.count({ where: { panelId: panel.id } }),
    prisma.premiumProduct.findMany({ where: { active: true }, take: 4, orderBy: { sort: "asc" }, include: { variants: { where: { active: true }, orderBy: { price: "asc" }, take: 1 } } }),
  ]);
  const dto: ServiceDTO[] = services.map((s) => ({
    id: s.id, name: s.name, description: s.description,
    rate: panelRate(s.rate),
    min: s.min, max: s.max, avgTime: s.avgTime, refill: s.refill, dripfeed: s.dripfeed,
    categoryId: s.categoryId, categoryName: s.category.name, platform: s.category.platform,
  }));
  const platformStats = Object.values(
    services.reduce<Record<string, { platform: string; count: number; from: number }>>((acc, sv) => {
      const p = sv.category.platform;
      if (!acc[p]) acc[p] = { platform: p, count: 0, from: panelRate(sv.rate) };
      acc[p].count += 1;
      acc[p].from = Math.min(acc[p].from, panelRate(sv.rate));
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count);
  const catsByPlatform = new Map<string, string[]>();
  for (const c of categories) {
    const arr = catsByPlatform.get(c.platform) || [];
    arr.push(c.name.replace(/^(Facebook|TikTok|Instagram|YouTube|Telegram|Shopee)\s*/i, ""));
    catsByPlatform.set(c.platform, arr);
  }
  const registerHref = `/cua-hang/${panel.slug}/dang-ky`;
  const tiers = [
    { name: "Thành viên", disc: panel.discountMember, note: "Mặc định khi đăng ký tại panel", icon: I.users },
    { name: "Đại lý", disc: panel.discountReseller, note: "Cho khách chạy thường xuyên", icon: I.gem },
    { name: "Tổng đại lý", disc: panel.discountAgency, note: "Cho khách số lượng lớn", icon: I.server },
    { name: "VIP", disc: panel.discountVip, note: "Giá tốt nhất của panel", icon: I.shield },
  ];

  return (
    <div data-accent={panel.accent} className="min-h-screen flex flex-col">
      <SiteHeader />
      {panel.announcement && (
        <div className="bg-brand-600 text-white text-center text-sm font-medium px-4 py-2.5">{panel.announcement}</div>
      )}
      <main className="flex-1">
        {/* ================= HERO ================= */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 hero-bg" />
          <div className="max-w-7xl mx-auto px-4 pt-16 lg:pt-24 pb-10 relative grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <div>
              <Flash msg={searchParams.msg} err={searchParams.err} />
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-100 text-brand-700 px-3 py-1.5 text-[11px] font-bold tracking-[0.14em]">{panel.name.toUpperCase()} · SMM PANEL · TÀI KHOẢN PREMIUM</span>
              <h1 className="text-5xl lg:text-7xl font-black leading-[1.04] tracking-tight mt-6 text-slate-900">
                Tăng trưởng kênh,<br />chuẩn <span className="text-brand-600">hệ thống.</span>
              </h1>
              <p className="text-slate-500 mt-6 leading-relaxed max-w-lg text-base lg:text-lg">
                {panel.tagline || `${panel.name} cung cấp dịch vụ tăng like, follow, view, comment cho Facebook, TikTok, Instagram, YouTube... cùng shop tài khoản Premium — một số dư, đấu API trực tiếp nhà cung cấp, theo dõi mọi đơn theo thời gian thực.`}
              </p>
              <div className="flex flex-wrap gap-3 mt-8">
                <Link href={registerHref} className="btn-primary !px-6 !py-3.5 !text-base">Tạo tài khoản miễn phí</Link>
                <Link href="#dich-vu" className="btn-ghost !px-6 !py-3.5 !text-base">Khám phá dịch vụ</Link>
              </div>
              <ul className="flex flex-wrap gap-x-5 gap-y-2 mt-8 text-sm font-medium text-slate-600">
                {["API v2 chuẩn panel", "Hoàn tiền tự động", "Bảo hành bù (refill)", "Nạp VietQR tự động"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><span className="text-emerald-600">{I.check}</span>{t}</li>
                ))}
              </ul>
              <div className="grid grid-cols-3 gap-4 mt-10 max-w-md text-center">
                <HeroStat v={num(services.length) + "+"} l="Dịch vụ SMM" />
                <HeroStat v={num(memberCount)} l="Khách của panel" />
                <HeroStat v={num(panelOrderCount) + "+"} l="Đơn qua panel" />
              </div>
              {panel.support && <p className="text-xs text-slate-400 mt-5">Hỗ trợ của panel: <b className="text-slate-500">{panel.support}</b></p>}
            </div>

            {/* Mockup điện thoại + thẻ nổi (minh hoạ) */}
            <div className="relative mx-auto w-full max-w-[420px]">
              <div className="relative mx-auto w-[290px] rounded-[2.6rem] border-[10px] border-slate-900 bg-white shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-3 text-[11px] font-semibold text-slate-500">
                  <span>9:41</span><span className="w-16 h-4 bg-slate-900 rounded-full -mt-1" /><span>5G</span>
                </div>
                <div className="flex items-center gap-2.5 px-4 pt-3">
                  <span className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center font-black text-sm">{panel.name.charAt(0).toUpperCase()}</span>
                  <div>
                    <div className="text-sm font-bold text-slate-900 leading-none">{panel.domain || panel.slug}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Được tài trợ</div>
                  </div>
                </div>
                <div className="mx-4 mt-3 h-44 rounded-2xl relative overflow-hidden" style={{ background: "linear-gradient(135deg, rgb(var(--b400)), rgb(var(--b700)))" }}>
                  <span className="absolute inset-0 flex items-center justify-center text-white/25 font-black text-6xl">{panel.name.charAt(0).toUpperCase()}</span>
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
          <SectionHead no="01" label="Dịch vụ" title="Một panel cho mọi nền tảng bạn đang chạy." desc={`Chọn nền tảng để xem dịch vụ thật đang bán ngay lúc này tại ${panel.name} — giá đã gồm phụ phí của panel, giới hạn và thời gian đều công khai.`} />
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
                <a href="#bang-gia" className="btn-ghost btn-sm w-full mt-5 !py-2.5">Xem bảng giá {PLATFORMS[p.platform] || p.platform}</a>
              </div>
            ))}
          </div>
          <div id="bang-gia" className="mt-12 scroll-mt-24">
            <div className="font-extrabold text-xl text-slate-900 mb-1.5">Bảng giá chi tiết</div>
            <p className="text-sm text-slate-500 mb-6">Giá tính trên 1.000 lượt tại {panel.name}. Đăng ký miễn phí để đặt đơn; khách được nâng bậc sẽ có giá rẻ hơn nữa (xem mục 06).</p>
            <ServicesExplorer services={dto} registerHref={registerHref} />
          </div>
        </section>

        {/* ================= 02 — QUY TRÌNH ================= */}
        <section id="quy-trinh" className="bg-white border-y border-slate-200 scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 py-16 lg:py-20">
            <SectionHead no="02" label="Quy trình" title="Bốn bước từ đăng ký tới đơn đầu tiên." />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { t: "Tạo tài khoản", d: `Đăng ký ngay tại ${panel.name} bằng email trong chưa đầy một phút. Không cần thẻ, không cam kết.`, i: I.users },
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
          <SectionHead no="05" label="API cho đại lý" title="Một endpoint, đủ mọi thao tác." desc={`Tài khoản tại ${panel.name} có sẵn API key riêng: nối panel, script hoặc app của bạn vào cùng một kho dịch vụ — liệt kê dịch vụ, đặt và theo dõi đơn, yêu cầu bù, huỷ đơn, xem số dư và mua tài khoản Premium.`} />
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
                  ["Tiền tệ", "VND, giá theo cấp bậc của bạn"],
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

        {/* ================= 06 — CẤP BẬC ================= */}
        <section id="cap-bac" className="bg-white border-y border-slate-200 scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 py-16 lg:py-20">
            <SectionHead no="06" label="Cấp bậc khách" title={`Giá riêng theo từng cấp bậc tại ${panel.name}.`} desc="Bốn cấp bậc khách của panel — giảm thêm trên giá panel, và một số dịch vụ có giá cố định riêng cho từng bậc. Chủ panel nâng bậc cho khách quen ngay trong trang quản lý." />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {tiers.map((t) => (
                <div key={t.name} className="card p-6">
                  <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">{t.icon}</span>
                  <div className="mt-4 text-sm font-bold text-slate-400 uppercase tracking-wide">{t.name}</div>
                  <div className="mt-1.5 text-3xl font-black text-brand-700">{t.disc > 0 ? `−${t.disc}%` : "Giá panel"}</div>
                  <p className="text-sm text-slate-500 mt-2 leading-relaxed">{t.note}</p>
                </div>
              ))}
            </div>
            <div className="card mt-6 p-6 flex flex-col md:flex-row items-start md:items-center gap-5">
              <div className="flex-1">
                <div className="font-bold text-slate-900">Đã có {num(memberCount)} khách đang mua tại {panel.name}</div>
                <p className="text-sm text-slate-500 mt-1">Đăng ký tài khoản tại panel để bắt đầu ở bậc Thành viên — mua đều là được chủ panel xét nâng bậc, giá tốt hơn áp dụng ngay cho đơn tiếp theo.</p>
              </div>
              <Link href={registerHref} className="btn-primary shrink-0">Đăng ký tại {panel.name}</Link>
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
              { t: "Drip-feed — thả nhỏ giọt", d: "Chia đơn thành nhiều lượt thả đều theo phút để số tăng tự nhiên như người thật.", i: I.clock },
              { t: "Đặt hàng loạt", d: "Dán cả danh sách đơn một lần — hệ thống kiểm tra từng dòng, tính tổng trước khi chạy.", i: I.list },
              { t: "Giá theo cấp bậc", d: `Khách của ${panel.name} được giảm theo bậc và có giá riêng từng dịch vụ theo bậc — xem mục 06.`, i: I.gem },
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
                <p className="text-slate-500 mt-2">Dùng chung tài khoản {panel.name} để mua — kho tự động giao ngay, gói chính chủ bảo hành đầy đủ.</p>
              </div>
              <Link href={`/cua-hang/${panel.slug}/premium`} className="btn-ghost shrink-0">Xem tất cả</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {premiums.map((p) => (
                <Link key={p.id} href={`/cua-hang/${panel.slug}/premium/${p.slug}`} className="card p-6 hover:shadow-lg transition group">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl" style={{ background: p.color }}>{p.name.charAt(0)}</div>
                  <div className="font-bold text-slate-900 mt-4 group-hover:text-brand-700">{p.name}</div>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{p.tagline}</p>
                  {p.variants[0] && <div className="mt-4 text-sm">Chỉ từ <span className="font-extrabold text-brand-700 text-base">{vnd(Math.round(p.variants[0].price * (1 + panel.markup / 100)))}</span></div>}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ================= 08 — FAQ ================= */}
        <section id="faq" className="max-w-4xl mx-auto px-4 py-16 lg:py-20 scroll-mt-20">
          <SectionHead no="08" label="FAQ" title={`Câu hỏi về ${panel.name}, trả lời thẳng.`} center />
          <div className="space-y-3">
            {[
              { q: `Đăng ký tại ${panel.name} khác gì đăng ký ở web mẹ?`, a: `Tài khoản tạo tại đây thuộc về ${panel.name}: bạn mua theo bảng giá của panel này (đã gồm phụ phí của chủ panel) và được hưởng giá theo cấp bậc mà panel quy định. Ví, đơn hàng và API key vẫn dùng chung trên toàn hệ thống.` },
              { q: "Tôi có phải đưa mật khẩu mạng xã hội không?", a: "Không bao giờ. Mọi dịch vụ chỉ chạy bằng link công khai của trang/bài viết/video." },
              { q: "Nạp tiền như thế nào?", a: "Sau khi đăng ký, vào mục Nạp tiền trong khu khách hàng để lấy thông tin chuyển khoản — chuyển đúng nội dung là tiền vào ví tự động trong vài phút, 24/7." },
              { q: "Giá theo cấp bậc hoạt động ra sao?", a: `${panel.name} có 4 cấp bậc khách: Thành viên, Đại lý, Tổng đại lý và VIP. Chủ panel sẽ nâng bậc cho khách quen — bậc càng cao giá càng rẻ theo bảng giá cấp bậc ở mục 06, chưa kể một số dịch vụ có giá cố định riêng cho từng bậc.` },
              { q: "Đơn chạy trong bao lâu?", a: "Tuỳ dịch vụ, thời gian dự kiến ghi ngay ở từng dòng trong bảng giá. Đa số đơn bắt đầu trong vài phút sau khi đặt và theo dõi được tiến độ theo thời gian thực." },
              { q: "Số bị tụt có được bù không?", a: "Dịch vụ gắn nhãn bảo hành sẽ được bù (refill) khi số tụt trong thời hạn bảo hành của gói — yêu cầu ngay trong chi tiết đơn." },
              { q: "Đơn không hoàn thành thì sao?", a: "Phần chưa giao được hoàn tự động vào số dư — đơn giao thiếu, bị huỷ hay lỗi đều vậy." },
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
              <h2 className="text-3xl lg:text-4xl font-black">Đưa {panel.name} vào việc.</h2>
              <p className="text-white/85 mt-3 max-w-xl mx-auto text-sm lg:text-base">Tạo tài khoản miễn phí, nạp thử từ 10.000đ và đặt đơn đầu tiên trong vài phút. API key của bạn đang chờ sẵn trong bảng điều khiển.</p>
              <div className="flex flex-wrap justify-center gap-3 mt-7">
                <Link href={registerHref} className="btn bg-white text-brand-700 hover:bg-brand-50 !px-6 !py-3.5 !text-base font-bold">Tạo tài khoản miễn phí</Link>
                <Link href="/login" className="btn bg-white/15 text-white hover:bg-white/25 !px-6 !py-3.5 !text-base">Đăng nhập</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter brand={{ name: panel.name, tagline: panel.tagline, zalo: panel.supportZalo, telegram: panel.supportTelegram, facebook: panel.supportFacebook, hotline: panel.supportHotline }} />
    </div>
  );
}
