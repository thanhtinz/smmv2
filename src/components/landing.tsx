import Link from "next/link";
import { I } from "@/components/ui";
import { PublicBurger } from "@/components/public-burger";
import { NotificationBell } from "@/components/notification-bell";
import { vnd, num, PLATFORMS } from "@/lib/format";

/**
 * Landing tối dùng chung cho web mẹ và website panel con (hai nơi hiển thị giống hệt nhau,
 * chỉ khác thương hiệu, giá và liên kết). Nội dung số liệu do từng trang tự tính từ dữ liệu thật.
 */
export type LandingPlatform = { platform: string; count: number; from: number; points: string[] };
export type LandingPremium = { name: string; tagline?: string | null; from: number; href: string };

export function LandingView(props: {
  brandName: string;
  tagline?: string | null;
  headline?: string | null;
  loggedIn: boolean;
  stats: { services: number; premium: number; orders: number; users: number; completion: number };
  platforms: LandingPlatform[];
  premiums: LandingPremium[];
  sampleService?: string | null;
  links: { login: string; register: string; dashboard: string; order: string; services: string; api: string };
  showSmm?: boolean;
  showPremium?: boolean;
  announcement?: string | null;
  footer: React.ReactNode;
}) {
  const { brandName, stats, platforms, premiums, links } = props;
  const showSmm = props.showSmm !== false;
  const showPremium = props.showPremium !== false;
  const badgeFor = (p: string, i: number) => (i === 0 ? "Phổ biến" : p === "tiktok" ? "Xu hướng" : p === "instagram" ? "Cao cấp" : "Đại lý");
  return (
    <div className="min-h-screen bg-[#07090d] text-slate-300 antialiased">
      {/* ===== Header nổi dạng pill ===== */}
      <div className="fixed inset-x-0 top-3 z-50 px-3 sm:top-4">
        <header className="mx-auto flex max-w-5xl items-center gap-2 rounded-full border border-white/10 bg-black/60 py-2 pl-2 pr-2 shadow-2xl shadow-black/40 backdrop-blur-xl sm:gap-4 sm:pl-3">
          <PublicBurger tone="dark" home="/" loggedIn={props.loggedIn} registerHref={links.register} items={[{ href: "#tinh-nang", label: "Tính năng" }, { href: "#dich-vu", label: "Dịch vụ" }, { href: "#quy-trinh", label: "Quy trình" }, { href: links.api, label: "Tài liệu API" }, { href: "#faq", label: "Hỏi đáp" }, { href: links.services, label: "Bảng giá" }, { href: links.order, label: "Đặt đơn SMM" }]} />
          <Link href={links.order === "/dashboard/dat-hang" ? "/" : "#"} className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-sm font-black text-white">{brandName.charAt(0).toUpperCase()}</span>
            <span className="max-w-[150px] truncate text-[15px] font-extrabold tracking-tight text-white">{brandName}</span>
          </Link>
          <nav className="mx-auto hidden items-center gap-6 text-sm font-medium text-slate-300 lg:flex">
            <a href="#tinh-nang" className="transition hover:text-white">Tính năng</a>
            <a href="#dich-vu" className="transition hover:text-white">Dịch vụ</a>
            <a href="#quy-trinh" className="transition hover:text-white">Quy trình</a>
            <Link href={links.api} className="transition hover:text-white">Tài liệu API</Link>
            <a href="#faq" className="transition hover:text-white">Hỏi đáp</a>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            {props.loggedIn && <NotificationBell tone="dark" />}
            {props.loggedIn ? (
              <Link href={links.dashboard} className="inline-block rounded-full bg-rose-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-500">Bảng điều khiển →</Link>
            ) : (
              <Link href={links.login} className="inline-block rounded-full bg-rose-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-500">Đăng nhập →</Link>
            )}
          </div>
        </header>
      </div>

      {props.announcement && (
        <div className="bg-rose-600/90 px-4 pb-2 pt-20 text-center text-sm font-medium text-white">{props.announcement}</div>
      )}

      <main>
        {/* ===== Hero ===== */}
        <section className="relative overflow-hidden px-4 pb-16 pt-32 sm:pt-36">
          <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-rose-600/15 blur-[130px]" />
          <div className="relative mx-auto max-w-4xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-rose-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> Hệ thống đang hoạt động 24/7
            </span>
            <h1 className="mt-6 text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-6xl">
              {props.headline ? props.headline : <>Tăng trưởng mạng xã hội,<br className="hidden sm:block" /> nhanh và gọn hơn.</>}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              {props.tagline || "Một bảng điều khiển cho mọi dịch vụ tăng tương tác Facebook, TikTok, Instagram, YouTube, Telegram — đặt đơn là chạy, theo dõi tiến độ theo thời gian thực, nạp tiền tự động."}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href={props.loggedIn ? links.dashboard : links.register} className="rounded-full bg-rose-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-500">
                {props.loggedIn ? "Vào bảng điều khiển →" : "Bắt đầu ngay hôm nay →"}
              </Link>
              <a href="#dich-vu" className="rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-white/10">Khám phá bảng giá</a>
            </div>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[13px] font-medium text-slate-400">
              <span className="inline-flex items-center gap-1.5">{I.check} Kích hoạt tự động 24/7</span>
              <span className="inline-flex items-center gap-1.5">{I.check} Không cần mật khẩu</span>
              <span className="inline-flex items-center gap-1.5">{I.check} Nạp tiền cộng trong vài phút</span>
              <span className="inline-flex items-center gap-1.5">{I.check} Hỗ trợ qua ticket mỗi ngày</span>
            </div>
          </div>

          {/* Console minh hoạ */}
          <div className="relative mx-auto mt-14 max-w-4xl">
            <div className="absolute -left-4 -top-12 z-10 hidden -rotate-3 rounded-2xl border border-white/10 bg-[#10131a] px-4 py-3 shadow-xl sm:block">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Đơn hoàn thành</div>
              <div className="text-lg font-extrabold text-white">{num(stats.orders)}+</div>
            </div>
            <div className="absolute -bottom-5 -right-3 z-10 hidden rotate-2 rounded-2xl border border-white/10 bg-[#10131a] px-4 py-3 shadow-xl sm:block">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-400" /> API v2 sẵn sàng</div>
              <div className="mt-0.5 text-sm font-bold text-white">Đồng bộ trạng thái tự động</div>
            </div>
            <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[#0c0f16] shadow-2xl shadow-black/60">
              <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3.5">
                <span className="h-3 w-3 rounded-full bg-rose-500/80" /><span className="h-3 w-3 rounded-full bg-amber-400/80" /><span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                <span className="ml-3 text-xs font-semibold tracking-wide text-slate-400">{brandName} Console · Điều phối đơn hàng</span>
                <span className="ml-auto rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-400">ONLINE</span>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-[1fr_220px]">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
                  <div className="flex flex-wrap gap-2">
                    {showSmm && platforms.slice(0, 5).map((p, i) => (
                      <span key={p.platform} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${i === 0 ? "bg-rose-600 text-white" : "bg-white/5 text-slate-300"}`}>
                        {(PLATFORMS as any)[p.platform] || p.platform}{i < 2 ? " · HOT" : ""}
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Đơn đang điều phối</div>
                  <div className="mt-1.5 truncate text-base font-bold text-white">{props.sampleService || "Dịch vụ tăng tương tác"}</div>
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[86%] rounded-full bg-gradient-to-r from-rose-500 to-rose-400" /></div>
                  <div className="mt-2.5 flex justify-between text-xs text-slate-400"><span>Tiến độ giao</span><span className="font-semibold text-slate-200">86%</span></div>
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
                    <span>Bù tự động khi tụt số</span><span>Trạng thái cập nhật liên tục</span>
                  </div>
                </div>
                <div className="grid grid-rows-3 gap-4">
                  {[
                    { v: num(stats.services) + "+", l: "Dịch vụ SMM đang bán" },
                    { v: num(stats.premium) + "+", l: "Sản phẩm Premium" },
                    { v: stats.completion + "%", l: "Tỉ lệ đơn hoàn thành" },
                  ].map((t) => (
                    <div key={t.l} className="flex flex-col justify-center rounded-2xl border border-white/5 bg-white/[0.03] px-5 py-3">
                      <div className="text-xl font-extrabold text-white">{t.v}</div>
                      <div className="text-xs text-slate-400">{t.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Tính năng ===== */}
        <section id="tinh-nang" className="mx-auto max-w-7xl scroll-mt-28 px-4 py-16 lg:py-20">
          <div className="mb-10 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Giá trị cốt lõi</div>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Xây để chạy nhanh và ít phải chờ.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-400">Mọi khâu từ đặt đơn, nạp tiền tới bảo hành đều tự động hoá — bạn chỉ cần dán link và theo dõi.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-7">
              <div className="text-xs font-bold uppercase tracking-widest text-rose-400">Tốc độ xử lý</div>
              <h3 className="mt-2 text-2xl font-extrabold text-white">Đơn khởi động gần như tức thì.</h3>
              <p className="mt-3 leading-relaxed text-slate-400">Đơn dịch vụ qua API được đẩy sang nhà cung cấp ngay khi đặt và đồng bộ tiến độ liên tục — số đã chạy, số còn lại luôn xem được trong chi tiết đơn.</p>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-white/[0.04] p-4"><div className="text-2xl font-extrabold text-white">24/7</div><div className="text-sm text-slate-400">Hệ thống chạy không nghỉ</div></div>
                <div className="rounded-2xl bg-white/[0.04] p-4"><div className="text-2xl font-extrabold text-white">{num(stats.orders)}+</div><div className="text-sm text-slate-400">Đơn đã qua hệ thống</div></div>
              </div>
            </div>
            <div className="grid gap-4">
              {[
                { t: "Theo dõi & bảo hành rõ ràng", d: "Tiến độ từng đơn minh bạch; dịch vụ hỗ trợ bù (refill) được ghi ngay trong bảng giá, tụt số là yêu cầu bù ngay trong trang đơn.", icon: I.shield },
                { t: "Đấu nối API cho đại lý", d: "API v2 chuẩn panel: liệt kê dịch vụ, đặt đơn, tra trạng thái hàng loạt, huỷ và yêu cầu bù — cộng API mua Premium riêng.", icon: I.key },
                { t: "An toàn cho tài khoản của bạn", d: "Chỉ cần link công khai — không bao giờ hỏi mật khẩu. Mọi biến động số dư đều có sổ giao dịch tra cứu được.", icon: I.check },
              ].map((c) => (
                <div key={c.t} className="flex gap-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-600/15 text-rose-400">{c.icon}</span>
                  <div>
                    <div className="font-bold text-white">{c.t}</div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{c.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Dịch vụ theo nền tảng ===== */}
        {(showSmm || (showPremium && premiums.length > 0)) && (<section id="dich-vu" className="mx-auto max-w-7xl scroll-mt-28 px-4 py-16 lg:py-20">
          <div className="mb-10 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Dịch vụ toàn diện</div>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Mọi nền tảng lớn trong một nơi.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-slate-400">Giá dưới đây lấy trực tiếp từ dịch vụ đang bán — bấm vào nền tảng để xem toàn bộ bảng giá.</p>
          </div>
          {showSmm && (<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {platforms.slice(0, 4).map((p, i) => (
              <div key={p.platform} className="flex flex-col rounded-[24px] border border-white/10 bg-white/[0.04] p-6">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-extrabold text-white">{(PLATFORMS as any)[p.platform] || p.platform}</span>
                  <span className="rounded-full bg-rose-600/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-300">{badgeFor(p.platform, i)}</span>
                </div>
                <div className="mt-1 text-sm text-slate-500">{num(p.count)} dịch vụ đang bán</div>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-300">
                  {p.points.slice(0, 3).map((pt) => (
                    <li key={pt} className="flex items-start gap-2"><span className="mt-0.5 text-emerald-400">{I.check}</span><span className="line-clamp-1">{pt}</span></li>
                  ))}
                </ul>
                <div className="mt-5 border-t border-white/5 pt-4">
                  <div className="text-xs text-slate-500">Chỉ từ</div>
                  <div className="flex items-end justify-between">
                    <span className="text-xl font-extrabold text-white">{vnd(p.from)}<span className="text-sm font-medium text-slate-400"> / 1000</span></span>
                    <Link href={links.services} className="text-sm font-bold text-rose-400 transition hover:text-rose-300">Đặt đơn →</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>)}
          {showPremium && premiums.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {premiums.slice(0, 4).map((pr) => (
                <Link key={pr.name} href={pr.href} className="group rounded-[24px] border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 transition hover:border-rose-500/40">
                  <div className="flex items-center gap-2 text-rose-300">{I.gem}<span className="text-[11px] font-bold uppercase tracking-widest">Premium</span></div>
                  <div className="mt-2 truncate font-bold text-white">{pr.name}</div>
                  <div className="mt-0.5 line-clamp-1 text-sm text-slate-400">{pr.tagline || "Tài khoản bản quyền chính hãng"}</div>
                  <div className="mt-3 text-sm text-slate-300">Chỉ từ <b className="text-white">{vnd(pr.from)}</b></div>
                </Link>
              ))}
            </div>
          )}
        </section>)}

        {/* ===== Quy trình + dải số liệu ===== */}
        <section id="quy-trinh" className="scroll-mt-28 border-y border-white/5 bg-white/[0.02] px-4 py-16 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 text-center">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Quy trình gọn</div>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Ba bước là đơn bắt đầu chạy.</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { n: "01", t: "Tạo tài khoản", d: "Đăng ký bằng tên đăng nhập và email — không cần xác thực rườm rà, vào là dùng được ngay." },
                { n: "02", t: "Nạp số dư tự động", d: "Quét VietQR ngân hàng hoặc MoMo, chuyển đúng nội dung — tiền cộng tự động trong vài phút, kể cả ngoài giờ." },
                { n: "03", t: "Đặt đơn & theo dõi", d: "Chọn dịch vụ, dán link, đặt đơn. Tiến độ, số đã chạy và bảo hành đều xem ngay trong trang đơn." },
              ].map((s) => (
                <div key={s.n} className="rounded-[24px] border border-white/10 bg-[#0c0f16] p-7">
                  <div className="text-sm font-black tracking-widest text-rose-500">{s.n}</div>
                  <div className="mt-2 text-lg font-extrabold text-white">{s.t}</div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.d}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 grid grid-cols-2 gap-6 text-center lg:grid-cols-4">
              {[
                { v: stats.completion + "%", l: "Tỉ lệ đơn hoàn thành" },
                { v: num(stats.orders) + "+", l: "Đơn hàng đã xử lý" },
                { v: num(stats.users) + "+", l: "Khách hàng & đại lý" },
                { v: num(stats.services) + "+", l: "Dịch vụ đang phục vụ" },
              ].map((x) => (
                <div key={x.l}>
                  <div className="text-3xl font-black text-white sm:text-4xl">{x.v}</div>
                  <div className="mt-1 text-sm text-slate-500">{x.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Đối tượng ===== */}
        <section className="mx-auto max-w-7xl px-4 py-16 lg:py-20">
          <div className="mb-10 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Đối tượng phù hợp</div>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Ai cũng có cách dùng hiệu quả.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { t: "Chủ shop & người bán hàng", d: "Tăng độ tin cậy cho fanpage và bài bán hàng, giữ nhịp tương tác đều mà không tốn chi phí quảng cáo lớn.", icon: I.cart },
              { t: "Nhà sáng tạo nội dung", d: "Đẩy kênh TikTok, YouTube, Instagram trong giai đoạn đầu — lúc thuật toán cần tín hiệu tương tác nhất.", icon: I.megaphone },
              { t: "Đại lý & đội nhóm SMM", d: "Giá tốt dần theo cấp bậc, API đấu nối vào hệ thống riêng, và mở được website con mang thương hiệu của bạn.", icon: I.users },
            ].map((c) => (
              <div key={c.t} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-600/15 text-rose-400">{c.icon}</span>
                <div className="mt-4 text-lg font-extrabold text-white">{c.t}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <section id="faq" className="mx-auto max-w-4xl scroll-mt-28 px-4 py-16 lg:py-20">
          <div className="mb-10 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Hỏi đáp thường gặp</div>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Giải đáp nhanh trước khi bắt đầu.</h2>
          </div>
          <div className="space-y-3">
            {[
              { q: "SMM panel là gì?", a: "Là nền tảng để bạn đặt các dịch vụ tăng tương tác — follow, like, view, comment — cho tài khoản mạng xã hội, theo số lượng và trả theo lượt. Bạn chỉ cần link công khai; hệ thống lo phần còn lại." },
              { q: "Đơn bắt đầu chạy nhanh cỡ nào?", a: "Đơn dịch vụ API bắt đầu trong vài giây sau khi đặt. Tổng thời gian giao phụ thuộc dịch vụ và số lượng, và bạn theo dõi được tiến độ (số bắt đầu, số còn lại) theo thời gian thực." },
              { q: "Có cần mật khẩu tài khoản của tôi không?", a: "Không bao giờ. Mọi dịch vụ chạy từ link công khai như link trang cá nhân hay bài viết. Đừng chia sẻ mật khẩu của bạn cho bất kỳ ai." },
              { q: "Nạp tiền bằng cách nào?", a: "Chuyển khoản ngân hàng (quét VietQR) và MoMo. Chuyển đúng nội dung SMM + mã nạp của bạn, tiền được cộng tự động trong vài phút, 24/7; có thưởng theo mốc nạp nếu đang áp dụng." },
              { q: "Bù (refill) và huỷ hoạt động thế nào?", a: "Dịch vụ hỗ trợ được ghi rõ refill/cancel trong bảng giá. Yêu cầu bù ngay trong chi tiết đơn đã hoàn thành; huỷ đơn được hoàn tiền về số dư." },
              { q: "Có API cho đại lý không?", a: "Có. API v2 cho phép liệt kê dịch vụ, đặt đơn, tra trạng thái (tối đa 100 đơn/lần), huỷ, yêu cầu bù và xem số dư — cộng thêm API mua tài khoản Premium theo chu kỳ." },
            ].map((f) => (
              <details key={f.q} className="group rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-100">
                  {f.q}
                  <span className="shrink-0 text-xl leading-none text-rose-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2.5 text-sm leading-relaxed text-slate-400">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ===== CTA cuối ===== */}
        <section className="mx-auto max-w-7xl px-4 pb-20">
          <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#12060a] px-6 py-16 text-center">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-600/25 blur-[110px]" />
            <div className="relative">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-rose-300">Bắt đầu ngay hôm nay</div>
              <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-black tracking-tight text-white sm:text-4xl">Sẵn sàng tăng trưởng kênh của bạn?</h2>
              <p className="mx-auto mt-3 max-w-xl text-slate-400">Tạo tài khoản miễn phí, nạp số dư tự động và đặt đơn đầu tiên trong chưa đầy một phút.</p>
              <Link href={props.loggedIn ? links.dashboard : links.register} className="mt-8 inline-block rounded-full bg-rose-600 px-8 py-4 text-sm font-bold text-white shadow-lg shadow-rose-600/40 transition hover:bg-rose-500">
                {props.loggedIn ? "Vào bảng điều khiển →" : "Tạo tài khoản miễn phí →"}
              </Link>
            </div>
          </div>
        </section>
      </main>
      {props.footer}
    </div>
  );
}
